/**
 * parser.js — Heuristic OCR text → BeanProto field mapper
 *
 * Strategy: maintain a working copy of the raw text and progressively
 * scrub it as fields are extracted. Whatever is left after all extractions
 * goes into the `note` field. The user reviews and corrects everything
 * before any data is sent to Beanconqueror or Sheets.
 *
 * Order matters: extract high-confidence labeled fields and tasting notes
 * BEFORE vocabulary matching, so words like "Natural" in "naturally sweet"
 * aren't misidentified as a processing method.
 */

import {
  COUNTRIES, PROCESSING_METHODS, VARIETIES, CERTIFICATIONS,
  TASTING_NOTE_HEADERS, ROAST_LEVELS, ROASTING_TYPES,
} from './parser-vocab.js';

const ParserModule = (() => {

  // Escape special regex characters in a plain string
  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Convert various date formats to YYYY-MM-DD for HTML <input type="date">
  function toISODate(str) {
    if (!str) return '';
    str = str.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

    // DD.MM.YYYY or DD/MM/YYYY (European — common on specialty bags)
    let m = str.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;

    // MM/YYYY — use the first of the month
    m = str.match(/^(\d{1,2})[./](\d{4})$/);
    if (m) return `${m[2]}-${m[1].padStart(2,'0')}-01`;

    // Try native Date for "Jan 2024", "December 12 2024", etc.
    const d = new Date(str);
    if (!isNaN(d) && str.length > 4) return d.toISOString().slice(0, 10);

    return ''; // unparseable — leave blank rather than set wrong date
  }

  function emptyResult() {
    return {
      name: '', roaster: '', roastingDate: '', aromatics: '', note: '',
      weight: 0, cost: 0,
      roast: 0, roast_custom: '',
      beanMix: 0, bean_roasting_type: 0,
      decaffeinated: false,
      url: '', ean_article_number: '', cupping_points: '',
      bean_information: [{
        country: '', region: '', farm: '', farmer: '',
        elevation: '', harvest_time: '', variety: '', processing: '',
        certification: '', percentage: 0,
      }],
      external_images: [],
    };
  }

  function parse(rawText) {
    if (!rawText || !rawText.trim()) return emptyResult();

    // Normalize: consistent newlines, collapse horizontal whitespace
    let w = rawText
      .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      .replace(/[^\S\n]+/g, ' ')
      .trim();

    const res = emptyResult();
    const info = res.bean_information[0];

    // Find a "Label: Value" line and remove it from w, returning the value.
    // labelRe is a regex *string* (not a RegExp) for the label portion.
    function labeled(labelRe) {
      const re = new RegExp(
        '^[ \\t]*(?:' + labelRe + ')[ \\t]*[:\\-–·][ \\t]*(.+)$',
        'im'
      );
      const m = w.match(re);
      if (m) { w = w.replace(m[0], ' '); return m[1].trim(); }
      return null;
    }

    // Remove the first match of re from w and return the match array.
    function scrub(re) {
      const m = w.match(re);
      if (m) w = w.replace(re, ' ');
      return m;
    }

    // ── 1. URLs ──────────────────────────────────────────────────────────
    const urlM = w.match(/https?:\/\/[^\s]+/i);
    if (urlM) {
      res.url = urlM[0];
      w = w.replace(urlM[0], ' ');
      // Cache domain — used as roaster fallback at the end
      const domM = res.url.match(/https?:\/\/(?:www\.)?([^/\s]+)/i);
      if (domM) res._domain = domM[1];
    }

    // ── 2. Labeled fields (highest confidence) ───────────────────────────
    // These match "Label: Value" lines explicitly written on the bag
    res.name    = labeled('(?:coffee\\s*name|name|bean(?:\\s*name)?)') || '';
    res.roaster = labeled('roastery?') || '';   // "roaster" or "roastery" but NOT "roast"

    const rawDate = labeled('roast(?:ed|ing\\s*date|\\s*date)?');
    if (rawDate) res.roastingDate = toISODate(rawDate);

    info.country      = labeled('(?:country(?:\\s*of\\s*origin)?|origin)') || '';
    info.region       = labeled('region') || '';
    info.farm         = labeled('farm') || '';
    info.farmer       = labeled('(?:farmer|producer)') || '';
    info.variety      = labeled('(?:variety|varietal|cultivar)') || '';
    info.processing   = labeled('(?:process(?:ing)?|method)') || '';
    info.elevation    = labeled('(?:elevation|altitude)') || '';
    info.harvest_time = labeled('(?:harvest(?:\\s*time)?|crop(?:\\s*year)?)') || '';
    info.certification = labeled('certif(?:ied|ication)') || '';
    res.cupping_points = labeled('(?:cupping(?:\\s*score)?|sca(?:\\s*score)?|score)') || '';

    // ── 3. Tasting notes section ─────────────────────────────────────────
    // Extract BEFORE vocabulary matching so "Natural" in tasting notes text
    // is not consumed by the processing method matcher.
    if (!res.aromatics) {
      for (const hRe of TASTING_NOTE_HEADERS) {
        // Case A: "Tasting Notes: blueberry, citrus" (value on same line)
        const sameLineRe = new RegExp(hRe.source + '[ \\t]+(.+)', 'im');
        const mSame = w.match(sameLineRe);
        if (mSame && mSame[1].trim()) {
          res.aromatics = mSame[1].trim();
          w = w.replace(mSame[0], ' ');
          break;
        }
        // Case B: "Tasting Notes\nblueberry, citrus" (value on next line)
        const nextLineRe = new RegExp(hRe.source + '[ \\t]*\\n[ \\t]*(.+)', 'im');
        const mNext = w.match(nextLineRe);
        if (mNext && mNext[1].trim()) {
          res.aromatics = mNext[1].trim();
          w = w.replace(mNext[0], ' ');
          break;
        }
      }
    }

    // ── 4. Weight ────────────────────────────────────────────────────────
    if (!res.weight) {
      const m = scrub(/(\d+)\s*(?:g\b|grams?|gr\b)/i);
      if (m) res.weight = parseInt(m[1], 10);
    }

    // ── 5. Elevation ─────────────────────────────────────────────────────
    if (!info.elevation) {
      const m = w.match(
        /(\d{3,4}\s*[-–—to]+\s*\d{3,4}|\d{3,4})\s*(?:m\.?a\.?s\.?l\.?|masl|m(?:eters?)?\s*(?:above\s*sea\s*level)?)/i
      );
      if (m) { info.elevation = m[0].trim(); w = w.replace(m[0], ' '); }
    }

    // ── 6. Roast date (unlebeled, contextual) ────────────────────────────
    if (!res.roastingDate) {
      const m = w.match(
        /(?:roasted?(?:\s*on)?|rd)\s*[:\-–]?\s*(\d{1,2}[./]\d{1,2}[./]\d{2,4}|\d{4}-\d{2}-\d{2}|[a-z]+\.?\s+\d{4}|\d{1,2}\s+[a-z]+\.?\s+\d{4})/i
      );
      if (m) { res.roastingDate = toISODate(m[1]); w = w.replace(m[0], ' '); }
    }

    // ── 7. Country ───────────────────────────────────────────────────────
    if (!info.country) {
      for (const c of COUNTRIES) {
        const re = new RegExp('\\b' + escapeRe(c) + '\\b', 'i');
        if (re.test(w)) { info.country = c; w = w.replace(re, ' '); break; }
      }
    }

    // ── 8. Processing method ─────────────────────────────────────────────
    if (!info.processing) {
      for (const { re, label } of PROCESSING_METHODS) {
        if (re.test(w)) { info.processing = label; w = w.replace(re, ' '); break; }
      }
    }

    // ── 9. Variety ───────────────────────────────────────────────────────
    // Collect ALL matching varieties (a blend or uncommon lot can list several)
    if (!info.variety) {
      const found = [];
      for (const v of VARIETIES) {
        const re = new RegExp('\\b' + escapeRe(v) + '\\b', 'i');
        if (re.test(w)) { found.push(v); w = w.replace(re, ' '); }
      }
      if (found.length) info.variety = found.join(', ');
    }

    // ── 10. Certification ────────────────────────────────────────────────
    if (!info.certification) {
      const found = [];
      for (const c of CERTIFICATIONS) {
        const re = new RegExp('\\b' + escapeRe(c) + '\\b', 'i');
        if (re.test(w)) { found.push(c); w = w.replace(re, ' '); }
      }
      if (found.length) info.certification = found.join(', ');
    }

    // ── 11. Roast level ──────────────────────────────────────────────────
    if (!res.roast) {
      for (const { re, roast, custom } of ROAST_LEVELS) {
        if (re.test(w)) {
          res.roast = roast;
          res.roast_custom = custom || '';
          w = w.replace(re, ' ');
          break;
        }
      }
    }

    // ── 12. Roasting type (filter / espresso / omni) ─────────────────────
    if (!res.bean_roasting_type) {
      for (const { re, type } of ROASTING_TYPES) {
        if (re.test(w)) { res.bean_roasting_type = type; w = w.replace(re, ' '); break; }
      }
    }

    // ── 13. Bean mix ─────────────────────────────────────────────────────
    if (/single[\s-]*origin/i.test(w)) {
      res.beanMix = 1;
      w = w.replace(/single[\s-]*origin/gi, ' ');
    } else if (/\bblend\b/i.test(w)) {
      res.beanMix = 2;
      w = w.replace(/\bblend\b/gi, ' ');
    }

    // ── 14. Decaf ────────────────────────────────────────────────────────
    if (/decaf(?:feinated)?/i.test(w)) {
      res.decaffeinated = true;
      w = w.replace(/decaf(?:feinated)?/gi, ' ');
    }

    // ── 15. Name construction ────────────────────────────────────────────
    // Only suggest a name if none was found in a labeled field.
    // "Ethiopia Natural" is a reasonable default for a single-origin bag.
    if (!res.name) {
      if (info.country && info.processing) {
        res.name = `${info.country} ${info.processing}`;
      } else if (info.country) {
        res.name = info.country;
      }
    }

    // ── 16. Roaster fallback: URL domain ─────────────────────────────────
    if (!res.roaster && res._domain) res.roaster = res._domain;
    delete res._domain;

    // ── 17. Unmapped text → notes ────────────────────────────────────────
    const remaining = w
      .replace(/[^\S\n]+/g, ' ')
      .replace(/\n{2,}/g, '\n')
      .trim();
    if (remaining.length > 3) res.note = remaining;

    return res;
  }

  return { parse };
})();

export default ParserModule;
