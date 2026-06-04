/**
 * settings.js — Persistent app settings via localStorage
 */

const SettingsModule = (() => {
  const KEY_LLM_ON   = 'beanscan.llm.enabled';
  const KEY_API_KEY  = 'beanscan.llm.apiKey';
  const KEY_PROXY    = 'beanscan.llm.proxyUrl';

  function isLLMEnabled() {
    return localStorage.getItem(KEY_LLM_ON) === 'true' && !!getAPIKey() && !!getProxyUrl();
  }

  function getAPIKey()  { return localStorage.getItem(KEY_API_KEY) || ''; }
  function getProxyUrl() { return localStorage.getItem(KEY_PROXY)   || ''; }

  function init() {
    const modal      = document.getElementById('settings-modal');
    const openBtn    = document.getElementById('btn-settings');
    const closeBtn   = document.getElementById('settings-close');
    const saveBtn    = document.getElementById('settings-save');
    const llmToggle  = document.getElementById('settings-llm-toggle');
    const apiKeyEl   = document.getElementById('settings-api-key');
    const proxyEl    = document.getElementById('settings-proxy-url');
    const showHide   = document.getElementById('settings-apikey-toggle');

    function openModal() {
      llmToggle.checked = localStorage.getItem(KEY_LLM_ON) === 'true';
      apiKeyEl.value    = getAPIKey();
      proxyEl.value     = getProxyUrl();
      modal.classList.add('open');
    }

    function closeModal() { modal.classList.remove('open'); }

    openBtn?.addEventListener('click', openModal);
    closeBtn?.addEventListener('click', closeModal);
    modal?.addEventListener('click', e => { if (e.target === modal) closeModal(); });

    showHide?.addEventListener('click', () => {
      const hidden = apiKeyEl.type === 'password';
      apiKeyEl.type = hidden ? 'text' : 'password';
      showHide.textContent = hidden ? 'Hide' : 'Show';
    });

    saveBtn?.addEventListener('click', () => {
      localStorage.setItem(KEY_LLM_ON,  llmToggle.checked ? 'true' : 'false');
      localStorage.setItem(KEY_API_KEY, apiKeyEl.value.trim());
      localStorage.setItem(KEY_PROXY,   proxyEl.value.trim());
      closeModal();
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
    });
  }

  return { init, isLLMEnabled, getAPIKey, getProxyUrl };
})();

export default SettingsModule;
