# ✦ Localhost AI Chat Web UI

<div align="center">

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript_ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Zero Dependencies](https://img.shields.io/badge/Zero_Dependencies-100%25_Vanilla-emerald?style=for-the-badge)
![Privacy](https://img.shields.io/badge/Privacy-100%25_Local-blue?style=for-the-badge)
![Cross Platform](https://img.shields.io/badge/Platform-Windows_%7C_Linux_%7C_Android-orange?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-purple?style=for-the-badge)

**A high-performance, private, ChatGPT-style AI interface built entirely with pure Vanilla HTML5, CSS3, and JavaScript.**

*Zero frontend frameworks. Zero build steps. Zero npm packages. Just run and chat — on Windows, Linux, or your Android phone.*

[Features](#-key-features) • [Quick Start](#-quick-start) • [Android](#-running-on-android) • [Web Search](#-live-web-search-auto-detect) • [Attachments](#-file-folder--screenshot-attachments) • [Architecture](#-project-structure) • [Privacy](#-privacy--security)

</div>

---

## ⚡ Overview

**Localhost AI** is a lightweight, self-hosted web interface designed for chatting with any **OpenAI-compatible LLM provider** (OpenAI, DeepSeek, Groq, Ollama, OpenRouter, LM Studio, or custom gateways).

It runs directly in your browser, streams responses token-by-token in real time, and stores all conversation history, attachments, and API keys securely in your browser's `localStorage`. It also supports **live web search** (just paste a search engine's URL — no API setup required for most engines) and lets you **attach files, folders, and screenshots** directly into the conversation.

```text
┌────────────────────────────────────────────────────────────────────────┐
│  ✦ Localhost AI   │  [ DeepSeek ▾ (deepseek-chat) ]                    │
├───────────────────┼────────────────────────────────────────────────────┤
│  + New Chat       │                                                    │
│  🔍 Search chats  │  👤 You: 📎 report.pdf  Summarize this report      │
│                   │       and check today's exchange rate.             │
│  📅 Today         │                                                    │
│  • Quantum Basics │  ✦ AI: Based on the report...                      │
│  • Python Scraper │       🌐 Web sources: [xe.com] [reuters.com]       │
│                   │                                                    │
│  📅 Yesterday     │  ┌──────────────────────────────────────────────┐  │
│  • REST API Guide │  │ 📎  🌐 Web  Ask anything...               ➤ │  │
│                   │  └──────────────────────────────────────────────┘  │
└───────────────────┴────────────────────────────────────────────────────┘
```

---

## ✨ Key Features

- **🚀 100% Pure Vanilla Web Stack**: Built purely with vanilla HTML5, modern CSS3 custom properties, and native ES modules. No React, no Vue, no Tailwind, no Vite, and no Node server required.

- **⚡ Real-Time SSE Token Streaming**: Ultra-fast streaming via native `ReadableStream` and chunk buffer decoding.

- **🔌 Multi-Provider Management**: Add and manage multiple AI endpoints simultaneously (e.g. OpenAI, DeepSeek, Groq, Ollama).

- **🔀 Dynamic Model Switching**: Switch models and providers on the fly directly from the header dropdown. Chats automatically remember their assigned model.

- **🛡️ Built-In CORS Bypass Proxy**: Includes an automated zero-dependency local proxy in `server.py` so you can connect to any API without browser CORS blocking — also used to power file-less web search.

- **📎 File, Folder & Screenshot Attachments**: Attach documents, code files, whole folders, or paste a screenshot straight from your clipboard (Ctrl+V). Images are sent to vision-capable models; text/code files are inlined into the prompt.

- **🌐 Live Web Search — Just Paste a URL**: Drop in any search engine's homepage URL (DuckDuckGo, Bing, Brave, Google, Wikipedia, a self-hosted SearXNG, or almost anything else) and the app automatically detects the correct query format and result parser. No API key required for most engines. Toggle it on/off per message with the 🌐 **Web** button.

- **📱 Android Support**: Runs natively on your phone via Termux — install it to your home screen as a installable web app (PWA) with offline shell caching, a mobile-friendly attach menu (gallery/camera), and touch-optimized UI.

- **🧠 Custom System Instructions**: Set global or persona-based system prompts (with one-click presets for Senior Coder, Concise, Tutor, etc.) that are automatically prepended to every conversation.

- **🎨 Modern Dark & Light Themes**: Inspired by modern ChatGPT aesthetics with obsidian glassmorphic headers, emerald glowing accents, and smooth animations.

- **📝 Safe Markdown & Syntax Highlighting**: Headings, lists, blockquotes, tables, and fenced code blocks with language labels and one-click copy buttons.

- **💾 Complete Storage & Backup**: Search conversation history, edit messages, regenerate responses, and export/import full JSON backups.

---

## 🚀 Quick Start

### Option 1: Windows 1-Click Launcher (Recommended)

Simply double-click [`start.bat`](start.bat) in the project directory.

It will start the server, display the link, and automatically open your default browser to:
👉 **`http://localhost:8000`**

---

### Option 2: Linux / macOS

```bash
chmod +x start.sh
./start.sh
```

This launches `server.py` and opens your default browser automatically (via `xdg-open`, `gnome-open`, or `open`).

---

### Option 3: Android (Termux)

See the full [Android guide](#-running-on-android) below — it takes about 5 minutes and lets you install this as a home-screen app.

---

### Option 4: Manual (Python / any static server)

```bash
# Clone or download the repository
git clone https://github.com/AIwolfie/WebUI.git
cd WebUI

# Launch the static server with built-in CORS proxy
python server.py 8000
```

Open **`http://localhost:8000`** in your browser.

You can also serve the files with any HTTP server (`npx serve -l 8000`, `python -m http.server 8000`, etc.), but **file attachments work everywhere while live web search and the CORS proxy require `server.py`** — plain static servers don't have `/api/proxy`.

---

## 🔌 Supported AI Providers

Localhost AI works with any provider that supports the standard OpenAI `/v1/chat/completions` API format:

| Provider | Default Base URL | Example Models |
| :--- | :--- | :--- |
| **OpenAI** | `https://api.openai.com/v1` | `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo` |
| **DeepSeek** | `https://api.deepseek.com/v1` | `deepseek-chat`, `deepseek-reasoner` |
| **TokenHarbor** | `https://tokenharbor.ai/v1` | `deepseek-v4.1-flash:free` |
| **Groq** | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile`, `llama-3.1-8b-instant` |
| **Ollama (Local)** | `http://localhost:11434/v1` | `llama3`, `mistral`, `qwen2.5`, `phi3` |
| **OpenRouter** | `https://openrouter.ai/api/v1` | `anthropic/claude-3.5-sonnet`, `meta-llama/llama-3.3-70b` |
| **LM Studio (Local)** | `http://localhost:1234/v1` | `local-model` |
| **Custom Gateways** | `https://your-custom-proxy.com/v1` | Any model supported by your endpoint |

Vision/image attachments require a multimodal model (e.g. `gpt-4o`, `claude-3.5-sonnet`, `gemini-*`). Plain text models will error if an image is sent.

---

## 📎 File, Folder & Screenshot Attachments

Click the **📎 attach button** next to the chat input to:

- **Attach files or photos** — documents, code, images, CSV/JSON, etc.
- **Take a screenshot** (Android) — opens the camera directly.
- **Attach a whole folder** (Desktop) — right-click the 📎 button, or pick "Folder" from the mobile menu where supported.
- **Paste a screenshot** — just `Ctrl+V` anywhere in the chat input while an image is on your clipboard.

| File type | What happens |
| :--- | :--- |
| Images (png/jpg/webp/gif/svg) | Sent as base64 to the model in vision format (requires a vision-capable model) |
| Text / code files (.js, .py, .md, .json, .csv, .html, etc.) | Content is read and appended to your message as context |
| Other binary files | Filename is shared with the model; content is not read |

Attachments are capped at **8MB per file** to keep things snappy in `localStorage`. Everything stays on your device — nothing is uploaded anywhere except directly to the AI provider you configured.

---

## 🌐 Live Web Search (Auto-Detect)

Go to **Settings → Web Search**, paste in any search engine's URL, and the app figures out the rest:

1. It checks if the URL belongs to a **known engine** (DuckDuckGo, Bing, Brave, Google, Wikipedia) and wires up the correct query format automatically.
2. If it's an unfamiliar site, it **probes** the page — reading its OpenSearch descriptor, its search `<form>`, or trying common patterns like `/search?q=`, `/?s=`.
3. It figures out whether responses come back as **JSON or HTML** and extracts titles, links, and snippets accordingly.
4. Once detected, the configuration is **cached** so future searches are instant.
