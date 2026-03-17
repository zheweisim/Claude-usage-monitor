# Claude Usage Monitor

A lightweight macOS menu bar widget that shows your Claude Max usage limits and token stats in real time.

![Claude Usage Monitor](assets/icon.png)

## Features

- **Live usage gauges** — Session (5h) and Weekly (7d) rate limit bars with reset timers
- **Equivalent API cost** — see how much your usage would cost at API rates
- **All-time stats** — total messages, sessions, tokens, and cache reads
- **Model breakdown** — usage and cost per Claude model
- **Daily activity chart** — 14-day message history
- **Per-project breakdown** — cost by project
- **Adjustable transparency** — frosted glass overlay that blends with any desktop
- **Light/dark mode** — toggle to suit your preference
- **Always on top** — stays visible across all Spaces and full-screen apps
- **Run on startup** — optional auto-launch at login

## Requirements

- macOS (Apple Silicon or Intel)
- [Claude Code CLI](https://claude.ai/download) installed and logged in

## Installation

1. Download `Claude Usage Monitor-1.1.0-arm64.dmg`
2. Open the DMG and drag **Claude Usage Monitor** into your Applications folder
3. Launch the app

**First launch:** macOS will block the app because it is not signed through the App Store. To open it:

> System Settings → Privacy & Security → scroll down → **Open Anyway**

Or right-click the app in Finder, choose **Open**, then confirm in the dialog.

## Setup

The app reads credentials from the Claude Code CLI. Before using it:

1. Install Claude Code from https://claude.ai/download
2. Open Terminal and run:
   ```
   claude
   ```
   Follow the login prompts. You only need to do this once.

The widget will pick up your credentials automatically after that.

## Usage

After launching, the app lives in your **menu bar** (top-right of the screen). Click the icon to show or hide the widget.

**Right-click the menu bar icon** for:
- Show / Hide
- Refresh
- Quit

**Inside the widget:**
- The dot in the title bar shows status: green (ok), yellow (loading), red (error)
- **Refresh button** (bottom-left ↺) — manually trigger a refresh
- **Settings button** (bottom-right ⚙) — adjust transparency, switch light/dark mode, toggle run-on-startup

Data auto-refreshes every **5 minutes** (live limits) and every **30 seconds** (local stats).

## Gauge colours

| Colour | Usage |
|--------|-------|
| Green | Under 50% |
| Yellow | 50–75% |
| Orange/Red | 75–95% |
| Red | 95–100% |

## How it works

On each refresh the app makes a minimal 1-token API call using your Claude Code OAuth credentials and reads the rate-limit headers returned by the Anthropic API:

| Header | What it tracks |
|--------|----------------|
| `anthropic-ratelimit-unified-5h-*` | Session (5-hour rolling window) |
| `anthropic-ratelimit-unified-7d-*` | Weekly (7-day rolling window) |

Local stats (token counts, project costs, daily activity) are read directly from Claude Code's local data files — no extra API calls needed.

## Troubleshooting

**"No Claude credentials found"**
Log in with the Claude Code CLI first. Open Terminal and run `claude`, then follow the login flow.

**Usage limits not showing**
Rate limit headers are only returned for Claude Max subscriptions.

**App won't open after install**
macOS blocks unsigned apps by default. Go to System Settings → Privacy & Security → Open Anyway.

## Building from source

```bash
# Install dependencies
npm install

# Run in development
npm start

# Build macOS DMG
npm run build:mac
```

Requires Node.js 18+ and npm.

## Project structure

```
main.js       Electron main process — window, tray, IPC, API calls, credentials
preload.js    Context bridge — exposes safe API to renderer
renderer.js   UI logic — rendering, settings, theme, opacity
index.html    HTML structure and CSS styles
assets/       App icons
```
