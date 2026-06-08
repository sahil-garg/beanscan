import protobuf from 'protobufjs';
import ProtobufModule from '../js/protobuf.js';
const root = await protobuf.load(new URL('../proto/bean.proto', import.meta.url).pathname);
const BeanProto = root.lookupType('beanconqueror.BeanProto');

// Decode WITHOUT toObject — this is the raw message instance BC's import accesses.
// protobufjs instance properties are lowerCamelCase (cupped_flavor -> cuppedFlavor).
const url = ProtobufModule.buildShareUrl({ name: 'Ifuv', roaster: 'Jfuvkv', roast: 7 });
const b64 = new URLSearchParams(url.slice(url.indexOf('?')+1)).get('shareUserBean0');
const msg = BeanProto.decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));

const checks = {
  'config exists': msg.config != null,
  'cupping exists': msg.cupping != null,
  'cuppedFlavor exists': msg.cuppedFlavor != null,
  'cuppedFlavor.predefinedFlavors readable': Array.isArray(msg.cuppedFlavor?.predefinedFlavors),
  'beanRoastInformation exists': msg.beanRoastInformation != null,
  'beanInformation[0] exists': msg.beanInformation?.[0] != null,
};
let ok = true;
for (const [k, v] of Object.entries(checks)) { console.log(`${v ? '✅' : '❌'} ${k}`); if (!v) ok = false; }
console.log(ok ? '\n✅ All sub-objects present — BC import will not throw on dereference.'
              : '\n❌ Missing sub-object — would crash BC import.');
process.exit(ok ? 0 : 1);
