/**
 * Localhost AI Chat - Chat Engine & Message Controller
 * Pure Vanilla JavaScript ES Module
 */

import { generateId, generateChatTitle, formatTime, escapeHtml } from './utils.js';
import {
  getChatById,
  saveChat,
  getActiveChatId,
  setActiveChatId,
  getSettings
} from './storage.js';
import { getActiveProviderAndModel } from './providers.js';
import { sendChatRequest } from './api.js';
import { renderMarkdown, setupCodeCopyButtons } from './markdown.js';

let currentAbortController = null;
let isGenerating = false;

export function getIsGenerating() {
  return isGenerating;
}

/**
 * Create a new conversation and switch to it
 * @returns {Object} Newly created chat
 */
export function createNewConversation() {
  const { provider, model } = getActiveProviderAndModel();
  const newChat = {
    id: generateId(),
    title: 'New Conversation',
    providerId: provider ? provider.id : '',
    model: model || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: []
  };

  saveChat(newChat);
  setActiveChatId(newChat.id);
  return newChat;
}

/**
 * Prepare messages array for API payload, prepending Custom System Instructions if defined
 * @param {Array<Object>} chatMessages
 * @returns {Array<{role: string, content: string}>}
 */
function buildApiMessages(chatMessages) {
  const settings = getSettings();
  const systemPrompt = (settings.customInstructions || '').trim();
  const apiMessages = [];

  if (systemPrompt) {
    apiMessages.push({
      role: 'system',
      content: systemPrompt
    });
  }

  for (const m of chatMessages) {
    if (m.content) {
      apiMessages.push({
        role: m.role,
        content: m.content
      });
    }
  }

  return apiMessages;
}

/**
 * Cancel active generation
 */
export function stopGeneration() {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
  isGenerating = false;
}

/**
 * Send user message and stream assistant response
 * @param {string} text
 * @param {Object} callbacks - UI hooks for state changes
 * @returns {Promise<void>}
 */
export async function submitUserMessage(text, callbacks = {}) {
  const cleanText = text.trim();
  if (!cleanText || isGenerating) return;

  const { provider, model } = getActiveProviderAndModel();
  if (!provider) {
    if (callbacks.onError) {
      callbacks.onError('No AI provider configured. Please configure one in Settings.');
    }
    return;
  }

  let activeChatId = getActiveChatId();
  let chat = activeChatId ? getChatById(activeChatId) : null;

  if (!chat) {
    chat = createNewConversation();
    activeChatId = chat.id;
  }

  // Update chat provider and model to current active
  chat.providerId = provider.id;
  chat.model = model;

  // If first message, generate automatic title locally
  const isFirstMessage = chat.messages.length === 0;
  if (isFirstMessage) {
    chat.title = generateChatTitle(cleanText);
  }

  const userMsgId = generateId();
  const userMsg = {
    id: userMsgId,
    role: 'user',
    content: cleanText,
    timestamp: new Date().toISOString()
  };
  chat.messages.push(userMsg);
  saveChat(chat);

  if (callbacks.onChatUpdated) {
    callbacks.onChatUpdated(chat);
  }

  // Prepare Assistant message placeholder
  const assistantMsgId = generateId();
  const assistantMsg = {
    id: assistantMsgId,
    role: 'assistant',
    content: '',
    timestamp: new Date().toISOString()
  };
  chat.messages.push(assistantMsg);

  isGenerating = true;
  currentAbortController = new AbortController();

  if (callbacks.onGenerationStart) {
    callbacks.onGenerationStart(assistantMsgId);
  }

  let accumulatedContent = '';

  try {
    const result = await sendChatRequest({
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      model: model,
      messages: buildApiMessages(chat.messages.slice(0, -1)), // Send all messages with system prompt prepended
      stream: true,
      signal: currentAbortController.signal,
      onToken: (chunk, fullText) => {
        accumulatedContent = fullText;
        if (callbacks.onToken) {
          callbacks.onToken(assistantMsgId, fullText, chunk);
        }
      }
    });

    assistantMsg.content = result.content || accumulatedContent;
    assistantMsg.metrics = result.metrics;
    chat.updatedAt = new Date().toISOString();
    saveChat(chat);

    if (callbacks.onGenerationEnd) {
      callbacks.onGenerationEnd(assistantMsgId, assistantMsg);
    }
  } catch (err) {
    // If aborted, keep what we have so far
    if (currentAbortController?.signal.aborted) {
      if (accumulatedContent) {
        assistantMsg.content = accumulatedContent;
        chat.updatedAt = new Date().toISOString();
        saveChat(chat);
      } else {
        // Remove empty placeholder
        chat.messages = chat.messages.filter(m => m.id !== assistantMsgId);
        saveChat(chat);
      }
      if (callbacks.onGenerationAborted) {
        callbacks.onGenerationAborted(assistantMsgId, accumulatedContent);
      }
    } else {
      // Remove empty placeholder or attach error notice
      chat.messages = chat.messages.filter(m => m.id !== assistantMsgId);
      saveChat(chat);

      if (callbacks.onError) {
        callbacks.onError(err.message || 'An error occurred while communicating with the AI provider.');
      }
    }
  } finally {
    isGenerating = false;
    currentAbortController = null;
    if (callbacks.onStateReset) {
      callbacks.onStateReset();
    }
  }
}

/**
 * Regenerate the last assistant response
 * @param {Object} callbacks
 */
export async function regenerateLastResponse(callbacks = {}) {
  if (isGenerating) return;
  const activeChatId = getActiveChatId();
  if (!activeChatId) return;

  const chat = getChatById(activeChatId);
  if (!chat || chat.messages.length === 0) return;

  // If last message is assistant, pop it
  if (chat.messages[chat.messages.length - 1].role === 'assistant') {
    chat.messages.pop();
    saveChat(chat);
  }

  // Find the last user message
  const lastUserMsg = [...chat.messages].reverse().find(m => m.role === 'user');
  if (!lastUserMsg) return;

  const { provider, model } = getActiveProviderAndModel();
  if (!provider) {
    if (callbacks.onError) {
      callbacks.onError('No AI provider configured. Please configure one in Settings.');
    }
    return;
  }

  chat.providerId = provider.id;
  chat.model = model;

  const assistantMsgId = generateId();
  const assistantMsg = {
    id: assistantMsgId,
    role: 'assistant',
    content: '',
    timestamp: new Date().toISOString()
  };
  chat.messages.push(assistantMsg);

  isGenerating = true;
  currentAbortController = new AbortController();

  if (callbacks.onChatUpdated) {
    callbacks.onChatUpdated(chat);
  }
  if (callbacks.onGenerationStart) {
    callbacks.onGenerationStart(assistantMsgId);
  }

  let accumulatedContent = '';

  try {
    const result = await sendChatRequest({
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      model: model,
      messages: buildApiMessages(chat.messages.slice(0, -1)),
      stream: true,
      signal: currentAbortController.signal,
      onToken: (chunk, fullText) => {
        accumulatedContent = fullText;
        if (callbacks.onToken) {
          callbacks.onToken(assistantMsgId, fullText, chunk);
        }
      }
    });

    assistantMsg.content = result.content || accumulatedContent;
    assistantMsg.metrics = result.metrics;
    chat.updatedAt = new Date().toISOString();
    saveChat(chat);

    if (callbacks.onGenerationEnd) {
      callbacks.onGenerationEnd(assistantMsgId, assistantMsg);
    }
  } catch (err) {
    if (currentAbortController?.signal.aborted) {
      if (accumulatedContent) {
        assistantMsg.content = accumulatedContent;
        chat.updatedAt = new Date().toISOString();
        saveChat(chat);
      } else {
        chat.messages = chat.messages.filter(m => m.id !== assistantMsgId);
        saveChat(chat);
      }
      if (callbacks.onGenerationAborted) {
        callbacks.onGenerationAborted(assistantMsgId, accumulatedContent);
      }
    } else {
      chat.messages = chat.messages.filter(m => m.id !== assistantMsgId);
      saveChat(chat);
      if (callbacks.onError) {
        callbacks.onError(err.message);
      }
    }
  } finally {
    isGenerating = false;
    currentAbortController = null;
    if (callbacks.onStateReset) {
      callbacks.onStateReset();
    }
  }
}

/**
 * Edit an existing user message, discard all messages after it, and re-generate
 * @param {string} messageId
 * @param {string} newContent
 * @param {Object} callbacks
 */
export async function editUserMessageAndResend(messageId, newContent, callbacks = {}) {
  if (isGenerating) return;
  const activeChatId = getActiveChatId();
  if (!activeChatId) return;

  const chat = getChatById(activeChatId);
  if (!chat) return;

  const msgIndex = chat.messages.findIndex(m => m.id === messageId);
  if (msgIndex === -1) return;

  // Truncate messages after this point
  chat.messages = chat.messages.slice(0, msgIndex + 1);
  chat.messages[msgIndex].content = newContent.trim();
  chat.messages[msgIndex].timestamp = new Date().toISOString();
  saveChat(chat);

  if (callbacks.onChatUpdated) {
    callbacks.onChatUpdated(chat);
  }

  // Trigger assistant response
  const { provider, model } = getActiveProviderAndModel();
  if (!provider) {
    if (callbacks.onError) {
      callbacks.onError('No AI provider configured.');
    }
    return;
  }

  chat.providerId = provider.id;
  chat.model = model;

  const assistantMsgId = generateId();
  const assistantMsg = {
    id: assistantMsgId,
    role: 'assistant',
    content: '',
    timestamp: new Date().toISOString()
  };
  chat.messages.push(assistantMsg);

  isGenerating = true;
  currentAbortController = new AbortController();

  if (callbacks.onGenerationStart) {
    callbacks.onGenerationStart(assistantMsgId);
  }

  let accumulatedContent = '';

  try {
    const result = await sendChatRequest({
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      model: model,
      messages: buildApiMessages(chat.messages.slice(0, -1)),
      stream: true,
      signal: currentAbortController.signal,
      onToken: (chunk, fullText) => {
        accumulatedContent = fullText;
        if (callbacks.onToken) {
          callbacks.onToken(assistantMsgId, fullText, chunk);
        }
      }
    });

    assistantMsg.content = result.content || accumulatedContent;
    assistantMsg.metrics = result.metrics;
    chat.updatedAt = new Date().toISOString();
    saveChat(chat);

    if (callbacks.onGenerationEnd) {
      callbacks.onGenerationEnd(assistantMsgId, assistantMsg);
    }
  } catch (err) {
    if (currentAbortController?.signal.aborted) {
      if (accumulatedContent) {
        assistantMsg.content = accumulatedContent;
        chat.updatedAt = new Date().toISOString();
        saveChat(chat);
      } else {
        chat.messages = chat.messages.filter(m => m.id !== assistantMsgId);
        saveChat(chat);
      }
      if (callbacks.onGenerationAborted) {
        callbacks.onGenerationAborted(assistantMsgId, accumulatedContent);
      }
    } else {
      chat.messages = chat.messages.filter(m => m.id !== assistantMsgId);
      saveChat(chat);
      if (callbacks.onError) {
        callbacks.onError(err.message);
      }
    }
  } finally {
    isGenerating = false;
    currentAbortController = null;
    if (callbacks.onStateReset) {
      callbacks.onStateReset();
    }
  }
}
