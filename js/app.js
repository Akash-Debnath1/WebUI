/**
 * Localhost AI Chat - Main Application Bootstrap
 * Pure Vanilla JavaScript ES Module
 */

import { debounce } from './utils.js';
import {
  getSettings,
  saveSettings,
  getActiveChatId,
  setActiveChatId,
  getChatById,
  getChats,
  getProviders
} from './storage.js';
import { getActiveProviderAndModel, setActiveProviderAndModel } from './providers.js';
import {
  submitUserMessage,
  regenerateLastResponse,
  editUserMessageAndResend,
  stopGeneration,
  createNewConversation,
  getIsGenerating
} from './chat.js';
import {
  showToast,
  showConfirmModal,
  showRenameModal,
  renderSidebarChats,
  updateModelSelector,
  renderChatArea,
  updateStreamingMessage,
  scrollToBottom
} from './ui.js';
import { initSettingsView, renderStorageSettings, renderProvidersList } from './settings.js';

// DOM Element Selectors
const elements = {
  viewChat: document.getElementById('view-chat'),
  viewSettings: document.getElementById('view-settings'),
  navChatBtn: document.getElementById('nav-chat-btn'),
  navSettingsBtn: document.getElementById('nav-settings-btn'),
  btnNewChat: document.getElementById('btn-new-chat'),
  searchChatsInput: document.getElementById('search-chats-input'),
  chatInput: document.getElementById('chat-input-textarea'),
  btnSend: document.getElementById('btn-send-message'),
  btnStop: document.getElementById('btn-stop-generation'),
  modelSelectorBtn: document.getElementById('model-selector-btn'),
  modelSelectorDropdown: document.getElementById('model-selector-dropdown'),
  sidebar: document.getElementById('app-sidebar'),
  sidebarToggleBtn: document.getElementById('btn-sidebar-toggle'),
  sidebarBackdrop: document.getElementById('sidebar-backdrop'),
  quickPrompts: document.querySelectorAll('.quick-prompt-card'),
  btnOpenSettingsFromEmpty: document.querySelectorAll('.btn-trigger-settings')
};

/**
 * Initialize Application
 */
export function initApp() {
  applyTheme(getSettings().theme);
  setupNavigation();
  setupSidebarControls();
  setupChatInput();
  setupModelSelectorEvents();

  // Initialize Settings module
  initSettingsView({
    showToast,
    showConfirmModal,
    onThemeChange: applyTheme,
    refreshApp: refreshAllViews
  });

  // Handle route based on URL hash
  handleRouting();
  window.addEventListener('hashchange', handleRouting);

  // Initial render of sidebar and chat area
  refreshAllViews();
}

/**
 * Switch views based on hash (#chat, #settings)
 */
function handleRouting() {
  const hash = window.location.hash || '#chat';

  if (hash === '#settings') {
    elements.viewChat.style.display = 'none';
    elements.viewSettings.style.display = 'block';
    elements.navChatBtn?.classList.remove('active');
    elements.navSettingsBtn?.classList.add('active');
    renderProvidersList(showToast, refreshAllViews);
    renderStorageSettings(showConfirmModal, showToast, refreshAllViews);
  } else {
    elements.viewSettings.style.display = 'none';
    elements.viewChat.style.display = 'flex';
    elements.navSettingsBtn?.classList.remove('active');
    elements.navChatBtn?.classList.add('active');
  }

  // Close mobile sidebar on route change
  closeMobileSidebar();
}

/**
 * Handle when the user switches model/provider from the header dropdown
 */
function handleModelSelect(providerId, model) {
  const providers = getProviders();
  const provider = providers.find(p => p.id === providerId);
  const activeChatId = getActiveChatId();
  if (activeChatId) {
    const chat = getChatById(activeChatId);
    if (chat) {
      chat.providerId = providerId;
      chat.model = model;
      saveChat(chat);
    }
  }
  showToast(`Switched to ${provider ? provider.name : 'Provider'} (${model})`, 'info', 2200);
}

/**
 * Refresh both sidebar and main chat views
 */
function refreshAllViews() {
  const activeChatId = getActiveChatId();
  let chat = activeChatId ? getChatById(activeChatId) : null;

  // If active chat doesn't exist anymore, check if other chats exist
  if (!chat) {
    const allChats = getChats();
    if (allChats.length > 0) {
      chat = allChats[0];
      setActiveChatId(chat.id);
    }
  }

  renderSidebarChats(
    elements.searchChatsInput?.value || '',
    chatId => {
      loadChat(chatId);
      closeMobileSidebar();
    },
    refreshAllViews
  );

  updateModelSelector(handleModelSelect);
  renderCurrentChat();
}

/**
 * Render the active chat
 */
function renderCurrentChat() {
  const activeChatId = getActiveChatId();
  const chat = activeChatId ? getChatById(activeChatId) : null;

  renderChatArea(chat, {
    onRegenerate: () => handleRegenerate(),
    onEditMessage: (msgId, newContent) => handleEditMessage(msgId, newContent)
  });
}

/**
 * Load a specific chat
 */
export function loadChat(chatId) {
  if (!chatId) return;
  setActiveChatId(chatId);
  const chat = getChatById(chatId);
  if (chat && chat.providerId && chat.model) {
    const providers = getProviders();
    const providerExists = providers.some(p => p.id === chat.providerId);
    if (providerExists) {
      setActiveProviderAndModel(chat.providerId, chat.model);
    }
  }

  // Ensure Chat view is displayed if user is on Settings
  if (window.location.hash === '#settings') {
    window.location.hash = '#chat';
  } else {
    if (elements.viewSettings) elements.viewSettings.style.display = 'none';
    if (elements.viewChat) elements.viewChat.style.display = 'flex';
    elements.navSettingsBtn?.classList.remove('active');
    elements.navChatBtn?.classList.add('active');
  }

  refreshAllViews();
  scrollToBottom();
  elements.chatInput?.focus();
}

window.__selectChat = loadChat;

/**
 * Apply theme: 'dark', 'light', or 'system'
 */
function applyTheme(theme) {
  const root = document.documentElement;
  root.removeAttribute('data-theme');

  if (theme === 'dark' || theme === 'light') {
    root.setAttribute('data-theme', theme);
  } else {
    // System preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  }

  // Apply compact / animation classes
  const settings = getSettings();
  document.body.classList.toggle('compact-mode', Boolean(settings.compact));
  document.body.classList.toggle('no-animations', !settings.animations);
}

// Watch system theme change if mode is 'system'
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
  if (getSettings().theme === 'system') {
    document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
  }
});

/**
 * Navigation Button Listeners
 */
function setupNavigation() {
  elements.navChatBtn?.addEventListener('click', () => {
    window.location.hash = '#chat';
  });

  elements.navSettingsBtn?.addEventListener('click', () => {
    window.location.hash = '#settings';
  });

  elements.btnOpenSettingsFromEmpty.forEach(btn => {
    btn.addEventListener('click', () => {
      window.location.hash = '#settings';
    });
  });

  elements.btnNewChat?.addEventListener('click', handleNewChat);
  window.__startNewChat = handleNewChat;
}

/**
 * Create a fresh new chat and focus input
 */
export function handleNewChat() {
  if (getIsGenerating()) {
    showToast('Please wait or stop the current generation first.', 'warning');
    return;
  }
  const newChat = createNewConversation();
  setActiveChatId(newChat.id);
  if (elements.chatInput) {
    elements.chatInput.value = '';
    elements.chatInput.style.height = 'auto';
    elements.chatInput.disabled = false;
    elements.chatInput.focus();
  }
  refreshAllViews();
  window.location.hash = '#chat';
}

/**
 * Setup mobile sidebar toggle & backdrop
 */
function setupSidebarControls() {
  elements.sidebarToggleBtn?.addEventListener('click', () => {
    elements.sidebar?.classList.toggle('mobile-open');
    elements.sidebarBackdrop?.classList.toggle('active');
  });

  elements.sidebarBackdrop?.addEventListener('click', closeMobileSidebar);

  // Search input debounced
  elements.searchChatsInput?.addEventListener(
    'input',
    debounce(e => {
      renderSidebarChats(
        e.target.value,
        chatId => {
          loadChat(chatId);
          closeMobileSidebar();
        },
        refreshAllViews
      );
    }, 200)
  );
}

function closeMobileSidebar() {
  elements.sidebar?.classList.remove('mobile-open');
  elements.sidebarBackdrop?.classList.remove('active');
}

/**
 * Setup Model Selector Dropdown Header Popover
 */
function setupModelSelectorEvents() {
  elements.modelSelectorBtn?.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = elements.modelSelectorDropdown?.classList.contains('open');
    if (isOpen) {
      elements.modelSelectorDropdown?.classList.remove('open');
      elements.modelSelectorBtn?.setAttribute('aria-expanded', 'false');
    } else {
      updateModelSelector();
      elements.modelSelectorDropdown?.classList.add('open');
      elements.modelSelectorBtn?.setAttribute('aria-expanded', 'true');
    }
  });

  // Close when clicking outside
  window.addEventListener('click', e => {
    if (!elements.modelSelectorBtn?.contains(e.target) && !elements.modelSelectorDropdown?.contains(e.target)) {
      elements.modelSelectorDropdown?.classList.remove('open');
      elements.modelSelectorBtn?.setAttribute('aria-expanded', 'false');
    }
  });
}

/**
 * Setup Chat Input Area, Auto-resize, Enter key, and Quick Starter Prompts
 */
function setupChatInput() {
  const textarea = elements.chatInput;
  if (!textarea) return;

  // Auto resize height
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  });

  // Enter to send
  textarea.addEventListener('keydown', e => {
    const settings = getSettings();
    if (e.key === 'Enter' && !e.shiftKey && settings.enterToSend) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  // Send button click
  elements.btnSend?.addEventListener('click', handleSendMessage);

  // Stop button click
  elements.btnStop?.addEventListener('click', () => {
    stopGeneration();
    setGeneratingState(false);
    showToast('Generation cancelled.', 'info', 2000);
  });

  // Quick Starter Prompts in Empty State
  elements.quickPrompts.forEach(card => {
    card.addEventListener('click', () => {
      const prompt = card.getAttribute('data-prompt');
      if (prompt && textarea) {
        textarea.value = prompt;
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
        textarea.focus();
      }
    });
  });
}

/**
 * Switch Send / Stop buttons in UI
 */
function setGeneratingState(generating) {
  if (generating) {
    if (elements.btnSend) elements.btnSend.style.display = 'none';
    if (elements.btnStop) elements.btnStop.style.display = 'inline-flex';
    if (elements.chatInput) elements.chatInput.disabled = true;
  } else {
    if (elements.btnSend) elements.btnSend.style.display = 'inline-flex';
    if (elements.btnStop) elements.btnStop.style.display = 'none';
    if (elements.chatInput) {
      elements.chatInput.disabled = false;
      elements.chatInput.focus();
    }
  }
}

/**
 * Send user message pipeline
 */
async function handleSendMessage() {
  const text = elements.chatInput?.value.trim();
  if (!text || getIsGenerating()) return;

  const providers = getProviders();
  if (providers.length === 0) {
    showToast('No AI provider configured. Configure one in Settings.', 'error');
    window.location.hash = '#settings';
    return;
  }

  // Clear input
  if (elements.chatInput) {
    elements.chatInput.value = '';
    elements.chatInput.style.height = 'auto';
  }

  setGeneratingState(true);

  await submitUserMessage(text, {
    onChatUpdated: () => {
      renderSidebarChats(
        elements.searchChatsInput?.value || '',
        chatId => loadChat(chatId),
        refreshAllViews
      );
      renderCurrentChat();
    },
    onGenerationStart: assistantMsgId => {
      updateStreamingMessage(assistantMsgId, '');
    },
    onToken: (assistantMsgId, fullText) => {
      updateStreamingMessage(assistantMsgId, fullText);
    },
    onGenerationEnd: () => {
      renderCurrentChat();
      setGeneratingState(false);
    },
    onGenerationAborted: () => {
      renderCurrentChat();
      setGeneratingState(false);
    },
    onError: errMsg => {
      showToast(errMsg, 'error', 6000);
      renderCurrentChat();
      setGeneratingState(false);
    },
    onStateReset: () => {
      setGeneratingState(false);
    }
  });
}

/**
 * Regenerate last response pipeline
 */
async function handleRegenerate() {
  if (getIsGenerating()) return;

  setGeneratingState(true);

  await regenerateLastResponse({
    onChatUpdated: () => {
      renderCurrentChat();
    },
    onGenerationStart: assistantMsgId => {
      updateStreamingMessage(assistantMsgId, '');
    },
    onToken: (assistantMsgId, fullText) => {
      updateStreamingMessage(assistantMsgId, fullText);
    },
    onGenerationEnd: () => {
      renderCurrentChat();
      setGeneratingState(false);
    },
    onGenerationAborted: () => {
      renderCurrentChat();
      setGeneratingState(false);
    },
    onError: errMsg => {
      showToast(errMsg, 'error', 6000);
      renderCurrentChat();
      setGeneratingState(false);
    },
    onStateReset: () => {
      setGeneratingState(false);
    }
  });
}

/**
 * Edit user message pipeline
 */
async function handleEditMessage(messageId, newContent) {
  if (getIsGenerating()) return;

  setGeneratingState(true);

  await editUserMessageAndResend(messageId, newContent, {
    onChatUpdated: () => {
      renderCurrentChat();
      renderSidebarChats(
        elements.searchChatsInput?.value || '',
        chatId => loadChat(chatId),
        refreshAllViews
      );
    },
    onGenerationStart: assistantMsgId => {
      updateStreamingMessage(assistantMsgId, '');
    },
    onToken: (assistantMsgId, fullText) => {
      updateStreamingMessage(assistantMsgId, fullText);
    },
    onGenerationEnd: () => {
      renderCurrentChat();
      setGeneratingState(false);
    },
    onGenerationAborted: () => {
      renderCurrentChat();
      setGeneratingState(false);
    },
    onError: errMsg => {
      showToast(errMsg, 'error', 6000);
      renderCurrentChat();
      setGeneratingState(false);
    },
    onStateReset: () => {
      setGeneratingState(false);
    }
  });
}

// Bootstrap on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
