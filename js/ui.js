/**
 * Localhost AI Chat - UI Controller & DOM Rendering
 * Pure Vanilla JavaScript ES Module
 */

import { escapeHtml, formatTime, getDateBucket } from './utils.js';
import {
  getChats,
  getChatById,
  saveChat,
  deleteChat,
  getActiveChatId,
  setActiveChatId,
  getSettings,
  getProviders
} from './storage.js';
import {
  getActiveProviderAndModel,
  setActiveProviderAndModel,
  getAllAvailableModels
} from './providers.js';
import { renderMarkdown, setupCodeCopyButtons } from './markdown.js';

/**
 * Display a floating toast notification
 * @param {string} message
 * @param {'info'|'success'|'warning'|'error'} [type='info']
 * @param {number} [duration=3500]
 */
export function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div class="toast-content">${escapeHtml(message).replace(/\n/g, '<br>')}</div>
    <button type="button" class="toast-close" aria-label="Dismiss">&times;</button>
  `;

  const removeToast = () => {
    toast.classList.add('toast-hiding');
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 250);
  };

  toast.querySelector('.toast-close')?.addEventListener('click', removeToast);
  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(removeToast, duration);
  }
}

/**
 * Show a reusable confirmation modal
 * @param {string} title
 * @param {string} message
 * @param {Function} onConfirm
 */
export function showConfirmModal(title, message, onConfirm) {
  const modal = document.getElementById('confirm-modal');
  const modalTitle = document.getElementById('confirm-modal-title');
  const modalMessage = document.getElementById('confirm-modal-message');
  const btnConfirm = document.getElementById('btn-confirm-action');
  const btnCancel = document.getElementById('btn-confirm-cancel');
  const btnClose = document.getElementById('btn-confirm-close');

  if (!modal) return;

  modalTitle.textContent = title;
  modalMessage.innerHTML = escapeHtml(message).replace(/\n/g, '<br>');
  modal.classList.add('active');

  const cleanup = () => {
    modal.classList.remove('active');
    btnConfirm.replaceWith(btnConfirm.cloneNode(true));
    btnCancel.replaceWith(btnCancel.cloneNode(true));
    btnClose.replaceWith(btnClose.cloneNode(true));
  };

  btnCancel.addEventListener('click', cleanup);
  btnClose.addEventListener('click', cleanup);

  modal.querySelector('#btn-confirm-action').addEventListener('click', () => {
    cleanup();
    if (typeof onConfirm === 'function') onConfirm();
  });
}

/**
 * Show chat rename prompt modal
 * @param {string} chatId
 * @param {Function} onRename
 */
export function showRenameModal(chatId, onRename) {
  const chat = getChatById(chatId);
  if (!chat) return;

  const modal = document.getElementById('rename-modal');
  const input = document.getElementById('rename-chat-input');
  const btnSave = document.getElementById('btn-rename-save');
  const btnCancel = document.getElementById('btn-rename-cancel');
  const btnClose = document.getElementById('btn-rename-close');

  if (!modal || !input) return;

  input.value = chat.title || 'New Conversation';
  modal.classList.add('active');
  input.focus();
  input.select();

  const cleanup = () => {
    modal.classList.remove('active');
    btnSave.replaceWith(btnSave.cloneNode(true));
    btnCancel.replaceWith(btnCancel.cloneNode(true));
    btnClose.replaceWith(btnClose.cloneNode(true));
  };

  btnCancel.addEventListener('click', cleanup);
  btnClose.addEventListener('click', cleanup);

  const save = () => {
    const newTitle = input.value.trim();
    if (newTitle) {
      chat.title = newTitle;
      saveChat(chat);
      if (typeof onRename === 'function') onRename(chat);
    }
    cleanup();
  };

  modal.querySelector('#btn-rename-save').addEventListener('click', save);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') cleanup();
  });
}

/**
 * Render Sidebar Conversations grouped by date buckets
 * @param {string} [searchQuery='']
 * @param {Function} onSelectChat
 * @param {Function} onRefresh
 */
export function renderSidebarChats(searchQuery = '', onSelectChat, onRefresh) {
  const container = document.getElementById('sidebar-chats-container');
  if (!container) return;

  const activeChatId = getActiveChatId();
  let chats = getChats();

  // Filter if search query is provided
  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    chats = chats.filter(c => {
      if (c.title && c.title.toLowerCase().includes(q)) return true;
      return c.messages?.some(m => m.content && m.content.toLowerCase().includes(q));
    });
  }

  if (chats.length === 0) {
    container.innerHTML = `
      <div class="sidebar-empty-state">
        <p>${searchQuery ? 'No matching conversations' : 'No conversations yet'}</p>
      </div>
    `;
    return;
  }

  // Group chats by date bucket
  const buckets = {
    Today: [],
    Yesterday: [],
    'Previous 7 Days': [],
    Older: []
  };

  for (const c of chats) {
    const bucket = getDateBucket(c.updatedAt || c.createdAt);
    buckets[bucket].push(c);
  }

  let html = '';
  for (const [bucketName, bucketChats] of Object.entries(buckets)) {
    if (bucketChats.length === 0) continue;

    html += `
      <div class="sidebar-group">
        <div class="sidebar-group-title">${bucketName}</div>
        <div class="sidebar-group-items">
          ${bucketChats
            .map(c => {
              const isActive = c.id === activeChatId ? 'active' : '';
              return `
                <div class="sidebar-chat-item ${isActive}" data-chat-id="${escapeHtml(c.id)}" onclick="if(window.__selectChat) window.__selectChat('${escapeHtml(c.id)}');">
                  <div class="chat-item-text" title="${escapeHtml(c.title)}">
                    ${escapeHtml(c.title)}
                  </div>
                  <button type="button" class="btn-chat-menu" data-chat-id="${escapeHtml(c.id)}" aria-label="Conversation Options" title="Options" onclick="event.stopPropagation();">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="1"></circle>
                      <circle cx="12" cy="5" r="1"></circle>
                      <circle cx="12" cy="19" r="1"></circle>
                    </svg>
                  </button>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    `;
  }

  container.innerHTML = html;

  // Bind click handlers
  container.querySelectorAll('.sidebar-chat-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('.btn-chat-menu')) return;
      const chatId = item.dataset.chatId;
      setActiveChatId(chatId);
      if (typeof onSelectChat === 'function') onSelectChat(chatId);
    });
  });

  // Bind context options menu
  container.querySelectorAll('.btn-chat-menu').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const chatId = btn.dataset.chatId;
      showChatContextMenu(e, chatId, onRefresh);
    });
  });
}

/**
 * Show a dropdown context menu at click position for chat item
 */
function showChatContextMenu(event, chatId, onRefresh) {
  // Remove existing dropdown menu
  document.querySelectorAll('.chat-dropdown-menu').forEach(m => m.remove());

  const menu = document.createElement('div');
  menu.className = 'chat-dropdown-menu';
  menu.innerHTML = `
    <button type="button" class="menu-item menu-rename">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 20h9"></path>
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
      </svg>
      Rename
    </button>
    <button type="button" class="menu-item menu-delete text-danger">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>
      Delete
    </button>
  `;

  // Position relative to click
  const rect = event.currentTarget.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.left = `${Math.min(rect.left, window.innerWidth - 150)}px`;
  menu.style.zIndex = '1000';

  document.body.appendChild(menu);

  const closeMenu = () => menu.remove();
  setTimeout(() => window.addEventListener('click', closeMenu, { once: true }), 10);

  menu.querySelector('.menu-rename')?.addEventListener('click', () => {
    closeMenu();
    showRenameModal(chatId, () => {
      if (onRefresh) onRefresh();
    });
  });

  menu.querySelector('.menu-delete')?.addEventListener('click', () => {
    closeMenu();
    showConfirmModal(
      'Delete Conversation',
      'Delete this conversation? This action cannot be undone.',
      () => {
        deleteChat(chatId);
        showToast('Conversation deleted.', 'info');
        if (onRefresh) onRefresh();
      }
    );
  });
}

let currentModelSelectCallback = null;

/**
 * Render and update the Header Model Selector
 * @param {Function} [onModelSelect]
 */
export function updateModelSelector(onModelSelect) {
  if (typeof onModelSelect === 'function') {
    currentModelSelectCallback = onModelSelect;
  }

  const btn = document.getElementById('model-selector-btn');
  const dropdown = document.getElementById('model-selector-dropdown');
  if (!btn || !dropdown) return;

  const { provider, model } = getActiveProviderAndModel();
  const available = getAllAvailableModels();

  if (!provider || available.length === 0) {
    btn.innerHTML = `
      <span class="model-badge">No Provider</span>
      <span class="model-name">Configure in Settings</span>
      <svg class="chevron-down" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    `;
    dropdown.innerHTML = `
      <div class="dropdown-empty">
        <p>No AI providers found.</p>
        <a href="#settings" class="btn btn-primary btn-sm">Add Provider</a>
      </div>
    `;
    return;
  }

  btn.innerHTML = `
    <span class="model-badge">${escapeHtml(provider.name)}</span>
    <span class="model-name">${escapeHtml(model)}</span>
    <svg class="chevron-down" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  `;

  let html = '';
  for (const prov of available) {
    html += `
      <div class="model-group">
        <div class="model-group-title">${escapeHtml(prov.providerName)}</div>
        <div class="model-group-options">
          ${prov.models
            .map(m => {
              const isSelected = prov.providerId === provider.id && m === model;
              return `
                <div class="model-option ${isSelected ? 'selected' : ''}" data-provider-id="${escapeHtml(prov.providerId)}" data-model="${escapeHtml(m)}">
                  <span>${escapeHtml(m)}</span>
                  ${isSelected ? '<span class="check-mark">✓</span>' : ''}
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    `;
  }

  dropdown.innerHTML = html;

  // Option selection
  dropdown.querySelectorAll('.model-option').forEach(option => {
    option.addEventListener('click', () => {
      const pId = option.dataset.providerId;
      const mName = option.dataset.model;
      setActiveProviderAndModel(pId, mName);
      dropdown.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      updateModelSelector();
      if (typeof currentModelSelectCallback === 'function') {
        currentModelSelectCallback(pId, mName);
      }
    });
  });
}

/**
 * ব্যবহারকারীর attach করা ফাইল/ইমেজগুলোকে মেসেজ বাবলের ভেতরে দেখায়
 * @param {Array<Object>} attachments
 * @returns {string}
 */
function renderAttachmentsHtml(attachments) {
  if (!attachments || attachments.length === 0) return '';

  const chips = attachments.map(att => {
    if (att.isImage && att.dataUrl) {
      return `<div class="msg-attachment-thumb"><img src="${att.dataUrl}" alt="${escapeHtml(att.name)}" /></div>`;
    }
    const label = att.error ? `⚠ ${escapeHtml(att.name)}` : `📄 ${escapeHtml(att.name)}`;
    return `<div class="msg-attachment-chip" title="${escapeHtml(att.sizeLabel || '')}">${label}</div>`;
  }).join('');

  return `<div class="msg-attachments-row">${chips}</div>`;
}

/**
 * Web search source লিঙ্কগুলো চিপ আকারে দেখায়
 * @param {Array<{title:string,url:string,snippet:string}>} results
 * @returns {string}
 */
function renderSearchResultsHtml(results) {
  if (!results || results.length === 0) return '';
  const items = results.slice(0, 5).map(r => `
    <a class="search-source-chip" href="${escapeHtml(r.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(r.snippet || '')}">
      🔗 ${escapeHtml(r.title || r.url)}
    </a>
  `).join('');
  return `<div class="search-sources-box"><span class="search-sources-label">🌐 Web sources:</span>${items}</div>`;
}

/**
 * Render Chat Messages in Main Area
 * @param {Object} chat
 * @param {Object} handlers - { onRegenerate, onEditMessage, onCopy }
 */
export function renderChatArea(chat, handlers = {}) {
  const container = document.getElementById('chat-messages-container');
  const emptyState = document.getElementById('chat-empty-state');
  const noProviderState = document.getElementById('chat-no-provider-state');
  if (!container) return;

  const providers = getProviders();
  if (providers.length === 0) {
    container.innerHTML = '';
    container.style.display = 'none';
    if (emptyState) emptyState.style.display = 'none';
    if (noProviderState) noProviderState.style.display = 'flex';
    return;
  }

  if (noProviderState) noProviderState.style.display = 'none';

  if (!chat || !chat.messages || chat.messages.length === 0) {
    container.innerHTML = '';
    container.style.display = 'none';
    if (emptyState) emptyState.style.display = 'flex';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  container.style.display = 'flex';

  const settings = getSettings();
  const showTimestamps = settings.showTimestamps;
  const markdownEnabled = settings.markdownEnabled;
  const devMode = settings.devMode;

  let html = '';
  const totalMessages = chat.messages.length;

  chat.messages.forEach((msg, index) => {
    const isUser = msg.role === 'user';
    const isLastAssistant = !isUser && index === totalMessages - 1;
    const timeStr = showTimestamps && msg.timestamp ? formatTime(msg.timestamp) : '';

    let contentHtml = '';
    if (isUser) {
      const attachmentsHtml = renderAttachmentsHtml(msg.attachments);
      contentHtml = `${attachmentsHtml}<div class="message-user-text">${escapeHtml(msg.content)}</div>`;
    } else {
      contentHtml = markdownEnabled
        ? renderMarkdown(msg.content || '')
        : `<pre class="raw-text">${escapeHtml(msg.content || '')}</pre>`;
    }

    // Developer metrics
    let devMetricsHtml = '';
    if (devMode && !isUser && msg.metrics) {
      devMetricsHtml = `
        <div class="dev-metrics-badge">
          <span>Model: ${escapeHtml(msg.metrics.model || chat.model || 'N/A')}</span>
          <span>Status: ${msg.metrics.status || 200}</span>
          <span>Latency: ${msg.metrics.durationMs || 0}ms</span>
          <span>Stream: ${msg.metrics.streaming ? 'Yes' : 'No'}</span>
          <span>Size: ${msg.metrics.responseSize || 0} B</span>
        </div>
      `;
    }

    // Web search সোর্স: assistant মেসেজের ঠিক আগের user মেসেজে searchResults থাকলে সেটা দেখাও
    let sourcesHtml = '';
    if (!isUser && index > 0 && chat.messages[index - 1]?.searchResults?.length) {
      sourcesHtml = renderSearchResultsHtml(chat.messages[index - 1].searchResults);
    }

    html += `
      <div class="message-row ${isUser ? 'user-row' : 'assistant-row'}" id="msg-${msg.id}" data-id="${msg.id}">
        <div class="message-avatar">
          ${isUser ? 'You' : 'AI'}
        </div>
        <div class="message-bubble-wrapper">
          <div class="message-meta">
            <span class="message-sender">${isUser ? 'You' : 'Assistant'}</span>
            ${timeStr ? `<span class="message-timestamp">${timeStr}</span>` : ''}
          </div>
          <div class="message-bubble">
            <div class="message-content-box">${contentHtml}</div>
            ${devMetricsHtml}
            ${sourcesHtml}
          </div>
          <div class="message-actions-bar">
            ${
              isUser
                ? `<button type="button" class="btn-msg-action btn-edit-msg" data-id="${msg.id}" title="Edit message">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M12 20h9"></path>
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                    </svg>
                    Edit
                  </button>`
                : `<button type="button" class="btn-msg-action btn-copy-msg" data-id="${msg.id}" title="Copy response">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    Copy
                  </button>
                  ${
                    isLastAssistant
                      ? `<button type="button" class="btn-msg-action btn-regen-msg" title="Regenerate response">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="23 4 23 10 17 10"></polyline>
                            <polyline points="1 20 1 14 7 14"></polyline>
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                          </svg>
                          Regenerate
                        </button>`
                      : ''
                  }`
            }
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  setupCodeCopyButtons(container);

  // Bind message action buttons
  container.querySelectorAll('.btn-copy-msg').forEach(btn => {
    btn.addEventListener('click', async () => {
      const msgId = btn.dataset.id;
      const msg = chat.messages.find(m => m.id === msgId);
      if (!msg) return;
      try {
        await navigator.clipboard.writeText(msg.content);
        showToast('Response copied to clipboard!', 'success', 2000);
      } catch {
        showToast('Failed to copy to clipboard', 'error');
      }
    });
  });

  container.querySelectorAll('.btn-regen-msg').forEach(btn => {
    btn.addEventListener('click', () => {
      if (handlers.onRegenerate) handlers.onRegenerate();
    });
  });

  container.querySelectorAll('.btn-edit-msg').forEach(btn => {
    btn.addEventListener('click', () => {
      const msgId = btn.dataset.id;
      const msg = chat.messages.find(m => m.id === msgId);
      if (!msg) return;
      startEditingMessage(msgId, msg.content, handlers.onEditMessage);
    });
  });

  // Scroll to bottom if autoscroll is enabled
  if (settings.autoScroll) {
    scrollToBottom();
  }
}

/**
 * Enter message editing inline mode
 */
function startEditingMessage(msgId, currentContent, onSave) {
  const row = document.getElementById(`msg-${msgId}`);
  if (!row) return;

  const bubble = row.querySelector('.message-content-box');
  const actions = row.querySelector('.message-actions-bar');
  if (!bubble) return;

  const originalHtml = bubble.innerHTML;
  if (actions) actions.style.display = 'none';

  bubble.innerHTML = `
    <div class="inline-edit-box">
      <textarea class="input-field inline-edit-textarea" rows="3">${escapeHtml(currentContent)}</textarea>
      <div class="inline-edit-actions">
        <button type="button" class="btn btn-primary btn-sm btn-save-edit">Save & Resend</button>
        <button type="button" class="btn btn-secondary btn-sm btn-cancel-edit">Cancel</button>
      </div>
    </div>
  `;

  const textarea = bubble.querySelector('textarea');
  textarea.focus();

  const cancel = () => {
    bubble.innerHTML = originalHtml;
    if (actions) actions.style.display = 'flex';
  };

  bubble.querySelector('.btn-cancel-edit')?.addEventListener('click', cancel);
  bubble.querySelector('.btn-save-edit')?.addEventListener('click', () => {
    const newContent = textarea.value.trim();
    if (newContent && newContent !== currentContent) {
      if (onSave) onSave(msgId, newContent);
    } else {
      cancel();
    }
  });
}

/**
 * Append or update live streaming assistant message chunk
 * @param {string} assistantMsgId
 * @param {string} accumulatedText
 */
export function updateStreamingMessage(assistantMsgId, accumulatedText) {
  let row = document.getElementById(`msg-${assistantMsgId}`);
  const container = document.getElementById('chat-messages-container');
  const emptyState = document.getElementById('chat-empty-state');
  const noProviderState = document.getElementById('chat-no-provider-state');

  if (emptyState) emptyState.style.display = 'none';
  if (noProviderState) noProviderState.style.display = 'none';
  if (container) container.style.display = 'flex';

  const settings = getSettings();

  if (!row && container) {
    row = document.createElement('div');
    row.className = 'message-row assistant-row';
    row.id = `msg-${assistantMsgId}`;
    row.innerHTML = `
      <div class="message-avatar">AI</div>
      <div class="message-bubble-wrapper">
        <div class="message-meta">
          <span class="message-sender">Assistant</span>
          ${settings.showTimestamps ? `<span class="message-timestamp">${formatTime(new Date())}</span>` : ''}
        </div>
        <div class="message-bubble">
          <div class="message-content-box">
            <div class="streaming-indicator">
              <span class="dot"></span><span class="dot"></span><span class="dot"></span>
              <span class="thinking-label">AI is thinking...</span>
            </div>
          </div>
        </div>
      </div>
    `;
    container.appendChild(row);
  }

  const contentBox = row.querySelector('.message-content-box');
  if (contentBox) {
    if (!accumulatedText) {
      contentBox.innerHTML = `
        <div class="streaming-indicator">
          <span class="dot"></span><span class="dot"></span><span class="dot"></span>
          <span class="thinking-label">AI is thinking...</span>
        </div>
      `;
    } else {
      contentBox.innerHTML = settings.markdownEnabled
        ? renderMarkdown(accumulatedText)
        : `<pre class="raw-text">${escapeHtml(accumulatedText)}</pre>`;
      setupCodeCopyButtons(contentBox);
    }
  }

  if (settings.autoScroll) {
    scrollToBottom();
  }
}

/**
 * Scroll chat container to bottom
 */
export function scrollToBottom() {
  const scrollArea = document.getElementById('chat-scroll-area');
  if (scrollArea) {
    scrollArea.scrollTop = scrollArea.scrollHeight;
  }
}