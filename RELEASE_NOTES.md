## Arc Sidebar for Chrome 3.0

### Automatic Picture-in-Picture

Keep watching YouTube while you browse. A video playing with sound opens in a floating mini player when you switch tabs and returns to its page when you switch back, without restarting playback.

- Enabled by default; switch it on or off in **Extension options → Automatic YouTube mini player**.
- Picture-in-Picture windows opened manually stay open when you return to the video tab.
- The preference is included in backups.
- If Chrome asks, allow **Automatic picture-in-picture** for YouTube through the site controls next to the address bar.

### Also in this release

- **Sidebar mode switch:** change between Autohide and Fixed using the icon beside search. The current tab updates immediately; other tabs update when next focused. Autohide remains the default, with its timeout set separately in options.
- **Keep your window open:** closing the last tabs opens a temporary default tab. The next sidebar opening reuses it, or removes it when returning to an existing tab in the same window. Once you navigate away from it, it stays as a regular tab.
- **Link icons:** choose **Use favicon** or upload an image when adding or editing Favorites and pinned links. Custom icons remain attached when moving links between Favorites and Spaces.
- **Complete preferences in backups:** restore the sidebar mode and automatic mini player preference alongside the timeout, Favorite size, width and folder layout.
- **Arc Browser import guidance:** find `StorableSidebar.json` with platform-specific paths and copy buttons in options.
- **Unified documentation:** a reorganized README covers setup, organization, search, PiP, appearance, migration and backups in one consistent guide.

All existing Spaces, Favorites, folders, persistent pinned links, search, Chrome group organization, drag-and-drop, Arc Browser import and Chrome Sync features are included.

### Install or update

Download `arc-sidebar-chrome-v3.0.0.zip`, extract it and open **chrome://extensions → Developer mode → Load unpacked**. Select the folder containing `manifest.json`.

For an existing installation, replace the files in its current folder and click **Reload**. Reload already-open webpages, including YouTube, to apply the updated extension. Your saved sidebar organization is retained.
