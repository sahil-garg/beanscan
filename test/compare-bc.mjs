import protobuf from 'protobufjs';
import ProtobufModule from '../js/protobuf.js';

const root = await protobuf.load(new URL('../proto/bean.proto', import.meta.url).pathname);
const BeanProto = root.lookupType('beanconqueror.BeanProto');

// Pad base64 to a multiple of 4 (Android/BC strip trailing '=')
const pad = s => s + '='.repeat((4 - (s.length % 4)) % 4);
const toBytes = b64 => Uint8Array.from(atob(pad(b64)), c => c.charCodeAt(0));

// --- BC's OWN generated payload (from beanconqueror.com create page) ---
const BC_REF = 'CgZGaWZ5Y3UaACIAKgZHaXZpYmkyADgFQABIAFIAWgBgAGgAcACCAQCIAQCSAQCaAQCgAQCqAQCwAQC6ARYIABAAGgAgACgAMAA6AEAASABQAFgAwgEAyAEA0AEA2gEWCAAQABgAIAAoADAAOABAAEgAUABYAOIBAA';

// --- OUR payload for an equivalent minimal bean ---
const ourUrl = ProtobufModule.buildShareUrl({ name: 'Fifycu', roaster: 'Givibi', roast: 5 });
const OUR_REF = new URLSearchParams(ourUrl.slice(ourUrl.indexOf('?') + 1)).get('shareUserBean0');

function fieldsPresent(bytes) {
  // Walk top-level wire format, list which field numbers appear
  const present = new Set();
  let i = 0;
  while (i < bytes.length) {
    let b0 = bytes[i++], tag = b0 & 0x7f, sh = 7;
    while (b0 & 0x80) { b0 = bytes[i++]; tag |= (b0 & 0x7f) << sh; sh += 7; }
    const fieldNum = tag >> 3, wire = tag & 7;
    present.add(fieldNum);
    if (wire === 2) {
      let lb = bytes[i++], len = lb & 0x7f, ls = 7;
      while (lb & 0x80) { lb = bytes[i++]; len |= (lb & 0x7f) << ls; ls += 7; }
      i += len;
    } else if (wire === 0) {
      while (bytes[i] & 0x80) i++; i++;
    } else if (wire === 5) { i += 4; }
    else if (wire === 1) { i += 8; }
    else break;
  }
  return [...present].sort((a, b) => a - b);
}

const bcBytes = toBytes(BC_REF);
const ourBytes = toBytes(OUR_REF);

const bcFields = fieldsPresent(bcBytes);
const ourFields = fieldsPresent(ourBytes);

console.log('BC reference fields present :', bcFields.join(', '));
console.log('OUR fields present         :', ourFields.join(', '));
console.log('Fields BC sets that WE DON\'T:', bcFields.filter(f => !ourFields.includes(f)).join(', ') || '(none)');

console.log('\n--- BC reference decoded (defaults shown) ---');
console.log(JSON.stringify(BeanProto.toObject(BeanProto.decode(bcBytes), { enums: Number, longs: Number, defaults: true }), null, 1));
