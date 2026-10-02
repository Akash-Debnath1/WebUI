/**
 * Localhost AI Chat - Settings View Controller
 * Pure Vanilla JavaScript ES Module
 */

import {
  getProviders,
  saveProvider,
  deleteProvider,
  getSettings,
  saveSettings,
  getStorageStats,
  exportBackupJson,
  importBackupJson,
  deleteAllChats,
  clearAllLocalData
} from './storage.js';
import { testConnection } from './api.js';
import { escapeHtml, formatBytes, debounce } from './utils.js';
import { detectSearchEngine } from './websearch.js';

let editingProviderId = null;

export const PROVIDER_PRESETS = {
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo']
  },
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner']
  },
  tokenharbor: {
    name: 'TokenHarbor',
    baseUrl: 'https://tokenharbor.ai/v1',
    models: ['deepseek-v4.1-flash:free']
  },
  groq: {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']
  },
  ollama: {
    name: 'Ollama (Local)',
    baseUrl: 'http://localhost:11434/v1',
    models: ['llama3', 'mistral', 'qwen2.5']
  },
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['anthropic/claude-3.5-sonnet', 'meta-llama/llama-3.3-70b-instruct']
  },
  lmstudio: {
    name: 'LM Studio (Local)',
    baseUrl: 'http://localhost:1234/v1',
    models: ['local-model']
  }
};

/**
 * Initialize Settings page UI elements and listeners
 * @param {Object} context - Callbacks for refreshing UI, showing modals and toasts
 */
export function initSettingsView(context) {
  const { showToast, showConfirmModal, onThemeChange, refreshApp } = context;

  renderProvidersList(showToast, refreshApp);
  renderAppearanceSettings(onThemeChange);
  renderChatSettings();
  renderWebSearchSettings(showToast);
  renderStorageSettings(showConfirmModal, showToast, refreshApp);
  setupProviderFormListeners(showToast, refreshApp);

  // Back to chat button
  document.getElementById('btn-back-to-chat')?.addEventListener('click', () => {
    window.location.hash = '#chat';
  });
}

/**
 * Render list of configured providers in Settings
 */
export function renderProvidersList(showToast, refreshApp) {
  const container = document.getElementById('providers-list-container');
  if (!container) return;

  const providers = getProviders();
  const settings = getSettings();
  const activeProviderId = settings.activeProviderId || (providers[0]?.id ?? '');

  if (providers.length === 0) {
    container.innerHTML = `
      <div class="empty-list-notice">
        <p><strong>No providers configured yet.</strong></p>
        <p class="text-subtle">Click the <strong>Add Provider</strong> button above to connect OpenAI, DeepSeek, Ollama, Groq, etc.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = providers
    .map(p => {
      const isActive = p.id === activeProviderId;
      const modelsList =
        p.models && p.models.length > 0
          ? p.models.map(m => `<li>${escapeHtml(m)}</li>`).join('')
          : '<li><em>No models specified (defaults to standard)</em></li>';

      return `
        <div class="provider-card ${isActive ? 'provider-card-active' : ''}" data-provider-id="${escapeHtml(p.id)}">
          <div class="provider-card-header">
            <div class="provider-card-title-group">
              <div class="provider-title-row">
                <h3 class="provider-card-title">${escapeHtml(p.name)}</h3>
                ${isActive ? '<span class="provider-badge-active">Active</span>' : ''}
              </div>
              <div class="provider-url-row">
                <span class="url-label">Base URL:</span>
                <span class="provider-card-url">${escapeHtml(p.baseUrl)}</span>
              </div>
            </div>
            <div class="provider-card-actions">
              ${!isActive ? `<button type="button" class="btn btn-secondary btn-sm btn-set-active-provider" data-id="${escapeHtml(p.id)}" title="Set as default active provider">Set Active</button>` : ''}
              <button type="button" class="btn btn-secondary btn-sm btn-card-test-provider" data-id="${escapeHtml(p.id)}" title="Test connection to this provider">Test</button>
              <button type="button" class="btn btn-secondary btn-sm btn-edit-provider" data-id="${escapeHtml(p.id)}" title="Edit URL, key, or models">Edit</button>
              <button type="button" class="btn btn-danger-outline btn-sm btn-delete-provider" data-id="${escapeHtml(p.id)}" title="Delete this provider">Delete</button>
            </div>
          </div>

          <div class="provider-card-key-row">
            <span class="detail-label">API Key:</span>
            <span class="provider-key-display" data-raw-key="${escapeHtml(p.apiKey || '')}" data-masked="true">${p.apiKey ? '••••••••••••••••••••••••' : '<em class="text-muted">None (public or local)</em>'}</span>
            ${
              p.apiKey
                ? `<button type="button" class="btn-card-key-toggle" title="Show or hide API Key">
                     <span class="key-toggle-text">Show Key</span>
                   </button>
                   <button type="button" class="btn-card-key-copy" title="Copy API Key to clipboard">Copy</button>`
                : ''
            }
          </div>

          <div class="provider-card-models">
            <span class="models-label">Models (${p.models ? p.models.length : 0}):</span>
            <ul class="models-tag-list">
              ${modelsList}
            </ul>
          </div>

          <div class="card-test-result-box test-result-box" id="test-box-${escapeHtml(p.id)}" style="display: none;"></div>
        </div>
      `;
    })
    .join('');
}

/**
 * Setup event listeners for Provider editor, presets, and cards
 */
function setupProviderFormListeners(showToast, refreshApp) {
  const inlineEditor = document.getElementById('provider-inline-editor');
  const btnOpenAdd = document.getElementById('btn-open-add-provider-modal');
  const btnCloseEditor = document.getElementById('btn-close-inline-editor');
  const btnCancelForm = document.getElementById('btn-cancel-provider-form');
  const form = document.getElementById('provider-form');
  const editorTitle = document.getElementById('provider-editor-title');
  const presetChips = document.querySelectorAll('.preset-chip[data-preset]');
  const modelsContainer = document.getElementById('provider-models-inputs');
  const btnAddModel = document.getElementById('btn-add-model-input');
  const btnTestConnection = document.getElementById('btn-test-connection');
  const connectionTestResult = document.getElementById('connection-test-result');
  const keyToggleBtn = document.getElementById('btn-toggle-key-visibility');
  const apiKeyInput = document.getElementById('provider-api-key');

  const openEditor = (providerId = null) => {
    editingProviderId = providerId;
    const nameInput = document.getElementById('provider-name');
    const urlInput = document.getElementById('provider-base-url');
    const keyInput = document.getElementById('provider-api-key');
    const submitBtn = document.getElementById('btn-save-provider');

    if (connectionTestResult) connectionTestResult.style.display = 'none';

    if (providerId) {
      const providers = getProviders();
      const p = providers.find(item => item.id === providerId);
      if (p) {
        if (editorTitle) editorTitle.textContent = `Edit Provider: ${p.name}`;
        if (submitBtn) submitBtn.textContent = 'Save Changes';
        if (nameInput) nameInput.value = p.name || '';
        if (urlInput) urlInput.value = p.baseUrl || '';
        if (keyInput) keyInput.value = p.apiKey || '';

        if (modelsContainer) {
          modelsContainer.innerHTML = '';
          const models = p.models && p.models.length > 0 ? p.models : [''];
          models.forEach(m => appendModelInput(modelsContainer, m));
        }
      }
    } else {
      if (editorTitle) editorTitle.textContent = 'Add AI Provider';
      if (submitBtn) submitBtn.textContent = 'Save Provider';
      if (form) form.reset();
      if (modelsContainer) {
        modelsContainer.innerHTML = '';
        appendModelInput(modelsContainer, '');
      }
    }

    if (inlineEditor) {
      inlineEditor.style.display = 'block';
      inlineEditor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    nameInput?.focus();
  };

  const closeEditor = () => {
    if (inlineEditor) inlineEditor.style.display = 'none';
    editingProviderId = null;
    if (form) form.reset();
    if (connectionTestResult) connectionTestResult.style.display = 'none';
  };

  btnOpenAdd?.addEventListener('click', () => openEditor(null));
  btnCloseEditor?.addEventListener('click', closeEditor);
  btnCancelForm?.addEventListener('click', closeEditor);

  // Preset Chips auto-fill
  presetChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const presetKey = chip.getAttribute('data-preset');
      if (!presetKey || !PROVIDER_PRESETS[presetKey]) return;

      const preset = PROVIDER_PRESETS[presetKey];
      const nameInput = document.getElementById('provider-name');
      const urlInput = document.getElementById('provider-base-url');

      if (nameInput) nameInput.value = preset.name;
      if (urlInput) urlInput.value = preset.baseUrl;

      if (modelsContainer && preset.models) {
        modelsContainer.innerHTML = '';
        preset.models.forEach(m => appendModelInput(modelsContainer, m));
      }

      showToast(`Loaded ${preset.name} preset!`, 'info', 1800);
    });
  });

  // Toggle API Key visibility in form
  if (keyToggleBtn && apiKeyInput) {
    keyToggleBtn.addEventListener('click', () => {
      const isPassword = apiKeyInput.type === 'password';
      apiKeyInput.type = isPassword ? 'text' : 'password';
      keyToggleBtn.setAttribute('aria-label', isPassword ? 'Hide API Key' : 'Show API Key');
      const icon = keyToggleBtn.querySelector('.eye-icon');
      if (icon) {
        icon.innerHTML = isPassword
          ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>`
          : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>`;
      }
    });
  }

  // Add Model input field
  if (btnAddModel && modelsContainer) {
    btnAddModel.addEventListener('click', () => {
      appendModelInput(modelsContainer, '');
    });
  }

  // Remove Model input via delegation
  if (modelsContainer) {
    modelsContainer.addEventListener('click', e => {
      const removeBtn = e.target.closest('.btn-remove-model');
      if (removeBtn) {
        const row = removeBtn.closest('.model-input-row');
        if (modelsContainer.querySelectorAll('.model-input-row').length > 1) {
          row.remove();
        } else {
          const input = row.querySelector('input');
          if (input) input.value = '';
        }
      }
    });
  }

  // Test Connection button
  if (btnTestConnection && connectionTestResult) {
    btnTestConnection.addEventListener('click', async () => {
      const baseUrl = document.getElementById('provider-base-url')?.value.trim();
      const apiKey = document.getElementById('provider-api-key')?.value.trim();
      const modelInputs = modelsContainer?.querySelectorAll('input') || [];
      const model = modelInputs[0]?.value.trim() || '';

      if (!baseUrl) {
        connectionTestResult.className = 'test-result-box test-result-error';
        connectionTestResult.innerHTML = '✕ Base URL is required to test connection.';
        connectionTestResult.style.display = 'block';
        return;
      }

      btnTestConnection.disabled = true;
      connectionTestResult.className = 'test-result-box test-result-loading';
      connectionTestResult.innerHTML = `
        <span class="spinner-small"></span> Testing connection to ${escapeHtml(baseUrl)}...
      `;
      connectionTestResult.style.display = 'block';

      try {
        const result = await testConnection({ baseUrl, apiKey, model });
        if (result.ok) {
          connectionTestResult.className = 'test-result-box test-result-success';
          connectionTestResult.innerHTML = `
            <strong>✓ Connection successful</strong>
            <p>Provider responded successfully.</p>
          `;
        } else {
          connectionTestResult.className = 'test-result-box test-result-error';
          connectionTestResult.innerHTML = `
            <strong>✕ Connection failed</strong>
            <p>${escapeHtml(result.message)}</p>
          `;
        }
      } catch (err) {
        connectionTestResult.className = 'test-result-box test-result-error';
        connectionTestResult.innerHTML = `
          <strong>✕ Connection failed</strong>
          <p>${escapeHtml(err.message)}</p>
        `;
      } finally {
        btnTestConnection.disabled = false;
      }
    });
  }

  // Handle Provider Form Submission
  if (form) {
    form.addEventListener('submit', e => {
      e.preventDefault();

      const name = document.getElementById('provider-name')?.value.trim();
      const baseUrl = document.getElementById('provider-base-url')?.value.trim();
      const apiKey = document.getElementById('provider-api-key')?.value.trim();
      const modelInputs = modelsContainer?.querySelectorAll('input') || [];
      const models = Array.from(modelInputs)
        .map(input => input.value.trim())
        .filter(Boolean);

      if (!name) {
        showToast('Provider Name is required', 'error');
        return;
      }
      if (!baseUrl) {
        showToast('Base URL is required', 'error');
        return;
      }
      if (models.length === 0) {
        showToast('Please specify at least one model name (e.g. gpt-4o, deepseek-chat)', 'warning');
        return;
      }

      const providerData = {
        id: editingProviderId || undefined,
        name,
        baseUrl,
        apiKey,
        models
      };

      const saved = saveProvider(providerData);

      // If no active provider was set or editing the active provider, set it
      const settings = getSettings();
      if (!settings.activeProviderId || settings.activeProviderId === saved.id) {
        saveSettings({
          activeProviderId: saved.id,
          activeModel: models[0] || 'default'
        });
      }

      showToast(editingProviderId ? 'Provider updated!' : 'Provider saved successfully!', 'success');
      closeEditor();
      renderProvidersList(showToast, refreshApp);
      renderStorageSettings();
      if (refreshApp) refreshApp();
    });
  }

  // Event delegation on Providers List cards
  const listContainer = document.getElementById('providers-list-container');
  if (listContainer) {
    listContainer.addEventListener('click', async e => {
      // Toggle API Key Show/Hide on card
      const keyToggle = e.target.closest('.btn-card-key-toggle');
      if (keyToggle) {
        const card = keyToggle.closest('.provider-card');
        const display = card.querySelector('.provider-key-display');
        const textSpan = keyToggle.querySelector('.key-toggle-text');
        if (display) {
          const isMasked = display.dataset.masked === 'true';
          const rawKey = display.dataset.rawKey || '';
          if (isMasked) {
            display.textContent = rawKey;
            display.dataset.masked = 'false';
            if (textSpan) textSpan.textContent = 'Hide Key';
            keyToggle.classList.add('active');
          } else {
            display.textContent = '••••••••••••••••••••••••';
            display.dataset.masked = 'true';
            if (textSpan) textSpan.textContent = 'Show Key';
            keyToggle.classList.remove('active');
          }
        }
        return;
      }

      // Copy API Key on card
      const copyKeyBtn = e.target.closest('.btn-card-key-copy');
      if (copyKeyBtn) {
        const card = copyKeyBtn.closest('.provider-card');
        const display = card.querySelector('.provider-key-display');
        const rawKey = display?.dataset.rawKey;
        if (rawKey) {
          try {
            await navigator.clipboard.writeText(rawKey);
            copyKeyBtn.textContent = 'Copied!';
            setTimeout(() => {
              copyKeyBtn.textContent = 'Copy';
            }, 1800);
          } catch {
            showToast('Failed to copy key', 'error');
          }
        }
        return;
      }

      // Set Active Provider button
      const setActiveBtn = e.target.closest('.btn-set-active-provider');
      if (setActiveBtn) {
        const id = setActiveBtn.dataset.id;
        const providers = getProviders();
        const p = providers.find(item => item.id === id);
        if (p) {
          saveSettings({
            activeProviderId: p.id,
            activeModel: p.models?.[0] || 'default'
          });
          showToast(`Set "${p.name}" as active provider!`, 'success');
          renderProvidersList(showToast, refreshApp);
          if (refreshApp) refreshApp();
        }
        return;
      }

      // Test connection right on card
      const testCardBtn = e.target.closest('.btn-card-test-provider');
      if (testCardBtn) {
        const id = testCardBtn.dataset.id;
        const providers = getProviders();
        const p = providers.find(item => item.id === id);
        if (!p) return;

        const testBox = document.getElementById(`test-box-${p.id}`);
        if (!testBox) return;

        testCardBtn.disabled = true;
        testBox.className = 'card-test-result-box test-result-box test-result-loading';
        testBox.innerHTML = '<span class="spinner-small"></span> Testing connection...';
        testBox.style.display = 'block';

        try {
          const res = await testConnection({
            baseUrl: p.baseUrl,
            apiKey: p.apiKey,
            model: p.models?.[0] || 'default'
          });
          if (res.ok) {
            testBox.className = 'card-test-result-box test-result-box test-result-success';
            testBox.innerHTML = '<strong>✓ Connected:</strong> Provider responded successfully.';
          } else {
            testBox.className = 'card-test-result-box test-result-box test-result-error';
            testBox.innerHTML = `<strong>✕ Failed:</strong> ${escapeHtml(res.message)}`;
          }
        } catch (err) {
          testBox.className = 'card-test-result-box test-result-box test-result-error';
          testBox.innerHTML = `<strong>✕ Error:</strong> ${escapeHtml(err.message)}`;
        } finally {
          testCardBtn.disabled = false;
        }
        return;
      }

      // Edit Provider
      const editBtn = e.target.closest('.btn-edit-provider');
      if (editBtn) {
        const id = editBtn.dataset.id;
        openEditor(id);
        return;
      }

      // Delete Provider
      const deleteBtn = e.target.closest('.btn-delete-provider');
      if (deleteBtn) {
        const id = deleteBtn.dataset.id;
        const providers = getProviders();
        const p = providers.find(item => item.id === id);
        if (p) {
          const confirmed = window.confirm(`Delete provider "${p.name}"? This action cannot be undone.`);
          if (confirmed) {
            deleteProvider(id);
            showToast(`Provider "${p.name}" deleted.`, 'info');
            renderProvidersList(showToast, refreshApp);
            renderStorageSettings();
            if (refreshApp) refreshApp();
          }
        }
      }
    });
  }
}

/**
 * Append a single model input row
 */
function appendModelInput(container, value = '') {
  const row = document.createElement('div');
  row.className = 'model-input-row';
  row.innerHTML = `
    <input type="text" class="input-field model-name-input" placeholder="e.g. gpt-4o, deepseek-chat" value="${escapeHtml(value)}" required>
    <button type="button" class="btn btn-icon-only btn-remove-model" title="Remove Model" aria-label="Remove Model">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  `;
  container.appendChild(row);
}

/**
 * Render Appearance settings & bind theme changes
 */
function renderAppearanceSettings(onThemeChange) {
  const settings = getSettings();

  // Theme radios
  const themeRadios = document.querySelectorAll('input[name="theme-option"]');
  themeRadios.forEach(radio => {
    radio.checked = radio.value === settings.theme;
    radio.addEventListener('change', () => {
      if (radio.checked) {
        saveSettings({ theme: radio.value });
        if (onThemeChange) onThemeChange(radio.value);
      }
    });
  });

  // Compact Mode
  const compactCheck = document.getElementById('check-compact-mode');
  if (compactCheck) {
    compactCheck.checked = Boolean(settings.compact);
    compactCheck.addEventListener('change', () => {
      saveSettings({ compact: compactCheck.checked });
      document.body.classList.toggle('compact-mode', compactCheck.checked);
    });
  }

  // Animations
  const animCheck = document.getElementById('check-animations');
  if (animCheck) {
    animCheck.checked = Boolean(settings.animations);
    animCheck.addEventListener('change', () => {
      saveSettings({ animations: animCheck.checked });
      document.body.classList.toggle('no-animations', !animCheck.checked);
    });
  }
}

/**
 * Render Chat preferences settings
 */
function renderChatSettings() {
  const settings = getSettings();

  const enterToSend = document.getElementById('check-enter-send');
  if (enterToSend) {
    enterToSend.checked = Boolean(settings.enterToSend);
    enterToSend.addEventListener('change', () => {
      saveSettings({ enterToSend: enterToSend.checked });
    });
  }

  const timestamps = document.getElementById('check-timestamps');
  if (timestamps) {
    timestamps.checked = Boolean(settings.showTimestamps);
    timestamps.addEventListener('change', () => {
      saveSettings({ showTimestamps: timestamps.checked });
    });
  }

  const autoScroll = document.getElementById('check-autoscroll');
  if (autoScroll) {
    autoScroll.checked = Boolean(settings.autoScroll);
    autoScroll.addEventListener('change', () => {
      saveSettings({ autoScroll: autoScroll.checked });
    });
  }

  const markdown = document.getElementById('check-markdown');
  if (markdown) {
    markdown.checked = Boolean(settings.markdownEnabled);
    markdown.addEventListener('change', () => {
      saveSettings({ markdownEnabled: markdown.checked });
    });
  }

  // Developer mode
  const devMode = document.getElementById('check-dev-mode');
  if (devMode) {
    devMode.checked = Boolean(settings.devMode);
    devMode.addEventListener('change', () => {
      saveSettings({ devMode: devMode.checked });
    });
  }

  // Custom Instructions (System Prompt)
  const customInstructionsInput = document.getElementById('custom-instructions-input');
  if (customInstructionsInput) {
    customInstructionsInput.value = settings.customInstructions || '';
    if (!customInstructionsInput.dataset.bound) {
      customInstructionsInput.dataset.bound = 'true';
      customInstructionsInput.addEventListener('input', () => {
        saveSettings({ customInstructions: customInstructionsInput.value });
      });
    }
  }
}

/**
 * Web Search settings: শুধু URL দিলেই auto-detect
 */
function renderWebSearchSettings(showToast) {
  const settings = getSettings();

  const enabledCheck = document.getElementById('check-web-search-enabled');
  const urlInput = document.getElementById('search-engine-url');
  const keyInput = document.getElementById('search-api-key');
  const badge = document.getElementById('search-detect-badge');
  const btnTest = document.getElementById('btn-test-search');

  if (!urlInput) return;

  if (enabledCheck) enabledCheck.checked = Boolean(settings.webSearchEnabled);
  urlInput.value = settings.searchEngineUrl || '';
  if (keyInput) keyInput.value = settings.searchApiKey || '';

  const showBadge = (type, html) => {
    if (!badge) return;
    badge.className = `test-result-box test-result-${type}`;
    badge.innerHTML = html;
    badge.style.display = 'block';
  };

  // আগে থেকে detect করা থাকলে সেটা দেখাও
  if (settings.searchDetected && settings.searchDetectedFor === settings.searchEngineUrl) {
    const c = settings.searchDetected;
    showBadge('success', `<strong>✓ Detected: ${escapeHtml(c.name)}</strong><p><code>${escapeHtml(c.template)}</code></p>`);
  }

  const runDetection = async () => {
    const url = urlInput.value.trim();
    if (!url) {
      if (badge) badge.style.display = 'none';
      return;
    }

    saveSettings({ searchEngineUrl: url });
    if (btnTest) btnTest.disabled = true;
    showBadge('loading', '<span class="spinner-small"></span> সার্চ ইঞ্জিন detect করা হচ্ছে...');

    const res = await detectSearchEngine(url, keyInput?.value.trim() || '');

    if (res.ok) {
      saveSettings({ searchDetected: res.config, searchDetectedFor: url });
      showBadge(
        'success',
        `<strong>✓ ${escapeHtml(res.message)}</strong><p><code>${escapeHtml(res.config.template)}</code></p>`
      );
    } else {
      saveSettings({ searchDetected: null, searchDetectedFor: '' });
      showBadge('error', `<strong>✕ Detect করা যায়নি</strong><p>${escapeHtml(res.message)}</p>`);
    }

    if (btnTest) btnTest.disabled = false;
  };

  if (enabledCheck) {
    enabledCheck.addEventListener('change', () => {
      saveSettings({ webSearchEnabled: enabledCheck.checked });
      syncWebSearchToggleButton();
    });
  }

  // URL লেখা থামালে (০.৯ সেকেন্ড পর) নিজে থেকে detect
  urlInput.addEventListener(
    'input',
    debounce(() => {
      saveSettings({ searchEngineUrl: urlInput.value.trim(), searchDetected: null, searchDetectedFor: '' });
      if (urlInput.value.includes('.')) runDetection();
    }, 900)
  );

  urlInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runDetection();
    }
  });

  document.querySelectorAll('.search-preset-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      urlInput.value = chip.dataset.searchUrl || '';
      runDetection();
    });
  });

  if (keyInput) {
    keyInput.addEventListener('input', () => saveSettings({ searchApiKey: keyInput.value.trim() }));
  }

  if (btnTest) btnTest.addEventListener('click', runDetection);
}

/**
 * চ্যাটের Web Search টগল বাটনকে settings-এর সাথে sync করে (app.js থেকেও কল হয়)
 */
export function syncWebSearchToggleButton() {
  const btn = document.getElementById('btn-web-search-toggle');
  if (!btn) return;
  const settings = getSettings();
  btn.classList.toggle('active', Boolean(settings.webSearchEnabled));
}

/**
 * Render Storage stats & bind Export/Import/Clear handlers
 */
export function renderStorageSettings(showConfirmModal, showToast, refreshApp) {
  const stats = getStorageStats();

  const elProviders = document.getElementById('stat-providers-count');
  const elChats = document.getElementById('stat-chats-count');
  const elMessages = document.getElementById('stat-messages-count');
  const elSize = document.getElementById('stat-storage-size');

  if (elProviders) elProviders.textContent = stats.providersCount;
  if (elChats) elChats.textContent = stats.chatsCount;
  if (elMessages) elMessages.textContent = stats.messagesCount;
  if (elSize) elSize.textContent = formatBytes(stats.rawBytes);

  // Export Data Button
  const btnExport = document.getElementById('btn-export-data');
  if (btnExport && !btnExport.dataset.bound) {
    btnExport.dataset.bound = 'true';
    btnExport.addEventListener('click', () => {
      const jsonStr = exportBackupJson();
      const dateStr = new Date().toISOString().split('T')[0];
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ai-chat-backup-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (showToast) showToast('Backup downloaded successfully.', 'success');
    });
  }

  // Import Data Button
  const btnImport = document.getElementById('btn-import-data');
  const fileInput = document.getElementById('input-import-file');
  if (btnImport && fileInput && !btnImport.dataset.bound) {
    btnImport.dataset.bound = 'true';
    btnImport.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = evt => {
        const content = evt.target.result;
        const confirmMsg =
          'Importing data will merge/overwrite existing providers and chats with the backup contents. Proceed?';

        const doImport = () => {
          const res = importBackupJson(content);
          if (res.success) {
            if (showToast) showToast(res.message, 'success');
            renderProvidersList(showToast, refreshApp);
            renderStorageSettings(showConfirmModal, showToast, refreshApp);
            if (refreshApp) refreshApp();
          } else {
            if (showToast) showToast(res.message, 'error');
          }
          fileInput.value = '';
        };

        if (showConfirmModal) {
          showConfirmModal('Import Backup Data', confirmMsg, doImport);
        } else if (window.confirm(confirmMsg)) {
          doImport();
        }
      };
      reader.readAsText(file);
    });
  }

  // Clear Conversations Button
  const btnClearChats = document.getElementById('btn-clear-conversations');
  if (btnClearChats && !btnClearChats.dataset.bound) {
    btnClearChats.dataset.bound = 'true';
    btnClearChats.addEventListener('click', () => {
      const msg = 'Are you sure you want to delete ALL conversations? This cannot be undone.';
      const doClear = () => {
        deleteAllChats();
        if (showToast) showToast('All conversations deleted.', 'info');
        renderStorageSettings(showConfirmModal, showToast, refreshApp);
        if (refreshApp) refreshApp();
      };

      if (showConfirmModal) {
        showConfirmModal('Delete All Conversations', msg, doClear);
      } else if (window.confirm(msg)) {
        doClear();
      }
    });
  }

  // Clear All Local Data Button
  const btnClearAll = document.getElementById('btn-clear-all-data');
  if (btnClearAll && !btnClearAll.dataset.bound) {
    btnClearAll.dataset.bound = 'true';
    btnClearAll.addEventListener('click', () => {
      const msg =
        'Are you sure you want to wipe ALL data (providers, API keys, conversations, and settings)? This cannot be undone.';
      const doClearAll = () => {
        clearAllLocalData();
        if (showToast) showToast('All local data wiped.', 'info');
        renderProvidersList(showToast, refreshApp);
        renderStorageSettings(showConfirmModal, showToast, refreshApp);
        if (refreshApp) refreshApp();
      };

      if (showConfirmModal) {
        showConfirmModal('Wipe All Local Data', msg, doClearAll);
      } else if (window.confirm(msg)) {
        doClearAll();
      }
    });
  }
}