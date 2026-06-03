/**
 * form.js — Form state management and UI binding
 *
 * Manages the review/edit form: reading field values, populating from
 * parser output, handling dynamic variety entries, and the frozen section.
 */

const FormModule = (() => {
  // ----------------------------------------------------------------
  // Variety entries (one per origin; blends have multiple)
  // ----------------------------------------------------------------
  let varietyCount = 0;

  function createVarietyEntry(index, data = {}) {
    const entry = document.createElement('div');
    entry.className = 'variety-entry';
    entry.dataset.index = index;

    const label = index === 0 ? 'Origin' : `Origin ${index + 1}`;
    const isOnlyEntry = index === 0;

    entry.innerHTML = `
      <div class="variety-entry-header">
        <span class="variety-entry-title">${label}</span>
        ${!isOnlyEntry ? `<button type="button" class="btn-remove-variety" aria-label="Remove origin" title="Remove this origin">✕</button>` : ''}
      </div>
      <div class="field-row">
        <div class="field">
          <label>Country</label>
          <input type="text" name="country" placeholder="e.g. Ethiopia" value="${data.country || ''}">
        </div>
        <div class="field">
          <label>Region</label>
          <input type="text" name="region" placeholder="e.g. Yirgacheffe" value="${data.region || ''}">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Farm</label>
          <input type="text" name="farm" placeholder="Farm name" value="${data.farm || ''}">
        </div>
        <div class="field">
          <label>Farmer</label>
          <input type="text" name="farmer" placeholder="Producer name" value="${data.farmer || ''}">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Variety</label>
          <input type="text" name="variety" placeholder="e.g. Heirloom, Gesha" value="${data.variety || ''}">
        </div>
        <div class="field">
          <label>Processing</label>
          <input type="text" name="processing" placeholder="e.g. Washed, Natural" value="${data.processing || ''}">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Elevation</label>
          <input type="text" name="elevation" placeholder="e.g. 1800 masl" value="${data.elevation || ''}">
        </div>
        <div class="field">
          <label>Harvest Time</label>
          <input type="text" name="harvest_time" placeholder="e.g. Nov–Jan 2024" value="${data.harvest_time || ''}">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Certification</label>
          <input type="text" name="certification" placeholder="e.g. Organic" value="${data.certification || ''}">
        </div>
        <div class="field">
          <label>Blend %</label>
          <input type="number" name="percentage" placeholder="100" min="0" max="100" value="${data.percentage || ''}">
        </div>
      </div>
    `;

    // Wire remove button (only on non-first entries)
    const removeBtn = entry.querySelector('.btn-remove-variety');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        if (!confirm('Remove this origin entry?')) return;
        entry.remove();
        reNumberVarieties();
      });
    }

    return entry;
  }

  function reNumberVarieties() {
    const container = document.getElementById('variety-container');
    container.querySelectorAll('.variety-entry').forEach((el, i) => {
      el.dataset.index = i;
      const titleEl = el.querySelector('.variety-entry-title');
      if (titleEl) titleEl.textContent = i === 0 ? 'Origin' : `Origin ${i + 1}`;
    });
  }

  function addVariety(data = {}) {
    const container = document.getElementById('variety-container');
    const entry = createVarietyEntry(varietyCount, data);
    container.appendChild(entry);
    varietyCount++;
    return entry;
  }

  // ----------------------------------------------------------------
  // Populate form from parser output (autofill)
  // ----------------------------------------------------------------
  function populate(parsed) {
    // Mark fields populated by the parser with the autofill tint
    function setField(id, value) {
      const el = document.getElementById(id);
      if (!el || value === undefined || value === null || value === '') return;
      el.value = value;
      el.classList.add('autofilled');
    }

    setField('field-name',         parsed.name);
    setField('field-roaster',      parsed.roaster);
    setField('field-roasting-date', parsed.roastingDate);
    setField('field-aromatics',    parsed.aromatics);
    setField('field-notes',        parsed.note);
    setField('field-weight',       parsed.weight || '');
    setField('field-cost',         parsed.cost || '');
    setField('field-url',          parsed.url);
    setField('field-ean',          parsed.ean_article_number);
    setField('field-cupping',      parsed.cupping_points);

    // Enums
    const roastEl = document.getElementById('field-roast');
    if (roastEl && parsed.roast !== undefined) {
      roastEl.value = parsed.roast;
      roastEl.classList.add('autofilled');
    }
    setField('field-roast-custom', parsed.roast_custom);

    const beanMixEl = document.getElementById('field-bean-mix');
    if (beanMixEl && parsed.beanMix !== undefined) {
      beanMixEl.value = parsed.beanMix;
      beanMixEl.classList.add('autofilled');
    }

    const roastTypeEl = document.getElementById('field-roast-type');
    if (roastTypeEl && parsed.bean_roasting_type !== undefined) {
      roastTypeEl.value = parsed.bean_roasting_type;
      roastTypeEl.classList.add('autofilled');
    }

    // Decaf toggle
    if (parsed.decaffeinated) {
      const el = document.getElementById('field-decaf');
      if (el) el.checked = true;
    }

    // Variety / origin entries
    const container = document.getElementById('variety-container');
    container.innerHTML = '';
    varietyCount = 0;

    const infos = parsed.bean_information?.length
      ? parsed.bean_information
      : [{}];
    infos.forEach(info => addVariety(info));
  }

  // ----------------------------------------------------------------
  // Read form data back into the parsed data structure
  // ----------------------------------------------------------------
  function read() {
    function val(id) {
      const el = document.getElementById(id);
      return el ? el.value.trim() : '';
    }
    function numVal(id) {
      const v = val(id);
      return v ? Number(v) : 0;
    }
    function checked(id) {
      const el = document.getElementById(id);
      return el ? el.checked : false;
    }

    // Read all variety entries
    const container = document.getElementById('variety-container');
    const bean_information = [];
    container.querySelectorAll('.variety-entry').forEach(entry => {
      bean_information.push({
        country:      entry.querySelector('[name="country"]')?.value.trim()      || '',
        region:       entry.querySelector('[name="region"]')?.value.trim()       || '',
        farm:         entry.querySelector('[name="farm"]')?.value.trim()         || '',
        farmer:       entry.querySelector('[name="farmer"]')?.value.trim()       || '',
        variety:      entry.querySelector('[name="variety"]')?.value.trim()      || '',
        processing:   entry.querySelector('[name="processing"]')?.value.trim()   || '',
        elevation:    entry.querySelector('[name="elevation"]')?.value.trim()    || '',
        harvest_time: entry.querySelector('[name="harvest_time"]')?.value.trim() || '',
        certification:entry.querySelector('[name="certification"]')?.value.trim()|| '',
        percentage:   Number(entry.querySelector('[name="percentage"]')?.value || 0),
      });
    });

    // Frozen section
    const frozen = {
      isFrozen:           checked('field-is-frozen'),
      frozenDate:         val('field-frozen-date'),
      unfrozenDate:       val('field-unfrozen-date'),
      frozenStorageType:  numVal('field-frozen-storage'),
      frozenNote:         val('field-frozen-note'),
    };

    return {
      name:               val('field-name'),
      roaster:            val('field-roaster'),
      roastingDate:       val('field-roasting-date'),
      buyDate:            val('field-buy-date'),
      bestDate:           val('field-best-date'),
      aromatics:          val('field-aromatics'),
      note:               val('field-notes'),
      weight:             numVal('field-weight'),
      cost:               numVal('field-cost'),
      roast:              numVal('field-roast'),
      roast_custom:       val('field-roast-custom'),
      beanMix:            numVal('field-bean-mix'),
      bean_roasting_type: numVal('field-roast-type'),
      decaffeinated:      checked('field-decaf'),
      url:                val('field-url'),
      ean_article_number: val('field-ean'),
      cupping_points:     val('field-cupping'),
      bean_information,
      frozen,
      external_images: [],  // Drive URLs added later in Session 5
    };
  }

  // ----------------------------------------------------------------
  // Clear (reset) the form
  // ----------------------------------------------------------------
  function clear() {
    const form = document.getElementById('bean-form');
    if (form) form.reset();

    document.querySelectorAll('.autofilled').forEach(el =>
      el.classList.remove('autofilled')
    );

    // Reset to one empty variety entry
    const container = document.getElementById('variety-container');
    container.innerHTML = '';
    varietyCount = 0;
    addVariety();
  }

  // ----------------------------------------------------------------
  // Collapsible frozen section
  // ----------------------------------------------------------------
  function initCollapsible() {
    document.querySelectorAll('.collapsible-header').forEach(header => {
      header.addEventListener('click', () => {
        const body = header.nextElementSibling;
        const isOpen = header.classList.contains('open');
        header.classList.toggle('open', !isOpen);
        body.classList.toggle('open', !isOpen);
        header.setAttribute('aria-expanded', !isOpen);
      });
    });
  }

  // ----------------------------------------------------------------
  // Init
  // ----------------------------------------------------------------
  function init() {
    initCollapsible();

    // Add-another-origin button
    const addBtn = document.getElementById('btn-add-variety');
    addBtn?.addEventListener('click', () => addVariety());

    // Start with one empty origin entry
    clear();
  }

  return { init, populate, read, clear, addVariety };
})();

export default FormModule;
