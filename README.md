# Claude Usage Monitor

A lightweight always-on-top desktop widget for Windows that shows your Claude Max plan usage limits in real time.

![Claude Usage Monitor screenshot](assets/icon.png)

## Features

- **Live usage gauges** — Session (5h) and Weekly (7d) rate limit bars with colour coding (green → yellow → orange → red)
- **Reset countdown** — shows exactly when each limit resets
- **Always on top** — floats over other windows so you can glance at it without switching focus
- **Transparent / draggable** — sits anywhere on screen, blends into your desktop
- **Light & dark mode** — toggle between dark (default) and light themes
- **Adjustable transparency** — slider from 10 % to 95 % opacity
- **Run on startup** — optional auto-launch when Windows starts
- **System tray** — minimises to tray, click the tray icon to show/hide

## Requirements

- Windows 10 or 11
- [Claude Code CLI](https://claude.ai/code) installed and logged in (`claude /login`)

The app reuses the OAuth credentials stored by the Claude CLI at `~/.claude/.credentials.json`. No separate login is needed.

## Installation

Download and run `Claude Usage Monitor Setup 1.0.0.exe` from the `dist/` folder (or the latest release).

The installer is a one-click NSIS installer — no admin rights required for a per-user install.

## Building from source

```bash
# Install dependencies
npm install

# Run in development (no installer)
npm start

# Build Windows installer
npm run build:win
```

Requires Node.js 18+ and npm.

## How it works

When the widget refreshes, it makes a minimal API call (1-token message to `claude-haiku`) using your existing CLI credentials and reads the rate-limit headers returned by the Anthropic API:

| Header | What it tracks |
|--------|----------------|
| `anthropic-ratelimit-unified-5h-*` | Session (5-hour) window |
| `anthropic-ratelimit-unified-7d-*` | Weekly (7-day) window |

Limits refresh every **5 minutes**. The status dot in the title bar pulses yellow while loading and turns red on error.

## Settings

Click the gear icon (bottom-right) to open the settings panel:

| Setting | Description |
|---------|-------------|
| Transparency | Controls window opacity (10–95%) |
| Light mode | Switches between dark and light colour scheme |
| Run on startup | Launches the widget automatically when Windows starts |

All settings are saved to `%APPDATA%\Claude Usage Monitor\settings.json`.

## Tray menu

Right-click the system tray icon for:

- **Show / Hide** — toggle the widget
- **Refresh** — force an immediate data refresh
- **Quit** — exit the app

## Project structure

```
main.js        Electron main process — window, tray, IPC, API calls
preload.js     Context bridge — exposes safe API to renderer
renderer.js    UI logic — rendering, settings, theme, opacity
index.html     HTML structure and all CSS styles
assets/        App icons
```
