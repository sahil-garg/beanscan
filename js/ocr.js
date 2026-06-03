/**
 * ocr.js — Tesseract.js wrapper
 *
 * Manages one long-lived worker (expensive to init — ~5s + ~10MB language
 * download the first time). Subsequent scans reuse the same worker and
 * skip the init phase, so they complete in 2-5s instead of 10s.
 *
 * Tesseract is loaded as a global from the CDN <script> in index.html.
 * This module only uses it asynchronously (on first recognize() call),
 * so there's no race with the CDN script loading.
 */

const OCRModule = (() => {
  let worker = null;
  let currentProgressFn = null; // updated each call; worker's logger uses this ref

  // Maps Tesseract's internal status strings to user-facing labels
  const STATUS_LABELS = {
    'loading tesseract core':       'Loading OCR engine…',
    'initializing tesseract':       'Initializing…',
    'loading language traineddata': 'Loading language data…',
    'initializing api':             'Almost ready…',
    'recognizing text':             null, // built dynamically with %
  };

  function handleLog(m) {
    if (!currentProgressFn) return;
    const pct = Math.round((m.progress || 0) * 100);
    let label;
    if (m.status === 'recognizing text') {
      label = `Reading text… ${pct}%`;
    } else {
      label = STATUS_LABELS[m.status] ?? m.status;
    }
    currentProgressFn(label, pct);
  }

  async function ensureWorker() {
    if (worker) return;
    // OEM 1 = LSTM_ONLY (more accurate than legacy OCR)
    worker = await Tesseract.createWorker('eng', 1, { logger: handleLog });
  }

  /**
   * Run OCR on an image file.
   * @param {File} imageFile
   * @param {(label: string, pct: number) => void} onProgress
   * @returns {{ text: string, confidence: number, wordCount: number }}
   */
  async function recognize(imageFile, onProgress) {
    if (typeof Tesseract === 'undefined') {
      throw new Error(
        'OCR engine not loaded yet — check your internet connection and try again.'
      );
    }

    currentProgressFn = onProgress;
    try {
      await ensureWorker();
      const { data } = await worker.recognize(imageFile);
      return {
        text:       data.text.trim(),
        confidence: Math.round(data.confidence),
        wordCount:  data.words?.length ?? 0,
      };
    } finally {
      currentProgressFn = null;
    }
  }

  return { recognize };
})();

export default OCRModule;
