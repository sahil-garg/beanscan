/**
 * protobuf.js — Hand-rolled BeanProto encoder + Beanconqueror deep link
 *
 * Encodes form data into the protobuf wire format, base64-encodes it,
 * splits into 400-char chunks, and returns the beanconqueror.com share URL.
 *
 * No external dependencies. Wire format reference:
 * https://protobuf.dev/programming-guides/encoding/
 */

const ProtobufModule = (() => {

  // ── Wire format primitives ──────────────────────────────────────

  // Encode a non-negative integer as a protobuf varint (little-endian, 7 bits/byte)
  function encodeVarint(n) {
    const bytes = [];
    n = Math.floor(n);
    do {
      let b = n % 128;          // low 7 bits
      n = Math.floor(n / 128);  // shift right 7
      if (n > 0) b |= 0x80;    // set continuation bit
      bytes.push(b);
    } while (n > 0);
    return new Uint8Array(bytes);
  }

  function concat(...arrays) {
    const total = arrays.reduce((s, a) => s + a.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const a of arrays) { out.set(a, off); off += a.length; }
    return out;
  }

  // Length-delimited field (wire type 2): strings, bytes, embedded messages
  function ldField(fieldNum, bytes) {
    if (!bytes || bytes.length === 0) return new Uint8Array(0);
    return concat(
      encodeVarint((fieldNum << 3) | 2),
      encodeVarint(bytes.length),
      bytes,
    );
  }

  // Varint field (wire type 0): ints, enums, bools
  function varintField(fieldNum, value) {
    const n = Number(value);
    if (!n) return new Uint8Array(0);  // skip 0 (proto3 default)
    return concat(
      encodeVarint((fieldNum << 3) | 0),
      encodeVarint(n),
    );
  }

  // Bool field — only written when true (false is proto3 default)
  function boolField(fieldNum, value) {
    if (!value) return new Uint8Array(0);
    return concat(
      encodeVarint((fieldNum << 3) | 0),
      new Uint8Array([1]),
    );
  }

  const _enc = new TextEncoder();

  // String field — skipped if empty
  function strField(fieldNum, value) {
    if (!value) return new Uint8Array(0);
    return ldField(fieldNum, _enc.encode(String(value)));
  }

  // ── "Always emit" variants ──────────────────────────────────────
  // Beanconqueror's OWN share encoder writes these fields even when empty/zero,
  // and its import code reads the resulting objects WITHOUT null-checks
  // (e.g. protoBean.cupped_flavor.predefined_flavors). If we omit them, BC's
  // BeanProto.decode() leaves the field undefined, the property access throws,
  // BC swallows the error, and the app lands on the homepage with no modal.
  // So we must mirror BC's field set exactly. Verified against a real BC link.

  // String emitted even when empty (tag + length + bytes; length may be 0)
  function strFieldAlways(fieldNum, value) {
    const bytes = _enc.encode(String(value ?? ''));
    return concat(
      encodeVarint((fieldNum << 3) | 2),
      encodeVarint(bytes.length),
      bytes,
    );
  }

  // Varint emitted even when 0
  function varintFieldAlways(fieldNum, value) {
    return concat(
      encodeVarint((fieldNum << 3) | 0),
      encodeVarint(Number(value) || 0),
    );
  }

  // Bool emitted even when false
  function boolFieldAlways(fieldNum, value) {
    return concat(
      encodeVarint((fieldNum << 3) | 0),
      new Uint8Array([value ? 1 : 0]),
    );
  }

  // Length-delimited field that is emitted even with zero-length payload.
  // For sub-messages this forces the decoder to instantiate an (empty) object
  // so BC can safely read its properties.
  function ldFieldAlways(fieldNum, bytes) {
    bytes = bytes || new Uint8Array(0);
    return concat(
      encodeVarint((fieldNum << 3) | 2),
      encodeVarint(bytes.length),
      bytes,
    );
  }

  // ── Message encoders ────────────────────────────────────────────

  function encodeBeanInformation(info) {
    return concat(
      strField(1,  info.country),
      strField(2,  info.region),
      strField(3,  info.farm),
      strField(4,  info.farmer),
      strField(5,  info.elevation),
      strField(6,  info.harvest_time),
      strField(7,  info.variety),
      strField(8,  info.processing),
      strField(9,  info.certification),
      varintField(10, info.percentage),
    );
  }

  function encodeBeanProto(bean) {
    // We mirror Beanconqueror's own share encoder field-for-field. BC writes
    // every field below (even empty ones) and its import reads them without
    // guards, so anything we omit can crash the import. Field order follows
    // proto field numbers. (buyDate=2, attachments=15 and external_images=29
    // are the only ones BC omits when empty — we emit 2 & 29 only when set.)
    const parts = [
      strFieldAlways(1,  bean.name),               // required
    ];

    if (bean.buyDate) parts.push(strFieldAlways(2, bean.buyDate));

    parts.push(
      strFieldAlways(3,  bean.roastingDate),
      strFieldAlways(4,  bean.note),
      strFieldAlways(5,  bean.roaster),
      ldFieldAlways(6,   null),                    // config (empty — BC regenerates uuid)
      varintFieldAlways(7,  bean.roast),
      varintFieldAlways(8,  0),                    // roast_range
      varintFieldAlways(9,  bean.beanMix),
      strFieldAlways(10, bean.roast_custom),
      strFieldAlways(11, bean.aromatics),
      varintFieldAlways(12, bean.weight),
      boolFieldAlways(13, false),                  // finished
      varintFieldAlways(14, bean.cost),
      strFieldAlways(16, bean.cupping_points),
      boolFieldAlways(17, bean.decaffeinated),
      strFieldAlways(18, bean.url),
      strFieldAlways(19, bean.ean_article_number),
      varintFieldAlways(20, 0),                    // rating
    );

    // BeanInformation (field 21) — one entry per origin. Always emit at least
    // one (empty) entry, exactly like BC, so import's bean_information[0] exists.
    const infos = (Array.isArray(bean.bean_information) && bean.bean_information.length)
      ? bean.bean_information
      : [{}];
    for (const info of infos) {
      parts.push(ldFieldAlways(21, encodeBeanInformation(info)));
    }

    parts.push(
      varintFieldAlways(22, bean.bean_roasting_type),
      ldFieldAlways(23, null),                     // bean_roast_information (empty)
      strFieldAlways(24, ''),                      // qr_code
      boolFieldAlways(25, false),                  // favourite
      boolFieldAlways(26, false),                  // shared
      ldFieldAlways(27, null),                     // cupping (empty)
      ldFieldAlways(28, null),                     // cupped_flavor (empty)
    );

    // external_images (field 29) — Drive URLs for the bag photo, when present
    if (Array.isArray(bean.external_images)) {
      for (const imgUrl of bean.external_images) {
        if (imgUrl) parts.push(strFieldAlways(29, imgUrl));
      }
    }

    return concat(...parts);
  }

  // ── Base64 + URL construction ───────────────────────────────────

  function bytesToBase64(bytes) {
    // Process in 8KB chunks to avoid call-stack limits on large arrays
    let binary = '';
    const CHUNK = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  }

  /**
   * Encode bean data and return the beanconqueror.com share URL.
   * Android routes this URL to the Beanconqueror app.
   *
   * @param {object} bean — output of FormModule.read()
   * @returns {string} share URL
   */
  function buildShareUrl(bean) {
    const bytes  = encodeBeanProto(bean);
    const base64 = bytesToBase64(bytes);

    // BC expects exactly 400-char chunks: shareUserBean0=..., shareUserBean1=...
    const CHUNK = 400;
    const loops = Math.ceil(base64.length / CHUNK);
    const params = [];
    for (let i = 0; i < loops; i++) {
      params.push(`shareUserBean${i}=${base64.substr(i * CHUNK, CHUNK)}`);
    }

    // Same URL format BC's own share service generates.
    // Android routes https://beanconqueror.com URLs directly to BC via App Links.
    return 'https://beanconqueror.com?' + params.join('&');
  }

  return { buildShareUrl };
})();

export default ProtobufModule;
