/**
 * app.js — Main app orchestration
 *
 * Wires together camera, OCR, form, and (future) protobuf modules.
 */

import CameraModule   from './camera.js';
import FormModule     from './form.js';
import OCRModule      from './ocr.js';
import ParserModule   from './parser.js';
import LLMParser      from './llm-parser.js';
import SettingsModule from './settings.js';
import ProtobufModule from './protobuf.js';

// ----------------------------------------------------------------
// Service worker registration
// ----------------------------------------------------------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .catch(err => console.warn('SW registration failed:', err));
  });
}

// ----------------------------------------------------------------
// Toast notification helper
// ----------------------------------------------------------------
const Toast = (() => {
  let timer = null;
  const el = document.getElementById('toast');

  function show(message, type = '', duration = 3000) {
    if (!el) return;
    el.textContent = message;
    el.className = 'visible' + (type ? ` ${type}` : '');
    clearTimeout(timer);
    timer = setTimeout(hide, duration);
  }

  function hide() {
    el?.classList.remove('visible');
  }

  return { show, hide };
})();

// ----------------------------------------------------------------
// Mode toggle (Scan / Manual)
// ----------------------------------------------------------------
function initModeToggle() {
  const btnScan   = document.getElementById('btn-mode-scan');
  const btnManual = document.getElementById('btn-mode-manual');
  const cameraSection = document.getElementById('camera-section');

  function setMode(mode) {
    if (mode === 'scan') {
      btnScan.classList.add('active');
      btnManual.classList.remove('active');
      cameraSection.classList.remove('hidden');
    } else {
      btnManual.classList.add('active');
      btnScan.classList.remove('active');
      cameraSection.classList.add('hidden');
      // Clear any captured photo state
      CameraModule.getFile() && document.getElementById('btn-retake')?.click();
    }
    FormModule.clear();
  }

  btnScan?.addEventListener('click',   () => setMode('scan'));
  btnManual?.addEventListener('click', () => setMode('manual'));
}

// ----------------------------------------------------------------
// OCR progress UI helpers
// ----------------------------------------------------------------
const OcrUI = (() => {
  const statusEl   = () => document.getElementById('ocr-status');
  const barEl      = () => document.getElementById('ocr-progress-bar');
  const fillEl     = () => document.getElementById('ocr-progress-fill');
  const sectionEl  = () => document.getElementById('ocr-output-section');
  const metaEl     = () => document.getElementById('ocr-meta');
  const rawTextEl  = () => document.getElementById('ocr-raw-text');

  function setProgress(label, pct) {
    const s = statusEl();
    s.textContent = label;
    s.classList.remove('ocr-status-error');
    barEl().classList.remove('hidden');
    fillEl().style.width = `${pct}%`;
  }

  // Show a persistent warning without hiding the raw OCR text panel
  function showWarning(message) {
    barEl().classList.add('hidden');
    fillEl().style.width = '0%';
    const s = statusEl();
    s.textContent = message;
    s.classList.add('ocr-status-error');
  }

  function showResult(text, confidence, wordCount) {
    barEl().classList.add('hidden');
    fillEl().style.width = '0%';
    statusEl().textContent =
      `Done — ${wordCount} word${wordCount !== 1 ? 's' : ''} found (${confidence}% confidence)`;

    metaEl().textContent =
      `${wordCount} words · ${confidence}% confidence`;
    rawTextEl().textContent = text || '(no text extracted)';
    sectionEl().classList.remove('hidden');
    // Scroll the raw text panel into view so the user sees it
    sectionEl().scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function showError(message) {
    barEl().classList.add('hidden');
    fillEl().style.width = '0%';
    statusEl().textContent = message;
    sectionEl().classList.add('hidden');
  }

  function reset() {
    const s = statusEl();
    s.textContent = '';
    s.classList.remove('ocr-status-error');
    barEl().classList.add('hidden');
    fillEl().style.width = '0%';
    sectionEl().classList.add('hidden');
    rawTextEl().textContent = '';
    metaEl().textContent = '';
  }

  return { setProgress, showResult, showError, showWarning, reset };
})();

// ----------------------------------------------------------------
// Camera → parse → form pipeline
// ----------------------------------------------------------------
function initCapturePipeline() {
  let scanId = 0;

  CameraModule.onCapture(async file => {
    if (!file) {
      OcrUI.reset();
      return;
    }

    const thisScan = ++scanId;

    try {
      let parsed;

      if (SettingsModule.isLLMEnabled()) {
        // Vision path: send image directly to Claude — no OCR step
        OcrUI.setProgress('Reading bag with AI…', 30);

        parsed = await LLMParser.parseImage(
          file,
          SettingsModule.getAPIKey(),
          SettingsModule.getProxyUrl(),
        );

        if (scanId !== thisScan) return;

        FormModule.populate(parsed);
        document.getElementById('ocr-progress-bar')?.classList.add('hidden');
        document.getElementById('ocr-progress-fill').style.width = '0%';
        document.getElementById('ocr-status').textContent = '✓ AI vision complete — review and edit fields below.';
        // Hide the raw OCR text section (no OCR was run)
        document.getElementById('ocr-output-section')?.classList.add('hidden');

      } else {
        // OCR path: Tesseract + heuristic parser
        OcrUI.setProgress('Photo received — starting OCR…', 1);

        const result = await OCRModule.recognize(file, (label, pct) => {
          if (scanId !== thisScan) return;
          OcrUI.setProgress(label, pct);
        });

        if (scanId !== thisScan) return;

        OcrUI.showResult(result.text, result.confidence, result.wordCount);
        parsed = ParserModule.parse(result.text);
        FormModule.populate(parsed);
        document.getElementById('ocr-progress-bar')?.classList.add('hidden');
        document.getElementById('ocr-progress-fill').style.width = '0%';
      }

    } catch (err) {
      if (scanId !== thisScan) return;
      const errMsg = err?.message ?? String(err) ?? 'Unknown error';
      console.error('Parse failed:', err);
      const msg = SettingsModule.isLLMEnabled()
        ? `AI vision failed: ${errMsg}`
        : (errMsg.toLowerCase().includes('not loaded')
            ? 'OCR engine not loaded yet — please wait a moment and retake.'
            : `OCR error: ${errMsg}`);
      OcrUI.showError(msg);
      Toast.show(msg, 'error', 8000);
    }
  });
}

// Catch any unhandled promise rejections and surface them visibly
window.addEventListener('unhandledrejection', e => {
  const msg = e.reason?.message ?? String(e.reason) ?? 'Unknown error';
  console.error('Unhandled rejection:', e.reason);
  Toast.show(`Unhandled error: ${msg}`, 'error', 8000);
});

// ----------------------------------------------------------------
// Action buttons
// Stub handlers — real logic added in Session 4 (BC) and 5 (Sheets)
// ----------------------------------------------------------------
function initActionButtons() {
  const btnBC    = document.getElementById('btn-add-bc');
  const btnSheet = document.getElementById('btn-add-sheet');

  btnBC?.addEventListener('click', () => {
    const data = FormModule.read();
    if (!data.name) {
      Toast.show('Please enter a bean name first.', 'error');
      return;
    }

    try {
      const url = ProtobufModule.buildShareUrl(data);
      window.open(url, '_blank');

      // Session 5 will append the Sheets row here
      Toast.show('Opening Beanconqueror…', '', 4000);

      // Remind user to set frozen fields manually in BC (they can't go via deep link)
      if (data.frozen?.isFrozen) {
        setTimeout(() => {
          Toast.show('Remember to set frozen storage details manually in Beanconqueror.', '', 6000);
        }, 4500);
      }
    } catch (err) {
      console.error('Protobuf encode failed:', err);
      Toast.show(`Export failed: ${err.message}`, 'error', 6000);
    }
  });

  btnSheet?.addEventListener('click', () => {
    const data = FormModule.read();
    if (!data.name) {
      Toast.show('Please enter a bean name first.', 'error');
      return;
    }
    // Session 5: write to Google Sheets
    Toast.show('Google Sheets logging coming in Session 5…');
    console.log('Bean data to log:', data);
  });
}

// ----------------------------------------------------------------
// Guard against accidental navigation when form has data
// ----------------------------------------------------------------
function initNavigationGuard() {
  window.addEventListener('beforeunload', e => {
    const nameField = document.getElementById('field-name');
    if (nameField?.value.trim()) {
      e.preventDefault();
      // Modern browsers show a generic message; the string here is ignored
      e.returnValue = '';
    }
  });
}

// ----------------------------------------------------------------
// Boot
// ----------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  CameraModule.init();
  FormModule.init();
  SettingsModule.init();
  initModeToggle();
  initCapturePipeline();
  initActionButtons();
  initNavigationGuard();
});
