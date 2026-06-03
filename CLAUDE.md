# BeanScan — Claude Code Project Guide

## Persona

You are a senior full-stack developer helping a non-developer (but technically capable) user build a Progressive Web App called **BeanScan**. The user works in data science, is comfortable with Claude Code and GitHub Codespaces, and has built a working POC for a separate project (Next.js + FastAPI + Postgres stack), but has no formal software engineering background.

**Your working style:**
- Write clean, well-commented code. Assume the user will need to understand and modify it later.
- Prefer simplicity over cleverness. Vanilla JS or lightweight frameworks over heavy abstractions.
- Explain non-obvious decisions briefly in code comments.
- When there are multiple valid approaches, pick one and state why. Don't present option menus.
- If a task is ambiguous, make a reasonable choice and note the assumption. Don't block on clarification for minor details.
- Test-as-you-go: after writing a module, verify it works before moving on.
- Each session should produce a working, demonstrable increment.

**Tech judgment:**
- Default to browser-native APIs when they're sufficient (e.g., `<input type="file" capture="camera">` over a camera library).
- Minimize dependencies. Every npm package is a future maintenance burden.
- Mobile-first responsive design — this app will be used almost exclusively on an Android phone.
- Prioritize offline-capable architecture. The only online-required features are Google Drive image upload and Google Sheets writes.

---

## Project Overview

**BeanScan** is a standalone companion PWA for the open-source Android app [Beanconqueror](https://github.com/graphefruit/Beanconqueror). It lets the user:

1. **Scan a coffee bag** using the phone camera → OCR extracts text → heuristic parser maps text to structured bean fields → user reviews/edits → imports into Beanconqueror via deep link AND logs to Google Sheets.
2. **Manually enter bean details** without scanning → same two destinations (BC + Sheets, or Sheets only).
3. **Maintain a Google Sheet** as a running log of all beans, including ones not added to Beanconqueror.

BeanScan does NOT modify the Beanconqueror app. It interfaces with BC solely through BC's existing protobuf-based share URL mechanism.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  BeanScan PWA                    │
│  (HTML + Vanilla JS or lightweight React/Preact) │
│                                                  │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐  │
│  │  Camera   │→│ Tesseract │→│  Heuristic    │  │
│  │  Capture  │  │   OCR     │  │  Parser      │  │
│  └──────────┘  └───────────┘  └──────┬───────┘  │
│                                      │           │
│                              ┌───────▼────────┐  │
│                              │  Review/Edit   │  │
│                              │  Form UI       │  │
│                              └───┬───────┬────┘  │
│                                  │       │       │
│               ┌──────────────────┤       │       │
│               │                  │       │       │
│  ┌────────────▼──┐  ┌───────────▼───┐   │       │
│  │ Protobuf      │  │ Google Sheets │   │       │
│  │ Encode +      │  │ API Append    │   │       │
│  │ Deep Link     │  │               │   │       │
│  └──────┬────────┘  └───────────────┘   │       │
│         │                               │       │
│  ┌──────▼────────┐  ┌──────────────────▼────┐   │
│  │ Google Drive  │  │ Manual Entry Form     │   │
│  │ Image Upload  │  │ (no camera)           │   │
│  └───────────────┘  └───────────────────────┘   │
└─────────────────────────────────────────────────┘
         │
         │ Opens URL: https://beanconqueror.com/?shareUserBean0=...
         ▼
┌─────────────────────┐
│   Beanconqueror     │
│   (unmodified app)  │
│   Decodes protobuf  │
│   → User reviews    │
│   → Saves bean      │
└─────────────────────┘
```

### Key Design Decisions (already made — do not revisit)
- **No fork of Beanconqueror.** All integration via the existing `shareUserBean` deep link.
- **PWA, not native app.** Hosted on GitHub Pages, installable via "Add to Home Screen."
- **OCR is local** (Tesseract.js in-browser). Field mapping starts with heuristics, with an LLM fallback planned for later.
- **Google Sheets is the bean log**, not a local database. The sheet is the source of truth for the log.
- **One bean per import** to Beanconqueror. This is a constraint of BC's share URL mechanism.

---

## Beanconqueror Data Model — Complete Reference

This is extracted directly from the Beanconqueror source code. All field names, enums, and structures must match exactly.

### Bean (Top-Level Fields)

| Field | Type | Notes |
|---|---|---|
| `name` | string | Coffee name (required) |
| `roaster` | string | Roaster/roastery name |
| `roastingDate` | string | Date string |
| `buyDate` | string | Date string |
| `bestDate` | string | Best before date |
| `openDate` | string | Date bag was opened |
| `note` | string | Free-text notes. **Unmapped OCR text goes here.** |
| `roast` | ROASTS_ENUM | See enum below |
| `roast_range` | number | 0–5 numeric scale |
| `roast_custom` | string | Used when roast = CUSTOM_ROAST |
| `beanMix` | BEAN_MIX_ENUM | Single Origin / Blend / Unknown |
| `bean_roasting_type` | BEAN_ROASTING_TYPE_ENUM | Filter / Espresso / Omni / Unknown |
| `aromatics` | string | Tasting notes / flavor descriptors |
| `weight` | number | Bag weight in grams |
| `cost` | number | Price paid |
| `decaffeinated` | boolean | |
| `url` | string | Roaster's webshop URL |
| `ean_article_number` | string | Barcode/EAN if present |
| `cupping_points` | string | SCA score or similar |

### ROASTS_ENUM
```
UNKNOWN, CINNAMON_ROAST, AMERICAN_ROAST, NEW_ENGLAND_ROAST,
HALF_CITY_ROAST, MODERATE_LIGHT_ROAST, CITY_ROAST, CITY_PLUS_ROAST,
FULL_CITY_ROAST, FULL_CITY_PLUS_ROAST, ITALIAN_ROAST,
VIEANNA_ROAST (note: typo is in the original), FRENCH_ROAST, CUSTOM_ROAST
```

**Protobuf mapping** (integer → enum):
```
0=UNKNOWN, 1=CINNAMON, 2=AMERICAN, 3=NEW_ENGLAND, 4=HALF_CITY,
5=MODERATE_LIGHT, 6=CITY, 7=CITY_PLUS, 8=FULL_CITY,
9=FULL_CITY_PLUS, 10=ITALIAN, 11=VIENNA, 12=FRENCH, 13=CUSTOM
```

### BEAN_MIX_ENUM
```
UNKNOWN = 0, SINGLE_ORIGIN = 1, BLEND = 2
```

### BEAN_ROASTING_TYPE_ENUM
```
UNKNOWN = 0, FILTER = 1, ESPRESSO = 2, OMNI = 3
```

### BeanInformation (Variety/Sort — array of these)

Each entry represents one origin/variety in the bean. Single origins have one entry; blends have multiple.

| Field | Type | Notes |
|---|---|---|
| `country` | string | Origin country |
| `region` | string | Growing region |
| `farm` | string | Farm/estate name |
| `farmer` | string | Farmer/producer name |
| `elevation` | string | Growing altitude (e.g., "1800 masl") |
| `harvest_time` | string | Harvest period |
| `variety` | string | Botanical variety (SL28, Gesha, Bourbon, etc.) |
| `processing` | string | Process method (Washed, Natural, Honey, etc.) |
| `certification` | string | Organic, Fair Trade, Rainforest Alliance, etc. |
| `percentage` | number | Blend percentage (0-100) |
| `purchasing_price` | number | |
| `fob_price` | number | FOB price |

### Frozen Information (NOT in protobuf — manual entry only)

These fields exist on the Bean class but are NOT included in the BeanProto protobuf message. They cannot be set via the share URL. In BeanScan, include these as a collapsible, hidden-by-default section in the manual entry form. Default assumption: bean is not frozen.

| Field | Type | Notes |
|---|---|---|
| `frozenDate` | string | Date frozen |
| `unfrozenDate` | string | Date thawed |
| `frozenId` | string | Auto-generated ID |
| `frozenGroupId` | string | Group ID for multi-bag freeze |
| `frozenStorageType` | BEAN_FREEZING_STORAGE_ENUM | See below |
| `frozenNote` | string | Free-text |

### BEAN_FREEZING_STORAGE_ENUM
```
UNKNOWN, COFFEE_BAG, COFFEE_JAR, ZIP_LOCK, VACUUM_SEALED, TUBE
```

**Important:** Since frozen fields can't go through the BC deep link, if the user sets frozen info in BeanScan, include a note in the Google Sheet row but remind the user to set it manually in BC after import.

### Image Handling

The protobuf has an `external_images` field (`repeated string`) containing image URLs. During import, Beanconqueror downloads images from these URLs and saves them as attachments.

**BeanScan flow for images:**
1. User snaps photo of coffee bag
2. Photo is uploaded to Google Drive (dedicated BeanScan folder)
3. Drive file is set to "anyone with link can view"
4. The shareable URL is placed in `external_images` in the protobuf
5. When BC imports via deep link, it downloads the image from Drive

For Google Sheets: the same Drive URL is stored in an "Image URL" column. Optionally use `=IMAGE(url)` in an adjacent column for inline preview.

---

## Protobuf Encoding — Exact Specification

This is how Beanconqueror's share mechanism works. Replicate it exactly.

### Proto Definition (bean.proto)
```protobuf
syntax = "proto3";
package beanconqueror;

message BeanProto {
  string name = 1;
  optional string buyDate = 2;
  optional string roastingDate = 3;
  optional string note = 4;
  optional string roaster = 5;
  optional Config config = 6;
  optional Roast roast = 7;
  optional uint64 roast_range = 8;
  optional BeanMix beanMix = 9;
  optional string roast_custom = 10;
  optional string aromatics = 11;
  optional uint64 weight = 12;
  optional bool finished = 13;
  optional uint64 cost = 14;
  repeated string attachments = 15;
  optional string cupping_points = 16;
  optional bool decaffeinated = 17;
  optional string url = 18;
  optional string ean_article_number = 19;
  optional uint32 rating = 20;
  repeated BeanInformation bean_information = 21;
  optional BeanRoastingType bean_roasting_type = 22;
  optional BeanRoastInformation bean_roast_information = 23;
  optional string qr_code = 24;
  optional bool favourite = 25;
  optional bool shared = 26;
  optional ICupping cupping = 27;
  optional IFlavor cupped_flavor = 28;
  repeated string external_images = 29;
}

message Config {
  string uuid = 1;
  uint64 unix_timestamp = 2;
}

message BeanInformation {
  optional string country = 1;
  optional string region = 2;
  optional string farm = 3;
  optional string farmer = 4;
  optional string elevation = 5;
  optional string harvest_time = 6;
  optional string variety = 7;
  optional string processing = 8;
  optional string certification = 9;
  optional uint32 percentage = 10;
  optional uint32 purchasing_price = 11;
  optional uint32 fob_price = 12;
}

message BeanRoastInformation {
  optional uint32 drop_temperature = 1;
  optional uint64 roast_length = 2;
  optional string roaster_machine = 3;
  optional uint64 green_bean_weight = 4;
  optional uint32 outside_temperature = 5;
  optional uint32 humidity = 6;
  optional string bean_uuid = 7;
  optional uint32 first_crack_minute = 8;
  optional uint32 first_crack_temperature = 9;
  optional uint32 second_crack_minute = 10;
  optional uint32 second_crack_temperature = 11;
}

message ICupping {
  optional uint64 dry_fragrance = 1;
  optional uint64 wet_aroma = 2;
  optional uint64 brightness = 3;
  optional uint64 flavor = 4;
  optional uint64 body = 5;
  optional uint64 finish = 6;
  optional uint64 sweetness = 7;
  optional uint64 clean_cup = 8;
  optional uint64 complexity = 9;
  optional uint64 uniformity = 10;
  optional uint64 cuppers_correction = 11;
}

message IFlavor {
  repeated uint64 predefined_flavors = 1;
  repeated string custom_flavors = 2;
}

enum Roast {
  UNKNOWN_ROAST = 0;
  CINNAMON_ROAST = 1;
  AMERICAN_ROAST = 2;
  NEW_ENGLAND_ROAST = 3;
  HALF_CITY_ROAST = 4;
  MODERATE_LIGHT_ROAST = 5;
  CITY_ROAST = 6;
  CITY_PLUS_ROAST = 7;
  FULL_CITY_ROAST = 8;
  FULL_CITY_PLUS_ROAST = 9;
  ITALIAN_ROAST = 10;
  VIEANNA_ROAST = 11;
  FRENCH_ROAST = 12;
  CUSTOM_ROAST = 13;
}

enum BeanMix {
  UNKNOWN_BEAN_MIX = 0;
  SINGLE_ORIGIN = 1;
  BLEND = 2;
}

enum BeanRoastingType {
  UNKNOWN_BEAN_ROASTING_TYPE = 0;
  FILTER = 1;
  ESPRESSO = 2;
  OMNI = 3;
}
```

### Encoding & URL Construction

Replicate this logic exactly (from `ShareService` in BC source):

```javascript
// 1. Create BeanProto object and populate fields
// 2. Encode to protobuf bytes
const bytes = BeanProto.encode(protoBean).finish();

// 3. Base64 encode
const base64String = btoa(String.fromCharCode(...new Uint8Array(bytes)));

// 4. Split into 400-char chunks as URL params
const loops = Math.ceil(base64String.length / 400);
let params = '';
for (let i = 0; i < loops; i++) {
  const chunk = base64String.substr(i * 400, 400);
  params += (i === 0 ? '' : '&') + 'shareUserBean' + i + '=' + chunk;
}

// 5. Construct final URL
const url = 'https://beanconqueror.com?' + params;

// 6. Open this URL — Android routes it to Beanconqueror
window.open(url, '_blank');
```

**Critical notes:**
- Chunk size is exactly 400 characters. BC's decoder expects this.
- The URL uses `beanconqueror.com` (no `www`, no trailing slash, no path).
- Android replaces `+` with spaces in URL params. BC's decoder reverses this (`replace(/ /g, '+')`), so standard base64 with `+` characters is fine.
- Do NOT set `config`, `attachments`, `favourite`, `rating`, or `shared` — BC resets these on import anyway.
- For `roast`, `beanMix`, and `bean_roasting_type`: use the integer enum values (0, 1, 2...), not the string names. The protobuf uses integers.

---

## Heuristic Parser — Vocabulary & Rules

The parser takes raw OCR text and maps it to the BeanProto fields. This is the intelligence layer that replaces an LLM call.

### Strategy

1. Run OCR on the bag photo → get raw text block
2. Normalize: lowercase, collapse whitespace, fix common OCR errors
3. Apply extraction rules in priority order (most specific first)
4. Anything unmatched goes into the `note` field

### Vocabulary Databases

**Countries** (common coffee origins — match against these):
```
Ethiopia, Kenya, Colombia, Brazil, Guatemala, Costa Rica, Honduras,
El Salvador, Panama, Peru, Bolivia, Ecuador, Mexico, Nicaragua,
Rwanda, Burundi, Congo, DRC, Tanzania, Uganda, Malawi, Zambia,
India, Indonesia, Sumatra, Java, Sulawesi, Papua New Guinea,
Yemen, Myanmar, Thailand, Vietnam, China, Yunnan, Nepal,
Hawaii, Jamaica, Timor-Leste, Laos
```

**Varieties** (botanical cultivars — match these terms):
```
SL28, SL34, Gesha (also Geisha), Bourbon, Typica, Caturra, Catuai,
Catimor, Castillo, Colombia (variety), Pacamara, Pacas, Maragogype,
Mundo Novo, Yellow Bourbon, Red Bourbon, Pink Bourbon, Orange Bourbon,
Villa Sarchi, Mokka, Java (variety), Kent, Selection 795, Chandragiri,
Sarchimor, Ruiru 11, Batian, Heirloom, Landrace, Ethiopian Heirloom,
Sidra, Tabi, Wush Wush, Dega, Kurume, 74110, 74112, 74158,
Marsellesa, Starmaya, Laurina, Liberica, Robusta, Excelsa
```

**Processing methods:**
```
Washed (also: Fully Washed, Wet Process)
Natural (also: Dry Process, Sun-Dried, Sundried)
Honey (also: Pulped Natural, Semi-Washed)
Black Honey, Red Honey, Yellow Honey, White Honey, Gold Honey
Anaerobic (also: Anaerobic Fermentation, Anaerobic Natural, Anaerobic Washed)
Carbonic Maceration (also: CM)
Wet-Hulled (also: Giling Basah) — Indonesian specific
Swiss Water Process, EA Process, Sugarcane Process — decaf specific
Experimental, Extended Fermentation, Double Fermentation, Lactic, Thermal Shock
```

**Roast level inference:**
- Direct keywords: "Light", "Medium", "Medium-Light", "Medium-Dark", "Dark", "Omni", "Filter Roast", "Espresso Roast"
- Map "Light Roast" → CINNAMON_ROAST or use CUSTOM_ROAST with roast_custom = extracted text
- Map "Medium Roast" → CITY_ROAST
- Map "Dark Roast" → FULL_CITY_PLUS_ROAST
- If unclear, use UNKNOWN_ROAST and put text in notes
- BC's roast enum names are somewhat obscure (Cinnamon, American, City, etc.). Most specialty bags say "Light/Medium/Dark" so use CUSTOM_ROAST with the bag's wording in roast_custom as the pragmatic default.

**Roasting type inference:**
- "Filter" or "Pour Over" or "Drip" → FILTER
- "Espresso" → ESPRESSO
- "Omni" or "Omniroast" → OMNI

**Elevation patterns:**
```regex
/(\d{3,4})\s*[-–—to]+\s*(\d{3,4})\s*(m\.?a\.?s\.?l\.?|masl|meters?|m)/i
/(\d{3,4})\s*(m\.?a\.?s\.?l\.?|masl|meters?|m)/i
```
Store as string exactly as found (e.g., "1800-2100 masl").

**Tasting notes / Aromatics:**
Look for sections labeled: "Tasting Notes", "Flavor Notes", "Cup Profile", "Notes", "Flavour"
Common descriptors: citrus, berry, chocolate, caramel, floral, stone fruit, tropical, nutty, honey, wine, spice, tea-like, bright, clean, complex, juicy, syrupy, creamy, etc.
These go into the `aromatics` field.

**Weight patterns:**
```regex
/(\d+)\s*(g|grams?|gr)/i
```

**Roaster name:**
Often the most prominent text on the bag, or near a logo. Hard to extract reliably with heuristics alone. If the OCR finds a URL, the domain name is often the roaster. Otherwise, this may need manual entry.

### Parser Output Structure

```javascript
{
  name: "",           // Bean/coffee name
  roaster: "",        // Roaster name
  roastingDate: "",   // Roast date if found
  aromatics: "",      // Tasting notes
  note: "",           // Everything unmapped
  weight: 0,
  cost: 0,
  roast: 0,           // Protobuf integer enum
  roast_custom: "",
  beanMix: 0,         // 0=Unknown, 1=Single Origin, 2=Blend
  bean_roasting_type: 0,
  decaffeinated: false,
  url: "",
  bean_information: [{
    country: "",
    region: "",
    farm: "",
    farmer: "",
    elevation: "",
    harvest_time: "",
    variety: "",
    processing: "",
    certification: ""
  }],
  external_images: [] // Drive URLs added later
}
```

---

## Google Sheets Schema

Sheet name: `Bean Log`

| Column | Field | Notes |
|---|---|---|
| A | Date Added | Auto-populated timestamp |
| B | Bean Name | |
| C | Roaster | |
| D | Origin Country | |
| E | Region | |
| F | Farm | |
| G | Farmer | |
| H | Variety | |
| I | Processing | |
| J | Elevation | |
| K | Roast Level | Human-readable (e.g., "Medium / City Roast") |
| L | Roast Profile | Filter / Espresso / Omni |
| M | Tasting Notes | From `aromatics` field |
| N | Weight (g) | |
| O | Cost | |
| P | Decaf | Y/N |
| Q | Harvest Time | |
| R | Certification | |
| S | Roast Date | |
| T | Buy Date | |
| U | Best Before | |
| V | Cupping Points | |
| W | Frozen | Y/N |
| X | Frozen Storage | Type if frozen |
| Y | Notes | From `note` field |
| Z | Image URL | Google Drive link |
| AA | Added to BC | Y/N |
| AB | Source | Scan / Manual |

---

## Workflow Logic

### "Add to Beanconqueror" button
1. Upload photo to Google Drive → get shareable URL
2. Encode bean data as BeanProto protobuf (with image URL in `external_images`)
3. Generate `shareUserBean` URL
4. Append row to Google Sheet (Added to BC = Y)
5. Open the BC URL (Android routes to Beanconqueror)
6. If frozen info was set, show a reminder: "Remember to set frozen details manually in Beanconqueror"

### "Add to Sheet Only" button
1. Upload photo to Google Drive → get shareable URL (if photo exists)
2. Append row to Google Sheet (Added to BC = N)
3. Show confirmation

### Manual Entry mode
Same form as scan mode, but fields start empty instead of pre-populated from OCR. Same two destination buttons.

---

## Session-by-Session Build Plan

### Session 1: Project Skeleton + Camera Capture
**Goal:** Working PWA that opens camera, captures photo, and displays it.

- Initialize project: `index.html`, `styles.css`, `app.js`, `manifest.json`, `sw.js`
- Use `<input type="file" accept="image/*" capture="environment">` for camera (most reliable cross-browser on Android)
- Photo preview with re-take option
- Skeleton review/edit form with all fields (empty, non-functional)
- Basic responsive mobile-first layout
- Deploy to GitHub Pages

**Verify:** Open on Android phone, tap capture, take photo of a bag, see it displayed.

### Session 2: Tesseract.js OCR Integration
**Goal:** Take captured photo, extract text, display it.

- Add Tesseract.js (via CDN or bundled)
- Loading indicator during OCR (can take 3-10 seconds)
- Display raw extracted text in a debug panel
- Test with 3-5 different coffee bag photos for quality assessment

**Verify:** Snap a bag, see readable text extracted. Assess OCR quality to decide if Phase 2 (LLM) will be needed later.

### Session 3: Heuristic Parser
**Goal:** Map OCR text to structured fields, populate the review form.

- Build the parser module using the vocabulary databases above
- Wire parser output to the review/edit form
- Form should be fully editable (user corrects any mistakes)
- Support adding/removing variety entries (for blends)
- "Unmapped text" shown in the notes field
- Frozen section: collapsible, hidden by default, all fields

**Verify:** Scan a bag, see fields auto-populated, edit them, confirm the data structure is correct.

### Session 4: Protobuf Encoding + BC Deep Link
**Goal:** "Add to Beanconqueror" button generates a working deep link.

- Add protobuf library (`protobufjs-minimal` or compile the .proto to JS)
- Encode form data → BeanProto → base64 → chunked URL params
- "Add to Beanconqueror" button opens the URL
- Test: verify BC opens and shows the bean with correct data

**Critical test cases:**
- Single origin with all fields populated
- Blend with 2 varieties
- Minimal data (just name + roaster)
- Special characters in text fields (accents: café, ñ, ü)
- Long tasting notes (test URL length limits)

**Verify:** Full round-trip: scan bag → review → tap Add to BC → BC opens with correct pre-filled data → save in BC.

### Session 5: Google Auth + Drive + Sheets
**Goal:** Photo upload to Drive + row append to Sheets.

- Create Google Cloud project (guide the user through console setup)
- Enable Drive API + Sheets API
- OAuth2 consent screen + credentials (web application type)
- Implement OAuth2 PKCE flow in the PWA
- Drive: upload photo to a "BeanScan" folder, set sharing to "anyone with link"
- Sheets: append row with full schema
- Wire into the two workflow buttons:
  - "Add to BC": upload image → encode protobuf (with image URL) → append sheet row → open BC URL
  - "Add to Sheet Only": upload image (if exists) → append sheet row

**Verify:** Full flow with image appearing in both BC and the Google Sheet.

### Session 6: Manual Entry + Polish
**Goal:** Complete manual entry mode, offline support, installability.

- Manual entry toggle (switches to empty form, no camera/OCR step)
- Service worker: cache app shell, Tesseract worker, vocabulary data
- `manifest.json` with proper icons for "Add to Home Screen"
- Loading states, error handling, success confirmations
- Visual polish: clean mobile UI, proper touch targets (48px minimum)

**Verify:** Install as home screen app, use offline (except Google features), full manual entry flow works.

### Session 7 (Future): LLM-Assisted Parsing
**Goal:** Optional upgrade if heuristic OCR accuracy is insufficient.

- Add a settings toggle: "Use AI-assisted field mapping"
- If enabled: send OCR text (NOT the image) to Claude Haiku API
- Structured prompt that returns JSON matching the parser output format
- Falls back to heuristic parser if API call fails
- Show estimated cost per scan (~₹1-2)

---

## UI/UX Guidelines

### Design Direction
- **Tone:** Clean, utilitarian, coffee-inspired. Not flashy — this is a tool, not a showcase.
- **Colors:** Warm neutrals (cream, warm white) with a coffee-toned accent (deep brown, or a muted terracotta). Dark text on light backgrounds for outdoor readability.
- **Typography:** One clean sans-serif for body (system font stack is fine for performance). One slightly distinctive font for headings if desired, but don't over-design.
- **Layout:** Single-column mobile layout. Large touch targets. No horizontal scrolling.

### Key UX Principles
- **The scan-to-import flow should be completable in under 60 seconds** after the first setup.
- **Pre-populated fields should be visually distinct** from empty ones (subtle background tint or icon) so the user can quickly spot what was auto-filled vs what needs manual input.
- **Destructive actions require confirmation** (clearing form, removing a variety entry).
- **The form should feel fast.** No unnecessary animations or transitions. Instant field updates.
- **Error states should be clear and actionable.** "OCR couldn't extract text — try a clearer photo or enter details manually."

### Form Layout (top to bottom)
1. Photo capture / preview (with retake button)
2. Core info: Name, Roaster, Roast Date, Buy Date
3. Roast details: Roast Level, Roast Profile (Filter/Espresso/Omni), Bean Mix
4. Variety/Sort section (expandable for blends — "Add another origin" button)
   - Country, Region, Farm, Farmer, Variety, Processing, Elevation, Harvest Time, Certification, Percentage
5. Additional: Weight, Cost, Tasting Notes, Cupping Points, Decaf toggle, URL, EAN
6. Notes (pre-filled with unmapped OCR text)
7. Frozen section (collapsed by default, toggle to expand)
8. Action buttons (sticky at bottom):
   - **"Add to Beanconqueror"** (primary — adds to BC + Sheet)
   - **"Add to Sheet Only"** (secondary)

---

## File Structure

```
beanscan/
├── index.html              # Single-page app entry
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker
├── css/
│   └── styles.css          # All styles
├── js/
│   ├── app.js              # Main app orchestration
│   ├── camera.js           # Camera capture module
│   ├── ocr.js              # Tesseract.js wrapper
│   ├── parser.js           # Heuristic field mapper
│   ├── parser-vocab.js     # Vocabulary databases (countries, varieties, etc.)
│   ├── protobuf.js         # Protobuf encoding + URL generation
│   ├── google-auth.js      # OAuth2 PKCE flow
│   ├── google-drive.js     # Drive image upload
│   ├── google-sheets.js    # Sheets row append
│   └── form.js             # Form state management + UI binding
├── proto/
│   └── bean.proto          # Copied from BC source (reference)
├── assets/
│   └── icons/              # PWA icons (192x192, 512x512)
└── README.md
```

Keep it flat and simple. No build step if possible (use ES modules with `<script type="module">`). If a build step becomes necessary (e.g., for protobuf compilation), use a minimal setup (esbuild, not webpack).

---

## Testing Checklist

Before considering any session complete, verify:

- [ ] Works on Android Chrome (primary target)
- [ ] Touch targets are at least 48x48px
- [ ] No horizontal scrolling on a 360px-wide viewport
- [ ] Loading states shown for any operation >500ms
- [ ] Error states are user-facing and actionable
- [ ] Form data is not lost on accidental navigation (use `beforeunload`)
- [ ] The protobuf URL opens Beanconqueror correctly on Android

---

## Known Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Tesseract.js accuracy on stylized bag fonts | Phase 2 LLM fallback; manual editing always available |
| Protobuf URL too long for Android intent handler | Test early in Session 4; typical bean data is well under limits |
| Google Drive image URL not accessible during BC import | Ensure sharing permission is set to "anyone with link" before encoding URL |
| BC app updates change the protobuf format | Pin to current proto definition; monitor BC releases |
| OAuth2 token expiry during use | Implement silent token refresh; show re-auth prompt if needed |
| Service worker caching stale code | Use versioned cache names; update-on-reload strategy |

---

## Reference Links

- Beanconqueror GitHub: https://github.com/graphefruit/Beanconqueror
- Bean model: `src/classes/bean/bean.ts`
- Bean proto: `src/classes/bean/bean.proto`
- Share service (encoding logic): `src/services/shareService/share-service.service.ts`
- Intent handler (decoding logic): `src/services/intentHandler/intent-handler.service.ts`
- Bean helper (import logic): `src/services/uiBeanHelper.ts`
- Bean information interface: `src/interfaces/bean/iBeanInformation.ts`
- BC's web form for creating share links: https://beanconqueror.com/create/
- Tesseract.js: https://github.com/naptha/tesseract.js
- protobufjs: https://github.com/protobufjs/protobuf.js
- Google Sheets API: https://developers.google.com/sheets/api
- Google Drive API: https://developers.google.com/drive/api
