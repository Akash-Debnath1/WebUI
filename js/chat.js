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
import { performWebSearch, formatResultsAsContext } from './websearch.js';

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
 * Prepare messages array for API payload, prepending Custom System Instructions
 * and (optionally) live web search results context
 * @param {Array<Object>} chatMessages
 * @param {string} [searchContext] - Optional web search result context to inject as a system message
 * @returns {Array<{role: string, content: any}>}
 */
function buildApiMessages(chatMessages, searchContext) {
  const settings = getSettings();
  const systemPrompt = (settings.customInstructions || '').trim();
  const apiMessages = [];

  if (systemPrompt) {
    apiMessages.push({
      role: 'system',
      content: systemPrompt
    });
  }

  if (searchContext) {
    apiMessages.push({
      role: 'system',
      content: searchContext
    });
  }

  for (const m of chatMessages) {
    if (m.attachments && m.attachments.length > 0) {
      apiMessages.push({
        role: m.role,
        content: buildMultimodalContent(m)
      });
    } else if (m.content) {
      apiMessages.push({
        role: m.role,
        content: m.content
      });
    }
  }

  return apiMessages;
}

/**
 * টেক্সট + ইমেজ attachments কে OpenAI-compatible multimodal content ফরম্যাটে রূপান্তর করে।
 * টেক্সট ফাইল হলে content-এর সাথে জুড়ে দেয়, ইমেজ হলে vision-format অ্যারে বানায়।
 * @param {Object} message
 * @returns {string|Array<Object>}
 */
function buildMultimodalContent(message) {
  let textBody = message.content || '';

  const textAttachments = message.attachments.filter(a => a.textContent);
  for (const att of textAttachments) {
    textBody += `\n\n--- Attached file: ${att.name} ---\n${att.textContent}\n--- End of ${att.name} ---`;
  }

  const imageAttachments = message.attachments.filter(a => a.isImage && a.dataUrl);

  // ইমেজ না থাকলে plain text পাঠাও (non-vision মডেলের compatibility ভালো থাকে)
  if (imageAttachments.length === 0) {
    return textBody;
  }

  const parts = [{ type: 'text', text: textBody }];
  for (const att of imageAttachments) {
    parts.push({ type: 'image_url', image_url: { url: att.dataUrl } });
  }
  return parts;
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
 * @param {Array<Object>} [attachments] - Processed file/image attachments from attachments.js
 * @param {Object} callbacks - UI hooks for state changes
 * @returns {Promise<void>}
 */
export async function submitUserMessage(text, attachments = [], callbacks = {}) {
  const cleanText = (text || '').trim();
  if ((!cleanText && attachments.length === 0) || isGenerating) return;

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
    chat.title = generateChatTitle(cleanText || (attachments[0]?.name ?? 'Attachment'));
  }

  const userMsgId = generateId();
  const userMsg = {
    id: userMsgId,
    role: 'user',
    content: cleanText,
    attachments: attachments.length > 0 ? attachments : undefined,
    timestamp: new Date().toISOString()
  };
  chat.messages.push(userMsg);
  saveChat(chat);

  if (callbacks.onChatUpdated) {
    callbacks.onChatUpdated(chat);
  }

  // ---- Web Search (যদি Settings/toggle থেকে চালু করা থাকে) ----
  let searchContext = '';
  const settings = getSettings();
  if (settings.webSearchEnabled && cleanText) {
    if (callbacks.onSearchStart) callbacks.onSearchStart();

    const searchResult = await performWebSearch(cleanText);

    if (searchResult.ok && searchResult.results.length > 0) {
      searchContext = formatResultsAsContext(searchResult.results, cleanText);
      userMsg.searchResults = searchResult.results;
      saveChat(chat);
    } else if (!searchResult.ok && callbacks.onSearchError) {
      callbacks.onSearchError(searchResult.message);
    }

    if (callbacks.onSearchEnd) callbacks.onSearchEnd();
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
      messages: buildApiMessages(chat.messages.slice(0, -1), searchContext), // সব মেসেজ + system prompt + search context
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

  // এই মেসেজের সাথে আগের সেভ করা searchResults থাকলে সেটাকেই context হিসেবে পুনরায় ব্যবহার করো
  const searchContext = lastUserMsg.searchResults
    ? formatResultsAsContext(lastUserMsg.searchResults, lastUserMsg.content)
    : '';

  try {
    const result = await sendChatRequest({
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      model: model,
      messages: buildApiMessages(chat.messages.slice(0, -1), searchContext),
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

  // Web search চালু থাকলে edited প্রশ্নের জন্যও নতুন সার্চ করো
  let searchContext = '';
  const settings = getSettings();
  if (settings.webSearchEnabled && newContent.trim()) {
    if (callbacks.onSearchStart) callbacks.onSearchStart();
    const searchResult = await performWebSearch(newContent.trim());
    if (searchResult.ok && searchResult.results.length > 0) {
      searchContext = formatResultsAsContext(searchResult.results, newContent.trim());
      chat.messages[msgIndex].searchResults = searchResult.results;
      saveChat(chat);
    } else if (!searchResult.ok && callbacks.onSearchError) {
      callbacks.onSearchError(searchResult.message);
    }
    if (callbacks.onSearchEnd) callbacks.onSearchEnd();
  }

  try {
    const result = await sendChatRequest({
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      model: model,
      messages: buildApiMessages(chat.messages.slice(0, -1), searchContext),
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