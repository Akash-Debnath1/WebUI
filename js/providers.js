/**
 * Localhost AI Chat - Provider Management & Resolution Module
 * Pure Vanilla JavaScript ES Module
 */

import { getProviders, getSettings, saveSettings } from './storage.js';

/**
 * Get active provider and active model
 * Resolves to first valid provider/model if currently selected is invalid or missing
 * @returns {{ provider: Object|null, model: string }}
 */
export function getActiveProviderAndModel() {
  const providers = getProviders();
  if (!providers.length) {
    return { provider: null, model: '' };
  }

  const settings = getSettings();
  let provider = providers.find(p => p.id === settings.activeProviderId);

  // If saved provider not found, fallback to first configured provider
  if (!provider) {
    provider = providers[0];
    saveSettings({ activeProviderId: provider.id });
  }

  let model = settings.activeModel;
  // If activeModel not in provider's models, select the first model
  if (provider.models && provider.models.length > 0) {
    if (!model || !provider.models.includes(model)) {
      model = provider.models[0];
      saveSettings({ activeModel: model });
    }
  } else {
    model = model || 'default';
  }

  return { provider, model };
}

/**
 * Set active provider and model
 * @param {string} providerId
 * @param {string} model
 */
export function setActiveProviderAndModel(providerId, model) {
  const providers = getProviders();
  const provider = providers.find(p => p.id === providerId);
  if (!provider) return;

  saveSettings({
    activeProviderId: providerId,
    activeModel: model || (provider.models?.[0] || 'default')
  });
}

/**
 * Get all available models grouped by provider for UI dropdowns
 * @returns {Array<{ providerId: string, providerName: string, models: string[] }>}
 */
export function getAllAvailableModels() {
  const providers = getProviders();
  return providers.map(p => ({
    providerId: p.id,
    providerName: p.name || 'Unnamed Provider',
    models: p.models && p.models.length > 0 ? p.models : ['default']
  }));
}
