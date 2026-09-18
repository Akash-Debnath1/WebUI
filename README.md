# ✦ Localhost AI Chat Web UI

<div align="center">

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript_ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Zero Dependencies](https://img.shields.io/badge/Zero_Dependencies-100%25_Vanilla-emerald?style=for-the-badge)
![Privacy](https://img.shields.io/badge/Privacy-100%25_Local-blue?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-purple?style=for-the-badge)

**A high-performance, private, ChatGPT-style AI interface built entirely with pure Vanilla HTML5, CSS3, and JavaScript.**

*Zero frontend frameworks. Zero build steps. Zero npm packages. Just run and chat.*

[Features](#-key-features) • [Quick Start](#-quick-start) • [Supported Providers](#-supported-ai-providers) • [Architecture](#-project-structure) • [Privacy](#-privacy--security)

</div>

---

## ⚡ Overview

**Localhost AI** is a lightweight, self-hosted web interface designed for chatting with any **OpenAI-compatible LLM provider** (OpenAI, DeepSeek, TokenHarbor, Groq, Ollama, OpenRouter, LM Studio, or custom gateways).

It runs directly in your browser, streams responses token-by-token in real time, and stores all conversation history and API keys securely in your browser's `localStorage`.

```text
┌────────────────────────────────────────────────────────────────────────┐
│  ✦ Localhost AI   │  [ DeepSeek ▾ (deepseek-chat) ]                    │
├───────────────────┼────────────────────────────────────────────────────┤
│  + New Chat       │                                                    │
│  🔍 Search chats  │  👤 You: Explain quantum computing in 3 bullets.   │
│                   │                                                    │
│  📅 Today         │  ✦ AI:                                             │
│  • Quantum Basics │  1. Superposition: Qubits exist in multiple states.│
│  • Python Scraper │  2. Entanglement: Qubits remain linked at distance.│
│                   │  3. Speedup: Solves complex algorithms instantly.  │
│  📅 Yesterday     │                                                    │
│  • REST API Guide │  ┌──────────────────────────────────────────────┐  │
│                   │  │ Ask anything... (Enter to send)           ➤ │  │
│  ⚙ Settings       │  └──────────────────────────────────────────────┘  │
└───────────────────┴────────────────────────────────────────────────────┘
```

---

## ✨ Key Features

- **🚀 100% Pure Vanilla Web Stack**: Built purely with vanilla HTML5, modern CSS3 custom properties, and native ES modules. No React, no Vue, no Tailwind, no Vite, and no Node server required.
- **⚡ Real-Time SSE Token Streaming**: Ultra-fast streaming via native `ReadableStream` and chunk buffer decoding.
- **🔌 Multi-Provider Management**: Add and manage multiple AI endpoints simultaneously (e.g. OpenAI, DeepSeek, TokenHarbor, Groq, Ollama).
- **🔀 Dynamic Model Switching**: Switch models and providers on the fly directly from the header dropdown. Chats automatically remember their assigned model.
- **🛡️ Built-In CORS Bypass Proxy**: Includes an automated zero-dependency local proxy in `server.py` so you can connect to any API without browser CORS blocking.
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

### Option 2: Python (Standard Library)

```bash
# Clone or download the repository
git clone https://github.com/yourusername/agentWebUI.git
cd agentWebUI

# Launch the static server with built-in CORS proxy
python server.py 8000
```
Open **`http://localhost:8000`** in your browser.

---

### Option 3: Any Static Server

You can also serve the files with any HTTP server:

```bash
# Using Node / npx
npx serve -l 8000

# Using Python default server
python -m http.server 8000
```

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

---

## 📂 Project Structure

```text
agentWebUI/
├── index.html          # SPA markup shell (Chat, Settings, Modals, Toasts)
├── style.css           # Pure CSS3 styles, theme variables, glassmorphic UI
├── server.py           # Zero-dependency Python server + automatic CORS proxy
├── start.bat           # 1-click Windows batch launcher
├── run.bat             # Launcher shortcut alias
├── README.md           # Project documentation
└── js/
    ├── api.js          # API client with SSE streaming & proxy fallback
    ├── app.js          # Main app bootstrap, routing, and lifecycle
    ├── chat.js         # Chat engine, system prompt injector, message state
    ├── markdown.js     # Safe XSS-proof markdown parser & code block builder
    ├── providers.js    # Provider state resolver & model dropdown manager
    ├── settings.js     # Settings controller, preset chips, storage managers
    ├── storage.js      # localStorage CRUD wrapper for chats & providers
    └── utils.js        # Helper utilities, ID generators, formatting
```

---

## 🔒 Privacy & Security

- **100% Client-Side Storage**: Your API keys, configured endpoints, and chat messages never leave your machine and are stored strictly in your browser's `localStorage`.
- **Zero Third-Party Trackers**: No analytics, no Google Fonts, no external CDN tracking scripts, and no telemetry.
- **XSS-Protected Markdown**: Raw user and AI HTML tags are sanitized and escaped prior to Markdown token rendering.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Enter` | Send message |
| `Shift + Enter` | Insert newline in prompt box |
| `Esc` | Close open dropdowns or modal dialogs |

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for more information.

<div align="center">
  <sub>Built with ✦ for privacy, local AI, and clean engineering.</sub>
</div>
