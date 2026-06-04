/**
 * llm-parser.js — Claude Haiku field extractor
 *
 * Sends raw OCR text to the Anthropic API and asks for structured JSON
 * matching the BeanProto field schema. Returns the same object shape as
 * ParserModule.parse() so it can be used as a drop-in replacement.
 *
 * The user's own API key is read from SettingsModule — it never leaves
 * the device except in the API request header. Cost per scan: ~$0.001.
 */

const SYSTEM_PROMPT = `You are a coffee bag label parser. \
Extract structured data from OCR text scanned from a physical coffee bag. \
Return ONLY valid JSON — no explanation, no markdown, no code fences.`;

function buildUserPrompt(ocrText) {
  return `OCR text from a coffee bag:

${ocrText}

Return a JSON object with exactly these fields (use "" for unknown strings, 0 for unknown numbers, false for booleans):

{
  "name": "coffee/product name",
  "roaster": "roaster or roastery name",
  "roastingDate": "YYYY-MM-DD or empty string",
  "aromatics": "tasting notes / flavor descriptors",
  "note": "any info that doesn't fit other fields",
  "weight": 0,
  "cost": 0,
  "roast": 0,
  "roast_custom": "label if roast=13, otherwise empty",
  "beanMix": 0,
  "bean_roasting_type": 0,
  "decaffeinated": false,
  "url": "website URL or empty",
  "ean_article_number": "",
  "cupping_points": "",
  "bean_information": [{
    "country": "origin country",
    "region": "growing region",
    "farm": "farm or estate name",
    "farmer": "farmer or producer name",
    "elevation": "e.g. 1800-2100 masl",
    "harvest_time": "e.g. Nov-Jan 2024",
    "variety": "botanical variety e.g. Heirloom, Bourbon",
    "processing": "e.g. Washed, Natural, Honey",
    "certification": "e.g. Organic, Fair Trade",
    "percentage": 0
  }]
}

Enum values:
- roast: 0=unknown, 5=moderate light, 6=city/medium, 7=city+, 8=full city, 9=full city+, 12=french, 13=custom. Use 13 for "light", "light-medium", "medium-light", "medium-dark" and put the bag wording in roast_custom.
- beanMix: 0=unknown, 1=single origin, 2=blend
- bean_roasting_type: 0=unknown, 1=filter/pour-over, 2=espresso, 3=omni

For blends, return multiple objects in bean_information. Be conservative — only fill fields you are confident about.`;
}

const LLMParserModule = (() => {

  async function parse(ocrText, apiKey, proxyUrl) {
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        // Required when calling the API directly from a browser
        // anthropic-dangerous-direct-browser-access is added by the proxy worker
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
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

    // Model should return bare JSON but may occasionally wrap it
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
