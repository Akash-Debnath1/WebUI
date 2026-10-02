/**
 * Localhost AI Chat - Web Search with Auto-Detection
 * ইউজার শুধু সার্চ ইঞ্জিনের URL দেয়; কোড নিজে query-URL, response format ও parser detect করে।
 */

import { getSettings, saveSettings } from './storage.js';

export const DEFAULT_SEARCH_URL = 'https://duckduckgo.com';

const QUERY_PARAMS = [
  'q', 'query', 'search', 's', 'keyword', 'keywords', 'text',
  'term', 'p', 'wd', 'k', 'searchTerm', 'searchTerms', 'search_query'
];

/**
 * পরিচিত ইঞ্জিন। template(u) নির্দিষ্ট search URL ফেরত দেয়, null হলে ইউজারের URL-ই ব্যবহার হবে।
 */
const KNOWN_ENGINES = [
  {
    name: 'DuckDuckGo',
    match: h => /(^|\.)duckduckgo\.com$/.test(h),
    template: () => 'https://html.duckduckgo.com/html/?q={query}',
    parser: 'ddg'
  },
  {
    name: 'Bing',
    match: h => /^(www\.)?bing\.com$/.test(h),
    template: () => 'https://www.bing.com/search?q={query}&setlang=en-US',
    parser: 'bing'
  },
  {
    name: 'Brave Search',
    match: h => h === 'search.brave.com',
    template: () => 'https://search.brave.com/search?q={query}',
    parser: 'brave'
  },
  {
    name: 'Brave Search API',
    match: h => h === 'api.search.brave.com',
    template: u => (u.pathname.length > 1 ? null : 'https://api.search.brave.com/res/v1/web/search?q={query}'),
    parser: 'auto'
  },
  {
    name: 'Google',
    match: h => /^(www\.)?google\.[a-z.]+$/.test(h),
    template: () => 'https://www.google.com/search?q={query}&hl=en',
    parser: 'google'
  },
  {
    name: 'Google Custom Search API',
    match: h => h === 'www.googleapis.com',
    template: () => null,
    parser: 'auto'
  },
  {
    name: 'Wikipedia',
    match: h => /(^|\.)wikipedia\.org$/.test(h),
    template: u =>
      `https://${u.hostname}/w/api.php?action=query&list=search&srsearch={query}&srlimit=8&format=json&origin=*`,
    parser: 'auto'
  }
];

/** অজানা সাইটের জন্য সাধারণ search path (SearXNG, WordPress, ইত্যাদি) */
const PROBE_PATHS = [
  '/search?q={query}&format=json',
  '/search?q={query}',
  '/?q={query}',
  '/search?query={query}',
  '/search?s={query}',
  '/?s={query}',
  '/search/?q={query}',
  '/api/search?q={query}',
  '/search?keyword={query}'
];

/* ==================== Network ==================== */

/**
 * প্রথমে লোকাল প্রক্সি (server.py), না থাকলে সরাসরি fetch
 */
async function searchFetch(url, { headers = {}, timeoutMs = 15000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const allHeaders = { Accept: 'text/html,application/json;q=0.9,*/*;q=0.8', ...headers };

  try {
    try {
      const proxied = await fetch('/api/proxy', {
        method: 'POST',
        headers: {
          'x-target-url': url,
          'x-target-method': 'GET',
          'x-forward-headers': JSON.stringify(allHeaders)
        },
        signal: ctrl.signal
      });
      // শুধু আমাদের প্রক্সি এই হেডার পাঠায়; না থাকলে প্রক্সি চালু নেই
      if (proxied.headers.get('x-localhost-proxy')) return proxied;
    } catch (err) {
      if (ctrl.signal.aborted) throw err;
    }
    return await fetch(url, { method: 'GET', headers: allHeaders, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function authHeaders(host, key) {
  if (!key) return {};
  if (host === 'api.search.brave.com') return { 'X-Subscription-Token': key, Accept: 'application/json' };
  if (host.endsWith('googleapis.com')) return {};
  return { Authorization: `Bearer ${key}`, 'X-API-Key': key };
}

function hostOf(template) {
  try {
    return new URL(template.replace(/\{query\}/g, 'x')).hostname;
  } catch {
    return '';
  }
}

function makeConfig(name, template, parser) {
  return { name, template, parser: parser || 'auto', host: hostOf(template) };
}

function buildUrl(template, query, apiKey) {
  let t = template.replace(/\{query\}/g, encodeURIComponent(query)).replace(/\{key\}/g, encodeURIComponent(apiKey || ''));
  if (apiKey && /googleapis\.com\/customsearch/.test(t) && !/[?&]key=/.test(t)) {
    t += `&key=${encodeURIComponent(apiKey)}`;
  }
  return t;
}

/* ==================== Parsing ==================== */

const clean = s => (s || '').replace(/\s+/g, ' ').trim();
const stripTags = s => clean((s || '').replace(/<[^>]*>/g, ' '));

function unwrapRedirect(href) {
  try {
    const u = new URL(href);
    const host = u.hostname;
    if (/duckduckgo\.com$/.test(host) && u.pathname.startsWith('/l/')) {
      const r = u.searchParams.get('uddg');
      if (r) return r;
    }
    if (/(^|\.)google\.[a-z.]+$/.test(host) && u.pathname === '/url') {
      const r = u.searchParams.get('q') || u.searchParams.get('url');
      if (r) return r;
    }
    if (/(^|\.)bing\.com$/.test(host) && u.pathname.startsWith('/ck/')) {
      const p = u.searchParams.get('u');
      if (p && p.startsWith('a1')) {
        const b64 = p.slice(2).replace(/-/g, '+').replace(/_/g, '/');
        const dec = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
        if (/^https?:\/\//.test(dec)) return dec;
      }
    }
    return href;
  } catch {
    return href;
  }
}

const HTML_PARSERS = {
  ddg: { item: '.result, .web-result', link: 'a.result__a, .result__title a', snippet: '.result__snippet' },
  bing: { item: 'li.b_algo', link: 'h2 a', snippet: '.b_caption p, .b_lineclamp2, .b_algoSlug, p' },
  brave: {
    item: '#results .snippet, div.snippet',
    link: 'a[href^="http"]',
    title: '.title, .snippet-title',
    snippet: '.snippet-description, .content, .description'
  },
  google: { item: 'div.g, div.MjjYud', link: 'a h3', snippet: '.VwiC3b, [data-sncf], .lEBKkf' }
};

function extractWithParser(doc, baseUrl, p) {
  const out = [];
  doc.querySelectorAll(p.item).forEach(item => {
    if (item.classList.contains('result--ad')) return;
    const linkEl = item.querySelector(p.link);
    if (!linkEl) return;
    const a = linkEl.tagName === 'A' ? linkEl : linkEl.closest('a') || linkEl.querySelector('a');
    if (!a || !a.getAttribute('href')) return;

    let abs;
    try {
      abs = new URL(a.getAttribute('href'), baseUrl).href;
    } catch {
      return;
    }
    const title = clean((p.title && item.querySelector(p.title)?.textContent) || linkEl.textContent);
    const snippet = clean(item.querySelector(p.snippet)?.textContent);
    out.push({ title, url: unwrapRedirect(abs), snippet });
  });
  return out;
}

/** যেকোনো HTML-এর জন্য: heading-এর ভেতরের/আশেপাশের লিংক থেকে ফলাফল বের করা */
function extractGeneric(doc, baseUrl) {
  const out = [];
  doc.querySelectorAll('h1, h2, h3, h4').forEach(h => {
    const a = h.querySelector('a[href]') || h.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

    let abs;
    try {
      abs = new URL(href, baseUrl).href;
    } catch {
      return;
    }
    if (abs === baseUrl) return;

    const title = clean(h.textContent);
    if (title.length < 3) return;

    let box = h.parentElement;
    for (let i = 0; i < 3 && box && clean(box.textContent).length < title.length + 40; i++) {
      box = box.parentElement;
    }
    const snippet = clean(box ? box.textContent : '').replace(title, '').trim().slice(0, 300);
    out.push({ title, url: unwrapRedirect(abs), snippet });
  });
  return out;
}

function parseHtmlResults(html, baseUrl, parserName) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const p = HTML_PARSERS[parserName];
  let results = p ? extractWithParser(doc, baseUrl, p) : [];
  if (results.length === 0) results = extractGeneric(doc, baseUrl);
  return results;
}

const URL_KEYS = ['url', 'link', 'href', 'FirstURL', 'uri', 'permalink'];
const TITLE_KEYS = ['title', 'name', 'heading'];
const SNIPPET_KEYS = ['snippet', 'description', 'content', 'body', 'abstract', 'summary', 'text', 'Text'];

function pick(obj, keys) {
  for (const k of keys) {
    if (typeof obj[k] === 'string' && obj[k].trim()) return obj[k];
  }
  return '';
}

/** JSON-এর ভেতর থেকে "ফলাফলের তালিকা" (title + url আছে এমন object-এর array) খুঁজে বের করে */
function findResultArray(data, depth = 0) {
  if (depth > 4 || data === null || typeof data !== 'object') return null;
  let best = null;

  if (Array.isArray(data)) {
    const objs = data.filter(x => x && typeof x === 'object' && !Array.isArray(x));
    if (objs.length && objs.filter(o => pick(o, URL_KEYS) && (pick(o, TITLE_KEYS) || pick(o, SNIPPET_KEYS))).length >= 1) {
      best = objs;
    }
  }
  for (const v of Object.values(data)) {
    const found = findResultArray(v, depth + 1);
    if (found && (!best || found.length > best.length)) best = found;
  }
  return best;
}

function parseJsonResults(data, baseUrl) {
  // Wikipedia
  if (data?.query?.search && Array.isArray(data.query.search)) {
    const origin = new URL(baseUrl).origin;
    return data.query.search.map(r => ({
      title: r.title,
      url: `${origin}/wiki/${encodeURIComponent(String(r.title).replace(/ /g, '_'))}`,
      snippet: stripTags(r.snippet)
    }));
  }

  // DuckDuckGo Instant Answer
  if (data && (data.RelatedTopics || data.AbstractText !== undefined)) {
    const out = [];
    const flatten = items => {
      for (const it of items || []) {
        if (it.Topics) flatten(it.Topics);
        else if (it.Text && it.FirstURL) out.push({ title: it.Text.split(' - ')[0], url: it.FirstURL, snippet: it.Text });
      }
    };
    flatten(data.RelatedTopics);
    if (data.AbstractText) out.unshift({ title: data.Heading || 'Summary', url: data.AbstractURL || '', snippet: data.AbstractText });
    return out;
  }

  // OpenSearch suggestions: [query, [titles], [descriptions], [urls]]
  if (Array.isArray(data) && typeof data[0] === 'string' && Array.isArray(data[1])) {
    const [, titles, descs = [], urls = []] = data;
    return titles.map((t, i) => ({ title: t, url: urls[i] || '', snippet: descs[i] || '' }));
  }

  // Generic: Google/Brave/SearXNG/Custom JSON
  const arr = findResultArray(data) || [];
  return arr.map(o => ({
    title: clean(stripTags(pick(o, TITLE_KEYS))),
    url: pick(o, URL_KEYS),
    snippet: clean(stripTags(pick(o, SNIPPET_KEYS)))
  }));
}

function parseAny(text, baseUrl, parserName) {
  const trimmed = (text || '').trim();
  let results = [];

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      results = parseJsonResults(JSON.parse(trimmed), baseUrl);
    } catch {
      results = parseHtmlResults(text, baseUrl, parserName);
    }
  } else {
    results = parseHtmlResults(text, baseUrl, parserName);
  }

  const seen = new Set();
  return results
    .filter(r => r && r.title && /^https?:\/\//i.test(r.url || ''))
    .filter(r => (seen.has(r.url) ? false : seen.add(r.url)))
    .slice(0, 8);
}

/* ==================== Search execution ==================== */

async function runSearch(cfg, query, apiKey) {
  try {
    const url = buildUrl(cfg.template, query, apiKey);
    const res = await searchFetch(url, { headers: authHeaders(cfg.host, apiKey) });
    if (!res.ok) return { results: [], error: `HTTP ${res.status}` };
    const text = await res.text();
    return { results: parseAny(text, url, cfg.parser) };
  } catch (err) {
    return { results: [], error: err.name === 'AbortError' ? 'timeout' : err.message };
  }
}

async function verify(cfg, apiKey) {
  const t = await runSearch(cfg, 'test', apiKey);
  if (t.results.length) {
    return { ok: true, config: cfg, message: `${cfg.name} detected (${t.results.length} results)` };
  }
  return {
    ok: false,
    config: cfg,
    message: `${cfg.name}: ফলাফল পাওয়া যায়নি${t.error ? ` (${t.error})` : ''}। URL বা API key চেক করুন।`
  };
}

/* ==================== Auto-detection ==================== */

async function templateFromOpenSearch(xmlUrl) {
  try {
    const res = await searchFetch(xmlUrl);
    if (!res.ok) return null;
    const xml = new DOMParser().parseFromString(await res.text(), 'text/xml');
    const urls = [...xml.getElementsByTagName('Url')];
    const chosen =
      urls.find(x => (x.getAttribute('type') || '').includes('json')) ||
      urls.find(x => (x.getAttribute('type') || '').includes('html')) ||
      urls[0];
    let t = chosen?.getAttribute('template');
    if (!t) return null;
    t = t.replace(/\{searchTerms\??\}/g, '__QUERY__').replace(/\{[^}]*\?\}/g, '');
    if (/\{[^}]+\}/.test(t)) return null;
    return new URL(t, xmlUrl).href.replace(/__QUERY__/g, '{query}');
  } catch {
    return null;
  }
}

function templateFromForm(doc, pageUrl) {
  const sel = 'input[type=search], input[name=q], input[name=query], input[name=s], input[name=search]';
  const form = [...doc.querySelectorAll('form')].find(f => f.querySelector(sel));
  if (!form) return null;
  if ((form.getAttribute('method') || 'get').toLowerCase() !== 'get') return null;

  const input = form.querySelector(sel);
  if (!input?.getAttribute('name')) return null;

  try {
    const action = new URL(form.getAttribute('action') || '', pageUrl);
    form.querySelectorAll('input[type=hidden][name]').forEach(h => action.searchParams.set(h.name, h.value));
    action.searchParams.set(input.getAttribute('name'), '__QUERY__');
    return action.href.replace('__QUERY__', '{query}');
  } catch {
    return null;
  }
}

async function probeEngine(u, apiKey) {
  const templates = [];

  try {
    const pageUrl = u.origin + (u.pathname || '/');
    const res = await searchFetch(pageUrl);
    if (res.ok) {
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');

      const os = doc.querySelector('link[type="application/opensearchdescription+xml"]');
      if (os?.getAttribute('href')) {
        const t = await templateFromOpenSearch(new URL(os.getAttribute('href'), pageUrl).href);
        if (t) templates.push(t);
      }

      const formTemplate = templateFromForm(doc, pageUrl);
      if (formTemplate) templates.push(formTemplate);
    }
  } catch {
    // হোমপেজ না পেলেও সাধারণ path চেষ্টা করা হবে
  }

  for (const p of PROBE_PATHS) templates.push(u.origin + p);

  for (const t of [...new Set(templates)]) {
    const cfg = makeConfig(u.hostname, t, 'auto');
    const test = await runSearch(cfg, 'test', apiKey);
    if (test.results.length) {
      return { ok: true, config: cfg, message: `${cfg.name} detected (${test.results.length} results)` };
    }
  }

  return {
    ok: false,
    message: 'এই সাইটের search পদ্ধতি নিজে থেকে বোঝা যায়নি। URL-এ সরাসরি ?q={query} দিয়ে চেষ্টা করুন (যেমন https://site.com/search?q={query})।'
  };
}

/**
 * @param {string} rawUrl - ইউজারের দেওয়া সার্চ ইঞ্জিনের URL
 * @param {string} [apiKey]
 * @returns {Promise<{ok: boolean, config?: Object, message: string}>}
 */
export async function detectSearchEngine(rawUrl, apiKey = '') {
  let input = (rawUrl || '').trim();
  if (!input) return { ok: false, message: 'Search engine URL দিন।' };
  if (!/^https?:\/\//i.test(input)) input = 'https://' + input;

  let u;
  try {
    u = new URL(input);
  } catch {
    return { ok: false, message: 'URL ঠিক নেই।' };
  }

  const host = u.hostname.toLowerCase();
  const known = KNOWN_ENGINES.find(k => k.match(host));
  let cfg = null;

  if (input.includes('{query}')) {
    // ইউজার নিজেই {query} দিয়েছে
    cfg = makeConfig(known?.name || host, input, known?.parser || 'auto');
  } else {
    const knownTemplate = known ? known.template(u) : null;
    if (knownTemplate) {
      cfg = makeConfig(known.name, knownTemplate, known.parser);
    } else {
      const paramName = QUERY_PARAMS.find(p => u.searchParams.has(p));
      if (paramName) {
        const copy = new URL(u.href);
        copy.searchParams.set(paramName, '__QUERY__');
        cfg = makeConfig(known?.name || host, copy.href.replace('__QUERY__', '{query}'), known?.parser || 'auto');
      }
    }
  }

  if (cfg) return verify(cfg, apiKey);
  return probeEngine(u, apiKey);
}

/**
 * চ্যাট থেকে কল হয়। কনফিগ cache করা না থাকলে নিজে detect করে নেয়।
 * @returns {Promise<{ ok: boolean, results: Array, message?: string }>}
 */
export async function performWebSearch(query) {
  const q = (query || '').trim();
  if (!q) return { ok: false, results: [], message: 'Empty search query.' };

  const settings = getSettings();
  const engineUrl = (settings.searchEngineUrl || DEFAULT_SEARCH_URL).trim();
  const apiKey = settings.searchApiKey || '';

  let cfg = settings.searchDetected && settings.searchDetectedFor === engineUrl ? settings.searchDetected : null;

  if (!cfg) {
    const det = await detectSearchEngine(engineUrl, apiKey);
    if (!det.ok || !det.config) return { ok: false, results: [], message: det.message };
    cfg = det.config;
    saveSettings({ searchDetected: cfg, searchDetectedFor: engineUrl });
  }

  const out = await runSearch(cfg, q, apiKey);
  if (out.results.length === 0) {
    return {
      ok: false,
      results: [],
      message: `কোনো ফলাফল পাওয়া যায়নি${out.error ? ` (${out.error})` : ''}। Settings-এ Search Engine URL চেক করুন।`
    };
  }
  return { ok: true, results: out.results };
}

export function formatResultsAsContext(results, query) {
  if (!results || results.length === 0) return '';
  const lines = results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet || ''}\n   Source: ${r.url}`);
  return [
    `The following live web search results were retrieved for the query: "${query}".`,
    `Use them to answer with up-to-date information when relevant, and cite sources by their URL when you use them.`,
    '',
    lines.join('\n\n')
  ].join('\n');
}