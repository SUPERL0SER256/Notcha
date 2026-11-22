<p align="center">
  <img src="src/assets/logo.png" alt="Notcha" height="44" />
</p>

<h1 align="center">Notcha</h1>

<p align="center">
  <b>A sleek, Dynamic-Island-style notch for Windows with built-in AI chat and screenshot vision.</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Windows-10%20%7C%2011-111?style=flat-square" alt="Windows 10 and 11" />
  <img src="https://img.shields.io/badge/Tauri%202-React%2019%20%7C%20Rust-111?style=flat-square" alt="Tauri 2, React 19, Rust" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-111?style=flat-square" alt="GPL-3.0" /></a>
</p>

**Notcha** sits unobtrusively at the top of your Windows screen and expands smoothly on hover, click, or **Ctrl + Alt + Space**. Navigate effortlessly between panels with **Left / Right arrow keys** (`←` / `→`) or number keys (`1–9`).

Built with **Tauri 2, Rust, React 19, TypeScript, Motion, and Tailwind 4**, it runs natively via WebView2 with a minimal footprint and keeps all your data local on your PC.

---

## Features

### Windows & System
- **Overview** — Quick control center with live clock, weather, what is playing right now, Windows Focus toggle, and master volume slider.
- **Now Playing** — Controls any Windows media session (Spotify, browsers, etc.) with album artwork, progress bar, a live audio-driven equalizer, and a per-app volume mixer.
- **Clipboard** — In-memory clipboard history for text, links, images, and files with previews and filters. Password managers are excluded and nothing is written to disk.
- **Hardware & Gaming Mode** — Live CPU, RAM, GPU, VRAM, and ping stats, plus an optional closed-notch FPS overlay for DirectX, OpenGL, and Vulkan games.
- **Privacy Dots** — iPhone-style indicator dots: green when the mic or camera is active, red when the screen is being recorded.

### AI & Productivity
- **Snap (Screenshot + AI Vision)** — Capture a **Region** (via Windows Snipping Tool), **Full Screen** (native GDI), or grab an image from your **Clipboard** (`Ctrl + V`). Use 1-click AI actions (**Explain**, **Extract text**, **Solve**) or ask follow-up questions about the screenshot, plus copy or save directly to `Pictures\NotchaSnap`.
- **Ask (AI Chat)** — Fast streaming AI chat right in your notch, with quick clipboard actions (**Summarize**, **Rewrite**, **Translate**) and zero-config provider setup.
- **Converter** — Drag-and-drop or `Ctrl + V` file converter for images (`PNG`, `JPG`, `WebP`, `ICO`, `BMP`, `DDS`), documents (`PDF`, `DOCX`, `TXT`, `Markdown`, `HTML`), spreadsheets (`XLSX`, `CSV`, `JSON`), audio/video (with `ffmpeg`), plus an instant unit converter.
- **Notes** — Local, auto-saving scratchpad.
- **Weather** — Current conditions and 7-day forecast via Open-Meteo (no API key needed).
- **Vibe** — Six handcrafted, non-audio-reactive living worlds (**City Lights**, **Golden Valley**, **Night Train**, **Deep Trench**, **Crimson Torii**, **Misty Jungle**) with subtle cursor parallax and 0% CPU when closed.
- **Persona** — Personal aesthetic card with a wide photo/animated GIF frame (stored on disk in AppData for near-zero idle RAM) and inline-editable name and quote.

---

## Controls

| Action | How |
| --- | --- |
| Open or close | Hover, click, or **Ctrl + Alt + Space** |
| Quick screenshot (Snap) | **Ctrl + Alt + S** (customizable in **Settings → General**) |
| Switch panels | `←` / `→` arrow keys, `1–9` keys, or the bottom dock |
| Switch panels while typing | `Alt + ←` / `Alt + →` |
| Move the notch | Drag it sideways while closed or by its header |
| Focus mode | Triple-click the notch to fade it out and pass clicks through (triple-click again to restore) |
| Tray menu | Left-click opens the notch; right-click opens Settings, Focus mode, Autostart, and Quit |

---

## AI Setup (Ask & Snap)

Open **Settings → AI**, choose your active provider, and paste your API key — no base URLs or manual model IDs required:

- **Gemini Flash / Gemini Pro** — click **Get free key** ([Google AI Studio](https://aistudio.google.com/apikey))
- **OpenAI (GPT-4o)** — click **Get key** ([OpenAI Platform](https://platform.openai.com/api-keys))
- **Claude** — click **Get key** ([Anthropic Console](https://console.anthropic.com/settings/keys))

All API keys are stored securely in the **Windows Credential Manager** and never leave the Rust backend except when sent directly to your chosen AI provider.

---

## Development

Requires **Node 22+**, **Rust (stable)**, and the **Visual Studio Build Tools** (C++ workload + Windows 11 SDK).

```powershell
npm install
npm run tauri dev     # run the native Windows app in dev mode
npm run dev           # browser preview with a mock desktop
npm run typecheck     # TypeScript check
npm run i18n          # check translations
```

Build a standalone executable (`src-tauri/target/release/notch.exe`):

```powershell
npx tauri build --no-bundle
```

---

## License

Licensed under [GPL-3.0](LICENSE). Based on [L4-Windows-NotchBar](https://github.com/Linux5Real/L4-Windows-NotchBar).
