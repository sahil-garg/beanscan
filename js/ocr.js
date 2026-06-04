/**
 * ocr.js — Tesseract.js v5 wrapper
 *
 * One long-lived worker per session. First scan ~10s (language data download);
 * subsequent scans ~2-5s (worker already warm).
 *
 * Both the worker script and the WASM core are served from our own domain
 * (js/vendor/) so that self.location inside the worker resolves to our
 * GitHub Pages origin. This is critical: the emscripten-compiled core uses
 * self.location to locate its binary — and corePath must point to the exact
 * .js file (not a directory) so Tesseract doesn't try to load a SIMD variant
 * that may not exist or may load from the wrong origin.
 *
 * OEM 1 = LSTM_ONLY (neural-net engine, more accurate on modern traineddata).
 */

const OCRModule = (() => {
  let worker = null;
  let currentProgressFn = null;

  const STATUS_LABELS = {
    'loading tesseract core':       'Loading OCR engine…',
    'initializing tesseract':       'Initializing…',
    'loading language traineddata': 'Loading language data…',
    'initializing api':             'Almost ready…',
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
    worker = await Tesseract.createWorker('eng', 1, {
      logger:        handleLog,
      workerBlobURL: false,
      // Both files served from our domain — avoids cross-origin self.location issues
      workerPath:    './js/vendor/tesseract-worker.min.js',
      // Point at the exact file, not the directory, so Tesseract skips SIMD detection
      // and loads exactly this file (WASM binary is embedded as base64 inside it)
      corePath:      './js/vendor/tesseract-core-lstm.wasm.js',
      langPath:      'https://tessdata.projectnaptha.com/4.0.0',
    });
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
