/**
 * Localhost AI Chat - Storage Module
 * Manages localStorage for Providers, Chats, and User Settings
 * Pure Vanilla JavaScript ES Module
 */

import { generateId } from './utils.js';

const STORAGE_KEYS = {
  PROVIDERS: 'aichat_providers',
  CHATS: 'aichat_conversations',
  SETTINGS: 'aichat_settings',
  ACTIVE_CHAT_ID: 'aichat_active_chat_id'
};

const DEFAULT_SETTINGS = {
  theme: 'dark', // 'dark' | 'light' | 'system'
  compact: false,
  animations: true,
  enterToSend: true,
  showTimestamps: true,
  autoScroll: true,
  markdownEnabled: true,
  devMode: false,
  activeProviderId: '',
  activeModel: '',
  customInstructions: '',

  // ---- Web Search (URL দিলেই auto-detect) ----
  webSearchEnabled: false,
  searchEngineUrl: 'https://duckduckgo.com',
  searchApiKey: '',          // শুধু API-ভিত্তিক ইঞ্জিনের জন্য (ঐচ্ছিক)
  searchDetected: null,      // detect হওয়া কনফিগ (cache)
  searchDetectedFor: ''      // কোন URL-এর জন্য cache করা
};

/**
 * Safely parse JSON from localStorage with fallback
 * @param {string} key
 * @param {*} fallback
 * @returns {*}
 */
function getStoredItem(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[Storage] Failed to read ${key}:`, err);
    return fallback;
  }
}

/**
 * Safely stringify and write to localStorage
 * @param {string} key
 * @param {*} value
 */
function setStoredItem(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`[Storage] Failed to save ${key}:`, err);
    throw new Error('Local storage quota exceeded or storage disabled.');
  }
}

/* ==================== PROVIDER METHODS ==================== */

/**
 * Retrieve all configured providers
 * @returns {Array<{id: string, name: string, baseUrl: string, apiKey: string, models: string[]}>}
 */
export function getProviders() {
  return getStoredItem(STORAGE_KEYS.PROVIDERS, []);
}

/**
 * Get a specific provider by ID
 * @param {string} id
 * @returns {Object|null}
 */
export function getProviderById(id) {
  const providers = getProviders();
  return providers.find(p => p.id === id) || null;
}

/**
 * Save or update a provider
 * @param {Object} provider
 * @returns {Object} saved provider
 */
export function saveProvider(provider) {
  const providers = getProviders();
  const index = providers.findIndex(p => p.id === provider.id);

  const cleanProvider = {
    id: provider.id || generateId(),
    name: (provider.name || 'Unnamed Provider').trim(),
    baseUrl: (provider.baseUrl || '').trim(),
    apiKey: (provider.apiKey || '').trim(),
    models: Array.isArray(provider.models)
      ? provider.models.map(m => (typeof m === 'string' ? m.trim() : '')).filter(Boolean)
      : []
  };

  if (index >= 0) {
    providers[index] = cleanProvider;
  } else {
    providers.push(cleanProvider);
  }

  setStoredItem(STORAGE_KEYS.PROVIDERS, providers);
  return cleanProvider;
}

/**
 * Delete a provider by ID
 * @param {string} id
 */
export function deleteProvider(id) {
  const providers = getProviders().filter(p => p.id !== id);
  setStoredItem(STORAGE_KEYS.PROVIDERS, providers);

  // If deleted provider was the active one, reset in settings
  const settings = getSettings();
  if (settings.activeProviderId === id) {
    saveSettings({ activeProviderId: '', activeModel: '' });
  }
}

/* ==================== CHAT METHODS ==================== */

/**
 * Retrieve all chats, sorted by updatedAt descending
 * @returns {Array<Object>}
 */
export function getChats() {
  const chats = getStoredItem(STORAGE_KEYS.CHATS, []);
  return chats.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

/**
 * Get a specific chat by ID
 * @param {string} id
 * @returns {Object|null}
 */
export function getChatById(id) {
  const chats = getStoredItem(STORAGE_KEYS.CHATS, []);
  return chats.find(c => c.id === id) || null;
}

/**
 * Save or update a chat
 * @param {Object} chat
 * @returns {Object}
 */
export function saveChat(chat) {
  const chats = getStoredItem(STORAGE_KEYS.CHATS, []);
  const index = chats.findIndex(c => c.id === chat.id);

  const now = new Date().toISOString();
  const updatedChat = {
    id: chat.id || generateId(),
    title: (chat.title || 'New Conversation').trim(),
    providerId: chat.providerId || '',
    model: chat.model || '',
    createdAt: chat.createdAt || now,
    updatedAt: now,
    messages: Array.isArray(chat.messages) ? chat.messages : []
  };

  if (index >= 0) {
    chats[index] = updatedChat;
  } else {
    chats.unshift(updatedChat);
  }

  setStoredItem(STORAGE_KEYS.CHATS, chats);
  return updatedChat;
}

/**
 * Delete a single chat
 * @param {string} id
 */
export function deleteChat(id) {
  const chats = getStoredItem(STORAGE_KEYS.CHATS, []).filter(c => c.id !== id);
  setStoredItem(STORAGE_KEYS.CHATS, chats);

  if (getActiveChatId() === id) {
    setActiveChatId('');
  }
}

/**
 * Delete all chats
 */
export function deleteAllChats() {
  setStoredItem(STORAGE_KEYS.CHATS, []);
  setActiveChatId('');
}

/**
 * Get currently active chat ID
 * @returns {string}
 */
export function getActiveChatId() {
  return localStorage.getItem(STORAGE_KEYS.ACTIVE_CHAT_ID) || '';
}

/**
 * Set currently active chat ID
 * @param {string} id
 */
export function setActiveChatId(id) {
  if (id) {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_CHAT_ID, id);
  } else {
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_CHAT_ID);
  }
}

/* ==================== SETTINGS METHODS ==================== */

/**
 * Retrieve user settings
 * @returns {Object}
 */
export function getSettings() {
  const stored = getStoredItem(STORAGE_KEYS.SETTINGS, {});
  return { ...DEFAULT_SETTINGS, ...stored };
}

/**
 * Update partial settings
 * @param {Object} partial
 * @returns {Object}
 */
export function saveSettings(partial) {
  const current = getSettings();
  const updated = { ...current, ...partial };
  setStoredItem(STORAGE_KEYS.SETTINGS, updated);
  return updated;
}

/* ==================== STATS, EXPORT & IMPORT ==================== */

/**
 * Get stats on current local storage
 * @returns {{ providersCount: number, chatsCount: number, messagesCount: number, rawBytes: number }}
 */
export function getStorageStats() {
  const providers = getProviders();
  const chats = getChats();
  const messagesCount = chats.reduce((sum, c) => sum + (c.messages?.length || 0), 0);

  let rawBytes = 0;
  for (const key of Object.values(STORAGE_KEYS)) {
    const val = localStorage.getItem(key);
    if (val) rawBytes += val.length * 2; // UTF-16 approximate
  }

  return {
    providersCount: providers.length,
    chatsCount: chats.length,
    messagesCount,
    rawBytes
  };
}

/**
 * Export full backup as JSON string
 * @returns {string}
 */
export function exportBackupJson() {
  const data = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    providers: getProviders(),
    chats: getChats(),
    settings: getSettings()
  };
  return JSON.stringify(data, null, 2);
}

/**
 * Validate and restore imported backup JSON
 * @param {string} jsonString
 * @returns {{ success: boolean, message: string }}
 */
export function importBackupJson(jsonString) {
  try {
    const parsed = JSON.parse(jsonString);

    if (!parsed || typeof parsed !== 'object') {
      return { success: false, message: 'Invalid JSON format. Expected an object.' };
    }

    if (!Array.isArray(parsed.providers) && !Array.isArray(parsed.chats)) {
      return { success: false, message: 'Backup file missing valid providers or chats arrays.' };
    }

    // Restore providers if valid
    if (Array.isArray(parsed.providers)) {
      const sanitizedProviders = parsed.providers.filter(p => p && typeof p.name === 'string');
      setStoredItem(STORAGE_KEYS.PROVIDERS, sanitizedProviders);
    }

    // Restore chats if valid
    if (Array.isArray(parsed.chats)) {
      const sanitizedChats = parsed.chats.filter(c => c && typeof c.id === 'string' && Array.isArray(c.messages));
      setStoredItem(STORAGE_KEYS.CHATS, sanitizedChats);
    }

    // Restore settings if present
    if (parsed.settings && typeof parsed.settings === 'object') {
      saveSettings(parsed.settings);
    }

    return { success: true, message: 'Backup imported successfully.' };
  } catch (err) {
    return { success: false, message: 'Failed to parse JSON backup file: ' + err.message };
  }
}

/**
 * Wipe all data from storage
 */
export function clearAllLocalData() {
  localStorage.removeItem(STORAGE_KEYS.PROVIDERS);
  localStorage.removeItem(STORAGE_KEYS.CHATS);
  localStorage.removeItem(STORAGE_KEYS.SETTINGS);
  localStorage.removeItem(STORAGE_KEYS.ACTIVE_CHAT_ID);
}