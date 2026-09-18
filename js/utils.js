/**
 * Localhost AI Chat - Utility Functions
 * Pure Vanilla JavaScript ES Module
 */

/**
 * Generate a unique ID (UUID v4 or fallback)
 * @returns {string}
 */
export function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'uid-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
}

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (!str) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(str).replace(/[&<>"']/g, m => map[m]);
}

/**
 * Debounce a function call
 * @param {Function} func
 * @param {number} wait
 * @returns {Function}
 */
export function debounce(func, wait = 250) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Format timestamp into readable time (e.g. "14:32")
 * @param {string|number|Date} dateVal
 * @returns {string}
 */
export function formatTime(dateVal) {
  if (!dateVal) return '';
  const date = new Date(dateVal);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Get category bucket for conversation history: 'Today', 'Yesterday', 'Previous 7 Days', 'Older'
 * @param {string|number|Date} dateVal
 * @returns {'Today'|'Yesterday'|'Previous 7 Days'|'Older'}
 */
export function getDateBucket(dateVal) {
  if (!dateVal) return 'Older';
  const date = new Date(dateVal);
  if (isNaN(date.getTime())) return 'Older';

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
  const startOf7DaysAgo = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);

  if (date >= startOfToday) {
    return 'Today';
  } else if (date >= startOfYesterday) {
    return 'Yesterday';
  } else if (date >= startOf7DaysAgo) {
    return 'Previous 7 Days';
  }
  return 'Older';
}

/**
 * Format bytes into human readable string
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Generate a clean, concise chat title from the first message locally
 * Avoids unnecessary extra API requests
 * @param {string} prompt
 * @returns {string}
 */
export function generateChatTitle(prompt) {
  if (!prompt || typeof prompt !== 'string') return 'New Conversation';
  
  // Clean newlines, markdown headers, and excessive spaces
  let clean = prompt
    .replace(/^#+\s+/g, '')
    .replace(/[`*~_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip common conversational openings if present
  const fillers = [
    /^(can you|could you|please|help me|i want you to|how to|how do i|tell me about|explain)\s+/i
  ];
  for (const regex of fillers) {
    clean = clean.replace(regex, '');
  }

  // Capitalize first letter
  clean = clean.charAt(0).toUpperCase() + clean.slice(1);

  // Take up to first 6 words or 40 characters
  const words = clean.split(' ');
  let title = words.slice(0, 6).join(' ');
  if (title.length > 40) {
    title = title.substring(0, 37) + '...';
  } else if (words.length > 6) {
    title += '...';
  }

  return title || 'New Conversation';
}
