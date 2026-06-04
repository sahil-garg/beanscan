/**
 * settings.js — Persistent app settings via localStorage
 *
 * Currently manages one thing: whether AI-assisted parsing is enabled,
 * and the user's Anthropic API key for it.
 */

const SettingsModule = (() => {
  const KEY_LLM_ON  = 'beanscan.llm.enabled';
  const KEY_API_KEY = 'beanscan.llm.apiKey';

  function isLLMEnabled() {
    return localStorage.getItem(KEY_LLM_ON) === 'true' && !!getAPIKey();
  }

  function getAPIKey() {
    return localStorage.getItem(KEY_API_KEY) || '';
  }

  function init() {
    const modal      = document.getElementById('settings-modal');
    const openBtn    = document.getElementById('btn-settings');
    const closeBtn   = document.getElementById('settings-close');
    const saveBtn    = document.getElementById('settings-save');
    const llmToggle  = document.getElementById('settings-llm-toggle');
    const apiKeyEl   = document.getElementById('settings-api-key');
    const showHide   = document.getElementById('settings-apikey-toggle');

    function openModal() {
      llmToggle.checked = isLLMEnabled();
      apiKeyEl.value    = getAPIKey();
      modal.classList.add('open');
      apiKeyEl.focus();
    }

    function closeModal() {
      modal.classList.remove('open');
    }

    openBtn?.addEventListener('click', openModal);
    closeBtn?.addEventListener('click', closeModal);

    // Close on backdrop click
    modal?.addEventListener('click', e => { if (e.target === modal) closeModal(); });

    // Show/hide API key
    showHide?.addEventListener('click', () => {
      const isHidden = apiKeyEl.type === 'password';
      apiKeyEl.type  = isHidden ? 'text' : 'password';
      showHide.textContent = isHidden ? 'Hide' : 'Show';
    });

    saveBtn?.addEventListener('click', () => {
      localStorage.setItem(KEY_LLM_ON,  llmToggle.checked ? 'true' : 'false');
      localStorage.setItem(KEY_API_KEY, apiKeyEl.value.trim());
      closeModal();
    });

    // Keyboard: Escape closes modal
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
    });
  }

  return { init, isLLMEnabled, getAPIKey };
})();

export default SettingsModule;
