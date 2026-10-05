# Arc Sidebar for Chrome

A lightweight Chrome extension that reproduces the parts of Arc's sidebar workflow that matter most: **Spaces, folders, persistent pinned tabs, and open tabs** — without keeping hundreds of pages open in memory.

## Goals

- Arc-like Spaces
- One-level folders inside each Space
- Persistent pinned entries that do **not** need to stay open as Chrome tabs
- Click a pinned entry to focus its existing tab or open it
- Separate list of currently open Chrome tabs
- Import from Arc `StorableSidebar.json`
- Local-first storage
- Low memory footprint

## Non-goals

Boosts, Split View, Notes/Easel, AI, full Archive migration, and cross-device sync are intentionally out of scope for the first version.

## v0.1 scope

The first usable version imports Arc's sidebar JSON and renders Spaces, folders and pinned tabs in Chrome's Side Panel. Pinned entries are persistent data; they are not forced to remain open Chrome tabs.

## Install for development

1. Clone or download this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the repository folder.
5. Pin the extension, then open its side panel.
6. Import your Arc `StorableSidebar.json` from the sidebar.

## Architecture

Manifest V3 extension using Chrome Side Panel, Tabs and Storage APIs. The persistent sidebar model is deliberately independent from Chrome's live tab model, so hundreds of saved/pinned items can exist without hundreds of renderer processes.
