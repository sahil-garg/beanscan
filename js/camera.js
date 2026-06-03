/**
 * camera.js — Camera capture module
 *
 * Handles photo capture via the native file input, previewing the image,
 * and exposing the captured File object to the rest of the app.
 */

const CameraModule = (() => {
  let capturedFile = null;
  let onCaptureCallback = null;

  /**
   * Register a callback invoked when the user captures or retakes a photo.
   * cb(file) — file is a File object (or null if cleared).
   */
  function onCapture(cb) {
    onCaptureCallback = cb;
  }

  function init() {
    const input       = document.getElementById('camera-input');
    const captureBtn  = document.getElementById('btn-capture');
    const retakeBtn   = document.getElementById('btn-retake');
    const preview     = document.getElementById('photo-preview');
    const placeholder = document.getElementById('photo-placeholder');

    if (!input || !captureBtn) return;

    // Clicking the styled button triggers the hidden file input
    captureBtn.addEventListener('click', () => input.click());

    retakeBtn?.addEventListener('click', () => {
      // Clear stored file and reset UI
      capturedFile = null;
      input.value = '';
      preview.src = '';
      preview.style.display = 'none';
      placeholder.style.display = '';
      captureBtn.classList.remove('hidden');
      retakeBtn.classList.add('hidden');
      onCaptureCallback?.(null);
    });

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;

      capturedFile = file;

      // Show preview
      const url = URL.createObjectURL(file);
      preview.src = url;
      preview.style.display = 'block';
      placeholder.style.display = 'none';
      captureBtn.classList.add('hidden');
      retakeBtn.classList.remove('hidden');

      onCaptureCallback?.(file);
    });
  }

  /** Returns the currently captured File, or null if none. */
  function getFile() {
    return capturedFile;
  }

  return { init, onCapture, getFile };
})();

export default CameraModule;
