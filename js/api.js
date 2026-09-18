/**
 * Localhost AI Chat - OpenAI-Compatible API Client with Automatic CORS Bypass
 * Pure Vanilla JavaScript ES Module (Zero External Dependencies)
 */

/**
 * Normalize Base URL and append /chat/completions safely
 * @param {string} baseUrl
 * @returns {string} Fully qualified completions endpoint
 */
export function buildChatCompletionsUrl(baseUrl) {
  if (!baseUrl || typeof baseUrl !== 'string') {
    throw new Error('Base URL is required.');
  }

  let cleanUrl = baseUrl.trim().replace(/\/+$/, '');

  if (cleanUrl.endsWith('/chat/completions')) {
    return cleanUrl;
  }

  if (cleanUrl.endsWith('/v1')) {
    return `${cleanUrl}/chat/completions`;
  }

  if (/\/v1(?:\/|$)/.test(cleanUrl)) {
    return `${cleanUrl}/chat/completions`;
  }

  // Standard OpenAI-compatible format
  return `${cleanUrl}/v1/chat/completions`;
}

/**
 * Construct authorization and content headers
 * @param {string} apiKey
 * @returns {Object}
 */
export function getAuthHeaders(apiKey) {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (apiKey && apiKey.trim()) {
    headers['Authorization'] = `Bearer ${apiKey.trim()}`;
  }

  return headers;
}

/**
 * Check if an error looks like a browser CORS or network block
 * @param {Error} error
 * @returns {boolean}
 */
export function isCorsOrNetworkError(error) {
  if (!error) return false;
  const msg = error.message ? error.message.toLowerCase() : '';
  return (
    error.name === 'TypeError' &&
    (msg.includes('failed to fetch') ||
      msg.includes('networkerror') ||
      msg.includes('cross-origin') ||
      msg.includes('load failed'))
  );
}

/**
 * Helper to execute a fetch request with automatic local proxy fallback on CORS error
 * @param {string} endpoint
 * @param {Object} options
 * @returns {Promise<Response>}
 */
async function fetchWithProxyFallback(endpoint, options) {
  try {
    // 1. First attempt direct browser-to-API request
    const response = await fetch(endpoint, options);
    return response;
  } catch (err) {
    if (options.signal?.aborted) {
      throw err;
    }

    // 2. If blocked by CORS / Network, attempt routing through local server proxy
    if (isCorsOrNetworkError(err)) {
      console.warn(`[API] Direct connection blocked by CORS. Retrying via local proxy for: ${endpoint}`);
      try {
        const proxyHeaders = {
          ...options.headers,
          'x-target-url': endpoint
        };

        const proxyResponse = await fetch('/api/proxy', {
          method: 'POST',
          headers: proxyHeaders,
          body: options.body,
          signal: options.signal
        });

        return proxyResponse;
      } catch (proxyErr) {
        if (options.signal?.aborted) {
          throw proxyErr;
        }
        throw new Error(
          'Unable to connect from the browser (CORS blocked) and local proxy is not reachable. Ensure start.bat or server.py is running.'
        );
      }
    }

    throw err;
  }
}

/**
 * Send chat request with streaming or non-streaming support
 * @param {Object} options
 * @param {string} options.baseUrl
 * @param {string} options.apiKey
 * @param {string} options.model
 * @param {Array<{role: string, content: string}>} options.messages
 * @param {boolean} [options.stream=true]
 * @param {AbortSignal} [options.signal]
 * @param {Function} [options.onToken] - Called as tokens arrive: (chunkText, fullText)
 * @returns {Promise<{content: string, metrics: Object}>}
 */
export async function sendChatRequest({
  baseUrl,
  apiKey,
  model,
  messages,
  stream = true,
  signal,
  onToken
}) {
  const endpoint = buildChatCompletionsUrl(baseUrl);
  const headers = getAuthHeaders(apiKey);

  const payload = {
    model: model || 'default',
    messages: messages.map(m => ({
      role: m.role,
      content: m.content
    })),
    stream: Boolean(stream)
  };

  const startTime = performance.now();
  let response;

  try {
    response = await fetchWithProxyFallback(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal
    });
  } catch (err) {
    if (signal?.aborted) {
      throw new Error('Generation stopped by user.');
    }
    throw err;
  }

  // If streaming was requested but API returned 400 indicating stream unsupported, fallback
  if (!response.ok && stream && response.status === 400) {
    let errorJson = null;
    try {
      errorJson = await response.clone().json();
    } catch {
      // ignore
    }
    const errText = JSON.stringify(errorJson || '').toLowerCase();
    if (errText.includes('stream') || errText.includes('unsupported')) {
      console.warn('[API] Streaming unsupported by endpoint, retrying without stream.');
      return sendChatRequest({
        baseUrl,
        apiKey,
        model,
        messages,
        stream: false,
        signal,
        onToken
      });
    }
  }

  // Handle HTTP errors
  if (!response.ok) {
    let errorMessage = `HTTP ${response.status} ${response.statusText}`;
    try {
      const errData = await response.json();
      if (errData?.error?.message) {
        errorMessage = errData.error.message;
      } else if (typeof errData?.error === 'string') {
        errorMessage = errData.error;
      } else if (errData?.message) {
        errorMessage = errData.message;
      }
    } catch {
      // ignore
    }

    if (response.status === 401) {
      throw new Error(`401 Unauthorized: ${errorMessage}. Check your API key in Settings.`);
    } else if (response.status === 403) {
      throw new Error(`403 Forbidden: Access denied. ${errorMessage}`);
    } else if (response.status === 404) {
      throw new Error(`404 Not Found: Endpoint does not exist at ${endpoint}`);
    } else if (response.status === 429) {
      throw new Error(`429 Rate limit reached or quota exhausted: ${errorMessage}`);
    } else if (response.status >= 500) {
      throw new Error(`Server Error (${response.status}): ${errorMessage}`);
    } else {
      throw new Error(`Request failed (${response.status}): ${errorMessage}`);
    }
  }

  // Process Streaming Response
  if (stream && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let accumulatedText = '';
    let buffer = '';
    let bytesReceived = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        bytesReceived += value.byteLength;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;

          if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.slice(5).trim();
            if (dataStr === '[DONE]') {
              continue;
            }

            try {
              const parsed = JSON.parse(dataStr);
              const choice = parsed.choices?.[0];
              const token =
                choice?.delta?.content ||
                choice?.message?.content ||
                choice?.text ||
                '';

              if (token) {
                accumulatedText += token;
                if (typeof onToken === 'function') {
                  onToken(token, accumulatedText);
                }
              }
            } catch {
              // Non-JSON chunk, ignore
            }
          }
        }
      }
    } catch (streamErr) {
      if (signal?.aborted) {
        throw new Error('Generation stopped by user.');
      }
      throw streamErr;
    }

    const durationMs = Math.round(performance.now() - startTime);

    return {
      content: accumulatedText,
      metrics: {
        status: response.status,
        durationMs,
        responseSize: bytesReceived,
        streaming: true,
        model: model || 'default'
      }
    };
  }

  // Process Non-Streaming Response
  const data = await response.json();
  const durationMs = Math.round(performance.now() - startTime);
  const content =
    data.choices?.[0]?.message?.content ||
    data.choices?.[0]?.text ||
    data.content ||
    '';

  return {
    content,
    metrics: {
      status: response.status,
      durationMs,
      responseSize: JSON.stringify(data).length,
      streaming: false,
      model: data.model || model || 'default'
    }
  };
}

/**
 * Test Connection to an API provider with automatic proxy fallback
 * @param {Object} options
 * @param {string} options.baseUrl
 * @param {string} options.apiKey
 * @param {string} [options.model]
 * @returns {Promise<{ok: boolean, status: number, message: string}>}
 */
export async function testConnection({ baseUrl, apiKey, model }) {
  if (!baseUrl) {
    return {
      ok: false,
      status: 0,
      message: 'Base URL is required.'
    };
  }

  const endpoint = buildChatCompletionsUrl(baseUrl);
  const headers = getAuthHeaders(apiKey);

  const testPayload = {
    model: model || 'gpt-4o-mini',
    messages: [
      {
        role: 'user',
        content: 'ping'
      }
    ],
    max_tokens: 5
  };

  try {
    const res = await fetchWithProxyFallback(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(testPayload)
    });

    if (res.ok) {
      return {
        ok: true,
        status: res.status,
        message: 'Provider responded successfully.'
      };
    }

    let detail = '';
    try {
      const errJson = await res.json();
      detail = errJson?.error?.message || errJson?.error || errJson?.message || '';
    } catch {
      // ignore
    }

    let friendlyMsg = `Status ${res.status}: ${res.statusText}`;
    if (res.status === 401) friendlyMsg = '401 Unauthorized: Invalid or missing API key.';
    if (res.status === 403) friendlyMsg = '403 Forbidden: Access denied by provider.';
    if (res.status === 404) friendlyMsg = `404 Not Found: Endpoint does not exist at ${endpoint}`;
    if (res.status === 429) friendlyMsg = '429 Rate Limit Exceeded or quota exhausted.';

    if (detail) {
      friendlyMsg += ` (${detail})`;
    }

    return {
      ok: false,
      status: res.status,
      message: friendlyMsg
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message: `Connection failed: ${err.message}`
    };
  }
}
