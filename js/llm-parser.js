/**
 * llm-parser.js — Claude vision-based coffee bag parser
 *
 * Sends the captured photo directly to Claude (no Tesseract OCR step).
 * Claude reads the image and returns structured JSON in one API call.
 * Cost per scan: ~$0.005–0.01 depending on image size.
 */

const SYSTEM_PROMPT = `You are an expert coffee bag label parser. \
You will be shown a photo of a physical coffee bag and must extract every \
piece of information visible on it into a structured JSON format. \
Read ALL text on the bag, including small print, back-of-bag text, \
ingredient lists, and any text that is partially obscured or at an angle. \
Use your knowledge of specialty coffee terminology, roaster naming conventions, \
origin geography, processing methods, and bag label layouts to interpret \
ambiguous or stylized text correctly. \
Return ONLY valid JSON — no explanation, no markdown, no code fences.`;

function buildPrompt() {
  return `Extract every piece of information visible on this coffee bag into this exact JSON structure.

Rules:
- Use "" for unknown strings, 0 for unknown numbers, false for unknown booleans.
- "name": the coffee/product name, NOT the roaster name. Often a place name (e.g. "Yirgacheffe", "Huila Natural"), a farm name, or descriptive product name. If no distinct product name, construct one from origin + processing (e.g. "Ethiopia Natural").
- "roaster": the roastery or company name — the brand that roasted this coffee. Often the most prominent brand on the bag.
- "roastingDate": roast date as YYYY-MM-DD. Look for "Roasted:", "Roast date:", "RD:", or standalone dates. Common formats: DD.MM.YYYY, DD/MM/YYYY, Month DD YYYY.
- "aromatics": ALL tasting notes and flavor descriptors. Preserve original wording. Look for sections labeled "Tasting Notes", "Flavour", "Cup Profile", "Notes", "Tastes of".
- "weight": bag weight in grams. Convert if needed: 1kg=1000, 12oz≈340, 8oz≈227.
- "roast" enum: 0=unknown, 5=moderate light, 6=city/medium, 7=city+, 8=full city, 9=full city+, 12=french, 13=custom. Use 13 for any "light", "light-medium", "medium-light", "medium-dark" label and put exact bag wording in roast_custom. Use 6 for plain "medium". Use 8 for plain "dark".
- "beanMix": 0=unknown, 1=single origin, 2=blend.
- "bean_roasting_type": 0=unknown, 1=filter/pour-over/drip, 2=espresso, 3=omni/omniroast.
- "bean_information[].country": origin country.
- "bean_information[].region": growing region or zone (e.g. "Yirgacheffe", "Huila", "Antigua").
- "bean_information[].variety": botanical cultivar (e.g. "Heirloom", "Bourbon", "Gesha", "SL28", "Caturra").
- "bean_information[].processing": processing method (e.g. "Washed", "Natural", "Honey", "Anaerobic Natural").
- "bean_information[].elevation": altitude string as written (e.g. "1800-2100 masl").
- "bean_information[].harvest_time": harvest period (e.g. "Oct-Dec 2023").
- "bean_information[].farm": estate or farm name.
- "bean_information[].certification": organic, fair trade, rainforest alliance, etc.
- "note": anything that doesn't map to another field — brew ratios, background story, barista tips.
- For blends: one object per origin in bean_information with percentage if stated.

{
  "name": "",
  "roaster": "",
  "roastingDate": "",
  "aromatics": "",
  "note": "",
  "weight": 0,
  "cost": 0,
  "roast": 0,
  "roast_custom": "",
  "beanMix": 0,
  "bean_roasting_type": 0,
  "decaffeinated": false,
  "url": "",
  "ean_article_number": "",
  "cupping_points": "",
  "bean_information": [{
    "country": "",
    "region": "",
    "farm": "",
    "farmer": "",
    "elevation": "",
    "harvest_time": "",
    "variety": "",
    "processing": "",
    "certification": "",
    "percentage": 0
  }]
}`;
}

// Resize image to fit within maxDim on the longest side, return base64 JPEG.
// 1024px keeps image tokens low (~1400 tokens) while preserving text legibility.
async function resizeToBase64(file, maxDim = 1024) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width  * scale);
      const h = Math.round(img.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);

      URL.revokeObjectURL(url);
      // Strip the data:image/jpeg;base64, prefix
      const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
      resolve(dataUrl.split(',')[1]);
    };

    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
}

const LLMParserModule = (() => {

  // Vision path: send the image directly to Claude
  async function parseImage(imageFile, apiKey, proxyUrl) {
    const base64 = await resizeToBase64(imageFile);

    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
            },
            {
              type: 'text',
              text: buildPrompt(),
            },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || `API error ${response.status}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in LLM response');

    const parsed = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(parsed.bean_information) || !parsed.bean_information.length) {
      parsed.bean_information = [{
        country: '', region: '', farm: '', farmer: '',
        elevation: '', harvest_time: '', variety: '', processing: '',
        certification: '', percentage: 0,
      }];
    }
    parsed.external_images = [];

    return parsed;
  }

  // Text path: kept for OCR fallback and any future use
  async function parse(ocrText, apiKey, proxyUrl) {
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `OCR text from a coffee bag:\n\n${ocrText}\n\n${buildPrompt()}` }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || `API error ${response.status}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in LLM response');

    const parsed = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(parsed.bean_information) || !parsed.bean_information.length) {
      parsed.bean_information = [{
        country: '', region: '', farm: '', farmer: '',
        elevation: '', harvest_time: '', variety: '', processing: '',
        certification: '', percentage: 0,
      }];
    }
    parsed.external_images = [];

    return parsed;
  }

  return { parseImage, parse };
})();

export default LLMParserModule;
