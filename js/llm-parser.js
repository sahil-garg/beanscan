/**
 * llm-parser.js — Claude field extractor (LLM-only branch)
 *
 * On this branch the LLM is the sole parser — no heuristic fallback.
 * Uses claude-sonnet-4-6 for better extraction quality on messy OCR text.
 * Cost per scan: ~$0.003–0.005 (vs ~$0.001 for Haiku).
 */

const SYSTEM_PROMPT = `You are an expert coffee bag label parser. \
You receive raw OCR text extracted from a physical coffee bag and must map every \
piece of information to the correct structured field. \
OCR text is often noisy: characters may be garbled, words split across lines, \
punctuation mangled. Use your knowledge of specialty coffee terminology, \
roaster naming conventions, origin geography, processing methods, and bag \
label layouts to interpret ambiguous text correctly. \
Return ONLY valid JSON — no explanation, no markdown, no code fences. \
Extract aggressively: if you can make a confident inference, do so.`;

function buildUserPrompt(ocrText) {
  return `Raw OCR text extracted from a coffee bag label:

---
${ocrText}
---

Extract every piece of information into this exact JSON structure. \
Rules:
- Use "" for unknown strings, 0 for unknown numbers, false for unknown booleans.
- For "name": this is the coffee/product name, NOT the roaster name. Often a place name (e.g. "Yirgacheffe", "Huila Natural"), a farm name, or a descriptive product name. If no distinct product name exists, construct one from origin + processing (e.g. "Ethiopia Natural").
- For "roaster": the roastery/company name. Often the most prominent brand on the bag. Look for company names, logos described in text, website domains.
- For "roastingDate": roast date in YYYY-MM-DD. Look for "Roasted:", "Roast date:", "RD:", or standalone dates near roast context. Common formats: DD.MM.YYYY, DD/MM/YYYY, Month DD YYYY.
- For "aromatics": ALL tasting notes, flavor descriptors, cup profile text. Preserve the original wording. Look for sections labeled "Tasting Notes", "Flavour", "Cup Profile", "Notes", "Tastes of", "Flavour notes".
- For "weight": bag weight in grams. Look for "250g", "1kg" (=1000g), "500g", "12oz" (~340g).
- For "roast" enum: 0=unknown, 5=moderate light, 6=city/medium, 7=city+, 8=full city, 9=full city+, 12=french, 13=custom. Use 13 (custom) for any light, light-medium, medium-light, medium-dark label and put the exact bag wording in roast_custom. Use 6 for plain "medium". Use 8 for plain "dark".
- For "beanMix": 0=unknown, 1=single origin, 2=blend. Infer from context: single farm/country = 1, "blend" or multiple origins listed = 2.
- For "bean_roasting_type": 0=unknown, 1=filter/pour-over/drip, 2=espresso, 3=omni/omniroast. Look for explicit labels or brewing method suggestions.
- For "bean_information[].country": the origin country. Common OCR issues: "Ethiobia"→Ethiopia, "Colombla"→Colombia, "Guatemaia"→Guatemala.
- For "bean_information[].region": growing region, zone, or department. E.g. "Yirgacheffe", "Huila", "Antigua", "Sidama", "Kochere".
- For "bean_information[].variety": botanical cultivar. E.g. "Heirloom", "Bourbon", "Gesha", "SL28", "Caturra", "Typica". Often listed as "Variety:", "Cultivar:", or after the processing method.
- For "bean_information[].processing": processing method. E.g. "Washed", "Natural", "Honey", "Anaerobic Natural", "Carbonic Maceration". Often listed as "Process:", "Method:", "Processing:".
- For "bean_information[].elevation": altitude. Look for "masl", "m.a.s.l.", "meters", "altitude". Preserve original string e.g. "1800-2100 masl".
- For "bean_information[].harvest_time": harvest period. E.g. "Oct-Dec 2023", "2023/24 crop".
- For "bean_information[].farm": estate or farm name. E.g. "Finca La Palma", "Danche Station".
- For "bean_information[].certification": organic, fair trade, rainforest alliance, UTZ, etc.
- For "note": put anything that doesn't map to another field — brew ratios, background story text, barista tips, unrecognised words.
- For blends, return one object per origin in bean_information with percentage if stated.

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

const LLMParserModule = (() => {

  async function parse(ocrText, apiKey, proxyUrl) {
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserPrompt(ocrText) }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || `API error ${response.status}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    // Model should return bare JSON but may occasionally wrap it in fences
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in LLM response');

    const parsed = JSON.parse(jsonMatch[0]);

    // Ensure required structure exists even if model omitted it
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

  return { parse };
})();

export default LLMParserModule;
