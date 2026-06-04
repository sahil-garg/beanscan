/**
 * parser-vocab.js — vocabulary databases for the heuristic field parser
 *
 * All lists are ordered: longest / most specific patterns first so that
 * earlier matches take priority when iterating.
 */

export const COUNTRIES = [
  'Papua New Guinea', 'Costa Rica', 'El Salvador', 'Timor-Leste',
  'Ethiopia', 'Kenya', 'Colombia', 'Brazil', 'Guatemala',
  'Honduras', 'Panama', 'Peru', 'Bolivia', 'Ecuador', 'Mexico', 'Nicaragua',
  'Rwanda', 'Burundi', 'Congo', 'DRC', 'Tanzania', 'Uganda', 'Malawi', 'Zambia',
  'India', 'Indonesia', 'Sumatra', 'Sulawesi', 'Java', 'Yemen',
  'Myanmar', 'Thailand', 'Vietnam', 'China', 'Yunnan', 'Nepal',
  'Hawaii', 'Jamaica', 'Laos',
];

// Matched in order — first match wins. Longer/more specific entries are first.
export const PROCESSING_METHODS = [
  { re: /anaerobic\s*(fermentation|natural|washed)?/i, label: 'Anaerobic' },
  { re: /carbonic\s*maceration|\bCM\b/,                label: 'Carbonic Maceration' },
  { re: /wet[- ]?hulled|giling\s*basah/i,              label: 'Wet-Hulled' },
  { re: /fully\s*washed|wet\s*process/i,               label: 'Washed' },
  { re: /pulped\s*natural|semi[- ]?washed/i,           label: 'Honey' },
  { re: /black\s*honey/i,                              label: 'Black Honey' },
  { re: /red\s*honey/i,                                label: 'Red Honey' },
  { re: /yellow\s*honey/i,                             label: 'Yellow Honey' },
  { re: /white\s*honey/i,                              label: 'White Honey' },
  { re: /gold\s*honey/i,                               label: 'Gold Honey' },
  { re: /\bhoney\b/i,                                  label: 'Honey' },
  { re: /sun[- ]?dried|sundried|dry\s*process/i,       label: 'Natural' },
  { re: /\bnatural\b/i,                                label: 'Natural' },
  { re: /\bwashed\b/i,                                 label: 'Washed' },
  { re: /swiss\s*water/i,                              label: 'Swiss Water Process' },
  { re: /sugarcane\s*process/i,                        label: 'Sugarcane Process' },
  { re: /ea\s*process|ethyl\s*acetate/i,               label: 'EA Process' },
  { re: /extended\s*fermentation/i,                    label: 'Extended Fermentation' },
  { re: /double\s*fermentation/i,                      label: 'Double Fermentation' },
  { re: /thermal\s*shock/i,                            label: 'Thermal Shock' },
  { re: /\blactic\b/i,                                 label: 'Lactic' },
  { re: /\bexperimental\b/i,                           label: 'Experimental' },
];

export const VARIETIES = [
  // Multi-word first
  'Yellow Bourbon', 'Red Bourbon', 'Pink Bourbon', 'Orange Bourbon',
  'Ethiopian Heirloom', 'Mundo Novo', 'Villa Sarchi', 'Selection 795',
  'Wush Wush', 'Ruiru 11',
  // Single tokens
  'SL28', 'SL34', 'Gesha', 'Geisha', 'Bourbon', 'Typica', 'Caturra', 'Catuai',
  'Catimor', 'Castillo', 'Pacamara', 'Pacas', 'Maragogype',
  'Chandragiri', 'Sarchimor', 'Batian', 'Heirloom', 'Landrace',
  'Sidra', 'Tabi', 'Dega', 'Kurume', 'Mokka', 'Kent',
  '74110', '74112', '74158',
  'Marsellesa', 'Starmaya', 'Laurina', 'Liberica', 'Robusta', 'Excelsa',
];

export const CERTIFICATIONS = [
  'Rainforest Alliance', 'Bird Friendly', 'Direct Trade', 'Shade Grown',
  'Fair Trade', 'Fairtrade', 'Organic', 'UTZ',
];

// Headers that introduce tasting note sections on coffee bag copy
export const TASTING_NOTE_HEADERS = [
  /tasting\s*notes?/i,
  /flavou?r\s*notes?/i,
  /cup(?:ping)?\s*(?:profile|notes?)/i,
  /notes?\s*:/i,
  /tastes?\s*like/i,
  /in\s*the\s*cup/i,
];

// More specific patterns must come before more general ones.
// roast (int) = protobuf enum value; custom = string for roast_custom field (null = use enum name)
export const ROAST_LEVELS = [
  { re: /light[- ]?medium\b|medium[- ]?light\b/i,   roast: 13, custom: 'Light-Medium' },
  { re: /medium[- ]?dark\b|dark[- ]?medium\b/i,     roast: 13, custom: 'Medium-Dark' },
  { re: /french\s*roast\b/i,                         roast: 12, custom: null },
  { re: /italian\s*roast\b/i,                        roast: 10, custom: null },
  { re: /vienna\s*roast\b/i,                         roast: 11, custom: null },
  { re: /full\s*city\s*\+|full\s*city\s*plus/i,      roast: 9,  custom: null },
  { re: /full\s*city\b/i,                            roast: 8,  custom: null },
  { re: /city\s*\+|city\s*plus/i,                    roast: 7,  custom: null },
  { re: /\bcity\s*roast\b/i,                         roast: 6,  custom: null },
  { re: /\bespresso\s*roast\b/i,                     roast: 8,  custom: null },
  { re: /\bfilter\s*roast\b/i,                       roast: 5,  custom: null },
  { re: /light\s*roast|lightly\s*roasted/i,          roast: 13, custom: 'Light' },
  { re: /medium\s*roast|medium\s*roasted/i,          roast: 6,  custom: null },
  { re: /dark\s*roast|darkly\s*roasted/i,            roast: 9,  custom: null },
  // Generic single-word roast descriptors — lower confidence, last resort
  { re: /\blight\b/i,                                roast: 13, custom: 'Light' },
  { re: /\bmedium\b/i,                               roast: 6,  custom: null },
  { re: /\bdark\b/i,                                 roast: 9,  custom: null },
];

// type (int) = BeanRoastingType enum: 1=Filter, 2=Espresso, 3=Omni
export const ROASTING_TYPES = [
  { re: /\bomni(?:roast)?\b/i,                        type: 3 },
  { re: /\bespresso\b/i,                              type: 2 },
  { re: /\bfilter\b|\bpour[- ]?over\b|\bdrip\b/i,    type: 1 },
];
