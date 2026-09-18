/**
 * Localhost AI Chat - Markdown Parser & Safe Sanitizer
 * Pure Vanilla JavaScript ES Module (Zero External Dependencies)
 * 
 * Secure design: Escapes raw HTML first, then transforms valid Markdown tokens
 * into semantic, safe HTML with syntax headers, language badges, and copy buttons.
 */

import { escapeHtml } from './utils.js';

/**
 * Render raw markdown string into safe HTML
 * @param {string} markdown
 * @returns {string} Safe HTML string
 */
export function renderMarkdown(markdown) {
  if (!markdown || typeof markdown !== 'string') return '';

  // Extract code blocks first to protect their contents from inline replacements
  const codeBlocks = [];
  let processed = markdown.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const placeholder = `@@CODEBLOCK_${codeBlocks.length}@@`;
    codeBlocks.push({
      lang: (lang || 'text').toLowerCase().trim(),
      code: code.replace(/\n$/, '')
    });
    return placeholder;
  });

  // Extract inline code
  const inlineCodes = [];
  processed = processed.replace(/`([^`\n]+)`/g, (match, code) => {
    const placeholder = `@@INLINECODE_${inlineCodes.length}@@`;
    inlineCodes.push(code);
    return placeholder;
  });

  // Escape HTML in the non-code text to strictly prevent XSS
  processed = escapeHtml(processed);

  // Split into lines for block-level parsing
  const lines = processed.split('\n');
  const output = [];
  let inList = false;
  let listType = null; // 'ul' or 'ol'
  let inBlockquote = false;
  let inTable = false;
  let tableRows = [];

  const closeList = () => {
    if (inList) {
      output.push(`</${listType}>`);
      inList = false;
      listType = null;
    }
  };

  const closeBlockquote = () => {
    if (inBlockquote) {
      output.push('</blockquote>');
      inBlockquote = false;
    }
  };

  const closeTable = () => {
    if (inTable) {
      if (tableRows.length > 0) {
        output.push('<div class="table-container"><table>');
        // Check if row 1 is header delimiter (e.g. |---|---|)
        if (tableRows.length >= 2 && /^(\s*\|?\s*:?-+:?\s*\|)+\s*$/.test(tableRows[1])) {
          const headers = parseTableRow(tableRows[0]);
          output.push('<thead><tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr></thead>');
          output.push('<tbody>');
          for (let i = 2; i < tableRows.length; i++) {
            const cells = parseTableRow(tableRows[i]);
            output.push('<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>');
          }
          output.push('</tbody>');
        } else {
          output.push('<tbody>');
          for (const row of tableRows) {
            const cells = parseTableRow(row);
            output.push('<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>');
          }
          output.push('</tbody>');
        }
        output.push('</table></div>');
      }
      tableRows = [];
      inTable = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Table detection (lines starting and ending with | or containing |)
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 1) {
      closeList();
      closeBlockquote();
      inTable = true;
      tableRows.push(trimmed);
      continue;
    } else {
      closeTable();
    }

    // Horizontal Rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      closeList();
      closeBlockquote();
      output.push('<hr class="markdown-hr">');
      continue;
    }

    // Headings: # Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      closeList();
      closeBlockquote();
      const level = headingMatch[1].length;
      output.push(`<h${level} class="markdown-h${level}">${parseInline(headingMatch[2])}</h${level}>`);
      continue;
    }

    // Blockquote: > text
    const quoteMatch = line.match(/^&gt;\s?(.*)$/);
    if (quoteMatch) {
      closeList();
      if (!inBlockquote) {
        output.push('<blockquote class="markdown-quote">');
        inBlockquote = true;
      }
      output.push(`<p>${parseInline(quoteMatch[1])}</p>`);
      continue;
    } else {
      closeBlockquote();
    }

    // Unordered List: - or *
    const ulMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (ulMatch) {
      if (!inList || listType !== 'ul') {
        closeList();
        output.push('<ul class="markdown-ul">');
        inList = true;
        listType = 'ul';
      }
      output.push(`<li>${parseInline(ulMatch[2])}</li>`);
      continue;
    }

    // Ordered List: 1.
    const olMatch = line.match(/^(\s*)\d+\.\s+(.*)$/);
    if (olMatch) {
      if (!inList || listType !== 'ol') {
        closeList();
        output.push('<ol class="markdown-ol">');
        inList = true;
        listType = 'ol';
      }
      output.push(`<li>${parseInline(olMatch[2])}</li>`);
      continue;
    }

    // Empty line ends lists
    if (!trimmed) {
      closeList();
      continue;
    }

    // Paragraph
    closeList();
    output.push(`<p>${parseInline(line)}</p>`);
  }

  closeList();
  closeBlockquote();
  closeTable();

  let html = output.join('\n');

  // Re-insert Inline Code
  html = html.replace(/@@INLINECODE_(\d+)@@/g, (match, idx) => {
    const raw = inlineCodes[parseInt(idx, 10)] || '';
    return `<code class="inline-code">${escapeHtml(raw)}</code>`;
  });

  // Re-insert Code Blocks with header & copy button
  html = html.replace(/@@CODEBLOCK_(\d+)@@/g, (match, idx) => {
    const block = codeBlocks[parseInt(idx, 10)];
    if (!block) return '';
    const safeLang = escapeHtml(block.lang || 'text');
    const safeCode = escapeHtml(block.code);

    return `
      <div class="code-block-wrapper">
        <div class="code-block-header">
          <span class="code-lang-label">${safeLang}</span>
          <button type="button" class="code-copy-btn" aria-label="Copy code">
            <svg class="copy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span class="copy-text">Copy</span>
          </button>
        </div>
        <pre><code class="language-${safeLang}">${safeCode}</code></pre>
      </div>
    `.trim();
  });

  return html;
}

/**
 * Parse table row cells
 * @param {string} row
 * @returns {string[]}
 */
function parseTableRow(row) {
  let inner = row.trim();
  if (inner.startsWith('|')) inner = inner.slice(1);
  if (inner.endsWith('|')) inner = inner.slice(0, -1);
  return inner.split('|').map(cell => parseInline(cell.trim()));
}

/**
 * Parse inline markdown tokens: bold, italic, strikethrough, links
 * @param {string} text
 * @returns {string}
 */
function parseInline(text) {
  if (!text) return '';

  return text
    // Bold + Italic: ***text*** or ___text___
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    // Bold: **text** or __text__
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.*?)__/g, '<strong>$1</strong>')
    // Italic: *text* or _text_
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/_([^_\n]+)_/g, '<em>$1</em>')
    // Strikethrough: ~~text~~
    .replace(/~~(.*?)~~/g, '<del>$1</del>')
    // Links: [text](url) - ensure safe schemes
    .replace(/\[(.*?)\]\((https?:\/\/[^\s"'<>]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="markdown-link">$1</a>');
}

/**
 * Attach copy listener to all code copy buttons inside an element
 * @param {HTMLElement} container
 */
export function setupCodeCopyButtons(container) {
  if (!container) return;
  const buttons = container.querySelectorAll('.code-copy-btn');
  buttons.forEach(button => {
    if (button.dataset.hasListener) return;
    button.dataset.hasListener = 'true';

    button.addEventListener('click', async (e) => {
      e.stopPropagation();
      const pre = button.closest('.code-block-wrapper')?.querySelector('pre code');
      if (!pre) return;

      const codeText = pre.textContent || '';
      try {
        await navigator.clipboard.writeText(codeText);
        const textSpan = button.querySelector('.copy-text');
        const originalText = textSpan ? textSpan.textContent : 'Copy';
        if (textSpan) textSpan.textContent = 'Copied!';
        button.classList.add('copied');

        setTimeout(() => {
          if (textSpan) textSpan.textContent = originalText;
          button.classList.remove('copied');
        }, 2000);
      } catch (err) {
        console.error('Failed to copy code: ', err);
      }
    });
  });
}
