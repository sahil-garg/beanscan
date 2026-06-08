/**
 * verify-encoding.mjs — Round-trip test for our hand-rolled protobuf encoder.
 *
 * Encodes test beans with OUR encoder (js/protobuf.js), then decodes the
 * resulting base64 with the REAL protobufjs library against bean.proto —
 * exactly what Beanconqueror does on import. If decode throws or the values
 * don't match, that's the bug that drops BC to the homepage.
 *
 * Run: node test/verify-encoding.mjs
 */

import protobuf from 'protobufjs';
import ProtobufModule from '../js/protobuf.js';

const root = await protobuf.load(new URL('../proto/bean.proto', import.meta.url).pathname);
const BeanProto = root.lookupType('beanconqueror.BeanProto');

// Reassemble base64 from the shareUserBean chunks, exactly as BC's intent handler does.
function payloadFromUrl(url) {
  const q = url.slice(url.indexOf('?') + 1);
  const params = new URLSearchParams(q);
  const keys = [...params.keys()]
    .filter(k => /^shareUserBean\d+$/.test(k))
    .sort((a, b) => parseInt(a.replace(/\D/g, '')) - parseInt(b.replace(/\D/g, '')));
  return keys.map(k => params.get(k)).join('');
}

function decode(url) {
  const b64 = payloadFromUrl(url);
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  // verify(): protobufjs structural check. decode(): the actual parse BC runs.
  const msg = BeanProto.decode(bytes);
  // protobufjs toObject uses JSON (camelCase) names: bean_information -> beanInformation
  return BeanProto.toObject(msg, { enums: Number, longs: Number, defaults: false });
}

const cases = {
  'minimal (name+roaster)': {
    name: 'Test', roaster: 'Test',
  },
  'single origin full': {
    name: 'Yirgacheffe Natural', roaster: 'Some Roaster',
    roastingDate: '2026-05-01', note: 'unmapped text here',
    roast: 13, roast_custom: 'Light-Medium', beanMix: 1, bean_roasting_type: 1,
    weight: 250, cost: 18, aromatics: 'blueberry, jasmine', decaffeinated: false,
    cupping_points: '88', url: 'https://x.com', ean_article_number: '12345',
    bean_information: [{
      country: 'Ethiopia', region: 'Yirgacheffe', farm: 'Konga', farmer: 'Co-op',
      elevation: '1900-2100 masl', harvest_time: 'Oct 2025', variety: 'Heirloom',
      processing: 'Natural', certification: 'Organic', percentage: 100,
    }],
  },
  'blend, 2 varieties': {
    name: 'House Blend', roaster: 'Blend Co', beanMix: 2,
    bean_information: [
      { country: 'Brazil', variety: 'Yellow Bourbon', processing: 'Natural', percentage: 60 },
      { country: 'Colombia', variety: 'Caturra', processing: 'Washed', percentage: 40 },
    ],
  },
  'accents/unicode': {
    name: 'Café Ñoño über', roaster: 'Rösterei',
    aromatics: 'Crème brûlée, açaí', note: 'naïve façade — 日本語 ☕',
    bean_information: [{ country: 'Perú', region: 'Cajamarca' }],
  },
  'long tasting notes': {
    name: 'Long', roaster: 'R',
    aromatics: ('Bright citrus, ').repeat(60),
    note: ('Background story about the farm and the producer and the process. ').repeat(20),
    bean_information: [{ country: 'Kenya' }],
  },
  'with image url (field 29)': {
    name: 'Img', roaster: 'R',
    external_images: ['https://drive.google.com/uc?id=ABC123xyz'],
    bean_information: [{ country: 'Kenya' }],
  },
};

let failures = 0;
for (const [label, bean] of Object.entries(cases)) {
  try {
    const url = ProtobufModule.buildShareUrl(bean);
    const b64 = payloadFromUrl(url);
    const decoded = decode(url);
    // Spot-check the most import-critical fields survived.
    const checks = [];
    if (decoded.name !== bean.name) checks.push(`name: "${decoded.name}" != "${bean.name}"`);
    if (bean.roaster && decoded.roaster !== bean.roaster) checks.push(`roaster mismatch`);
    if (bean.weight && Number(decoded.weight) !== bean.weight) checks.push(`weight: ${decoded.weight} != ${bean.weight}`);
    if (bean.roast && decoded.roast !== bean.roast) checks.push(`roast: ${decoded.roast} != ${bean.roast}`);
    if (Array.isArray(bean.bean_information)) {
      const got = decoded.beanInformation || [];           // protobufjs JSON name
      if (got.length !== bean.bean_information.length) {
        checks.push(`bean_information count: ${got.length} != ${bean.bean_information.length}`);
      } else {
        bean.bean_information.forEach((src, idx) => {
          if (src.country && got[idx].country !== src.country) checks.push(`bean_info[${idx}].country mismatch`);
          if (src.variety && got[idx].variety !== src.variety) checks.push(`bean_info[${idx}].variety mismatch`);
          if (src.percentage && got[idx].percentage !== src.percentage) checks.push(`bean_info[${idx}].percentage mismatch`);
        });
      }
    }
    if (bean.aromatics && decoded.aromatics !== bean.aromatics) checks.push(`aromatics mismatch`);
    if (bean.note && decoded.note !== bean.note) checks.push(`note mismatch`);
    if (Array.isArray(bean.external_images) && bean.external_images.length) {
      const imgs = decoded.externalImages || [];
      if (imgs[0] !== bean.external_images[0]) checks.push(`external_images mismatch`);
    }
    const ok = checks.length === 0;
    if (!ok) failures++;
    console.log(`${ok ? '✅' : '❌'} ${label}  (b64 ${b64.length} chars, ${Math.ceil(b64.length/400)} chunk(s))`);
    if (!ok) checks.forEach(c => console.log(`      ↳ ${c}`));
  } catch (ex) {
    failures++;
    console.log(`❌ ${label}  — DECODE THREW: ${ex.message}`);
  }
}

console.log(`\n${failures === 0 ? '✅ ALL PASSED — our bytes decode cleanly in protobufjs (what BC runs).'
                                  : `❌ ${failures} case(s) failed — found the payload bug.`}`);
process.exit(failures === 0 ? 0 : 1);
