/**
 * app.js — Main app orchestration
 *
 * Wires together camera, form, and (future) OCR / protobuf modules.
 * Session 1: camera capture + form skeleton only.
 */

import CameraModule from './camera.js';
import FormModule   from './form.js';

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
// Camera → (future OCR) → form pipeline
// ----------------------------------------------------------------
function initCapturePipeline() {
  CameraModule.onCapture(file => {
    if (!file) return; // user cleared the photo

    // Session 2 will replace this stub with Tesseract OCR
    document.getElementById('ocr-status').textContent =
      'Photo captured. OCR coming in Session 2…';
  });
}

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
    // Session 4: encode protobuf + open BC URL
    Toast.show('Beanconqueror import coming in Session 4…');
    console.log('Bean data to import:', data);
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
  initModeToggle();
  initCapturePipeline();
  initActionButtons();
  initNavigationGuard();
});
