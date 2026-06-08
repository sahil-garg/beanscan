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
    const parts = [
      // Fields in proto field-number order
      strField(1,   bean.name),          // required
      strField(2,   bean.buyDate),
      strField(3,   bean.roastingDate),
      strField(4,   bean.note),
      strField(5,   bean.roaster),
      // 6 = config     — not set (BC regenerates on import)
      varintField(7,  bean.roast),
      // 8 = roast_range — not used
      varintField(9,  bean.beanMix),
      strField(10,  bean.roast_custom),
      strField(11,  bean.aromatics),
      varintField(12, bean.weight),
      // 13 = finished  — not set
      varintField(14, bean.cost),
      // 15 = attachments — not set
      strField(16,  bean.cupping_points),
      boolField(17, bean.decaffeinated),
      strField(18,  bean.url),
      strField(19,  bean.ean_article_number),
      // 20 = rating    — not set
    ];

    // Repeated BeanInformation (field 21) — one entry per origin
    if (Array.isArray(bean.bean_information)) {
      for (const info of bean.bean_information) {
        const encoded = encodeBeanInformation(info);
        if (encoded.length) parts.push(ldField(21, encoded));
      }
    }

    parts.push(varintField(22, bean.bean_roasting_type));
    // 23–28 = roast info, qr_code, favourite, shared, cupping — not set

    // Repeated external_images (field 29) — Drive URLs for bag photo
    if (Array.isArray(bean.external_images)) {
      for (const imgUrl of bean.external_images) {
        if (imgUrl) parts.push(strField(29, imgUrl));
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

    // BC's custom URL scheme — registered in AndroidManifest.xml and handled
    // by IntentHandlerService. Works in Chrome and most Android browsers.
    return 'beanconqueror://ADD_USER_BEAN?' + params.join('&');
  }

  return { buildShareUrl };
})();

export default ProtobufModule;
