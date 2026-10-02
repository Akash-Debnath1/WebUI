/**
 * Localhost AI Chat - File & Folder Attachment Handling
 * Pure Vanilla JavaScript ES Module (Zero External Dependencies)
 */

import { generateId, formatBytes } from './utils.js';

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
const TEXT_EXTENSIONS = [
  '.txt', '.md', '.js', '.ts', '.jsx', '.tsx', '.json', '.csv', '.html', '.css',
  '.py', '.java', '.c', '.cpp', '.cs', '.go', '.rs', '.php', '.rb', '.sh', '.yml',
  '.yaml', '.xml', '.sql', '.log', '.ini', '.env'
];

const MAX_FILE_SIZE = 8 * 1024 * 1024; // প্রতি ফাইলে 8MB সেফটি ক্যাপ

export function isImageFile(file) {
  return IMAGE_TYPES.includes(file.type) || /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name);
}

function isTextFile(file) {
  if (file.type && file.type.startsWith('text/')) return true;
  return TEXT_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext));
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/**
 * FileList (একাধিক ফাইল অথবা webkitdirectory দিয়ে পুরো ফোল্ডার) কে
 * attachment অবজেক্টে রূপান্তর করে
 * @param {FileList|File[]} fileList
 * @returns {Promise<Array<Object>>}
 */
export async function processFiles(fileList) {
  const files = Array.from(fileList);
  const attachments = [];

  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      attachments.push({
        id: generateId(),
        name: file.webkitRelativePath || file.name,
        size: file.size,
        sizeLabel: formatBytes(file.size),
        error: `File too large (${formatBytes(file.size)}). Max 8MB per file.`,
        isImage: false
      });
      continue;
    }

    const isImage = isImageFile(file);
    const isText = isTextFile(file);

    try {
      if (isImage) {
        const dataUrl = await readAsDataURL(file);
        attachments.push({
          id: generateId(),
          name: file.webkitRelativePath || file.name,
          size: file.size,
          sizeLabel: formatBytes(file.size),
          isImage: true,
          dataUrl
        });
      } else if (isText) {
        const text = await readAsText(file);
        attachments.push({
          id: generateId(),
          name: file.webkitRelativePath || file.name,
          size: file.size,
          sizeLabel: formatBytes(file.size),
          isImage: false,
          textContent: text
        });
      } else {
        attachments.push({
          id: generateId(),
          name: file.webkitRelativePath || file.name,
          size: file.size,
          sizeLabel: formatBytes(file.size),
          isImage: false,
          unsupported: true,
          note: 'Binary file — only filename shared, content not readable in-browser.'
        });
      }
    } catch (err) {
      attachments.push({
        id: generateId(),
        name: file.webkitRelativePath || file.name,
        size: file.size,
        sizeLabel: formatBytes(file.size),
        error: `Failed to read file: ${err.message}`,
        isImage: false
      });
    }
  }

  return attachments;
}

/**
 * ক্লিপবোর্ড পেস্ট থেকে স্ক্রীনশট/ইমেজ ধরার জন্য (Ctrl+V)
 * @param {ClipboardEvent} event
 * @returns {Promise<Array<Object>>}
 */
export async function processClipboardPaste(event) {
  const items = event.clipboardData?.items;
  if (!items) return [];

  const files = [];
  for (const item of items) {
    if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }

  if (files.length === 0) return [];
  return processFiles(files);
}