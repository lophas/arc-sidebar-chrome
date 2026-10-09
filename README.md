# Arc Sidebar for Chrome

## Mission

Bring Arc Browser’s organized, sidebar-first browsing experience to Google Chrome. Keep everyday sites close, arrange your work into Spaces and folders, and open only the tabs you need. Keep watching YouTube in a floating mini player while you browse.

Saved links stay in the sidebar when their browser tabs close. Click a saved item to open it or return to its existing tab, even after navigating away from the saved URL.

> **Disclaimer:** Arc Sidebar for Chrome is an independent extension developed entirely from scratch. It is not affiliated with, endorsed by or sponsored by The Browser Company or Arc Browser.

## Main features

- **Automatic Picture-in-Picture (PiP)** — a playing YouTube video follows you into a floating mini player when you switch tabs and returns to its page when you switch back. Enabled by default.
- **Spaces and folders** — organize projects and activities with their own pinned links, folders and additional open tabs.
- **Global Favorites** — keep everyday sites accessible from every Space. Drag links between Favorites, Spaces and folders, preserving their icons and open tabs.
- **Persistent pinned links** — save pages without keeping their tabs open; return to the same live tab when you need it, including after Chrome restarts.
- **Search popup** — press **⌘K / Ctrl+K** to find recent tabs, Favorites, pinned links, folders and Spaces, open a URL or search Google.
- **Drag-and-drop organization** — reorder links, Favorites, folders and Spaces. Drag an open tab into the pinned list to save it; hold a dragged item near the list’s edge to scroll.
- **Coherent Chrome groups** — groups follow the sidebar’s order. Focus changes expand the active group and collapse the others; you can adjust groups manually between focus changes.
- **Open tabs and bulk close** — browse tabs by Chrome group, see additional tabs within each Space, and close a link, folder, group, Space or an entire window’s tabs.
- **Flexible sidebar** — switch between an autohide overlay and Chrome’s fixed side panel directly from the sidebar. Adjust the delay, width and Favorite size; each view remembers its scroll position.
- **Custom icons** — use website favicons or uploaded images for saved links, and choose images or searchable emojis for Spaces.
- **Seamless Arc Browser migration** — import all your Spaces, Favorites, pinned links and folders in one step, with Space emojis and website icons.
- **Chrome Sync and backups** — synchronize your organization across computers and save or restore your sidebar, folder layout and preferences.
- **Pin from any webpage** — add the current page or a link to Favorites or any Space through Chrome’s right-click menu.

## Screenshots

| Sidebar | Sidebar search |
| --- | --- |
| <img src="docs/screenshots/sidebar.png" width="360" alt="Sidebar with global Favorites, folders, pinned links, Space open tabs and the Space switcher"> | <img src="docs/screenshots/sidebar-search.png" width="360" alt="Sidebar search showing open tabs, saved links and Google search results"> |

![Search popup with recent tabs, favicons and keyboard navigation](docs/screenshots/search-popup.png)

## Documentation

### Installation and updates

1. Download the extension ZIP from [GitHub Releases](https://github.com/lophas/arc-sidebar-chrome/releases).
2. Extract it to a permanent folder.
3. Open `chrome://extensions` and enable **Developer mode**.
4. Click **Load unpacked** and select the folder containing `manifest.json`.
5. Pin the extension’s toolbar button for quick access.

To update, replace the files in the existing installation folder and click **Reload** on the extension’s card. Reload already-open webpages, including YouTube, to apply the updated extension. Your saved organization remains available.

For the latest changes on `main`, use **Code → Download ZIP** on the repository and load the extracted folder containing `manifest.json` in the same way.

### Getting started

Start with **🚀 My Space** and an empty Favorites collection. Open the sidebar with the extension’s toolbar button or move the pointer to the page edge in Autohide mode.

- Add a pinned link with **+** beside the Space’s heading, or use the folder button to add a folder.
- Add a Favorite with **+** beside search. All link destination selectors list **Favorites** first, followed by your Spaces.
- Right-click a webpage or link and choose **Pin to Arc Sidebar** to save it directly. Pinning the current page connects its existing tab to the saved item.
- Add or select Spaces using the switcher at the bottom.
- Open **Extension options** from the sidebar footer to adjust preferences, import Arc Browser data or restore a backup.

Search and Favorites stay at the top, the Space switcher stays at the bottom, and the current Space’s contents scroll in the middle.

### Automatic Picture-in-Picture (PiP)

The YouTube mini player is **on by default**. When a video is playing with sound, switching to another tab opens it in a floating Picture-in-Picture window. Returning to the YouTube tab puts the video back in its page without restarting playback. Paused videos stay in the page. A Picture-in-Picture window you open manually stays open when you return.

Use **Extension options → Automatic YouTube mini player** to turn the feature on or off. Changes apply to already-open YouTube tabs, and the preference is included in backups.

If Chrome asks for permission, allow **Automatic picture-in-picture** for YouTube through the site controls next to the address bar. If Auto PiP is disabled in your Chrome build, enable **Auto picture in picture for video playback** at `chrome://flags/#auto-picture-in-picture-for-video-playback` and restart Chrome.

### Spaces and folders

Each Space contains pinned links, folders and additional open tabs belonging to its Chrome groups. Select a Space from the bottom switcher, drag Spaces to reorder them, or right-click one to edit its name and icon.

Click a folder heading to expand or collapse it. Right-click it to rename it or move the complete folder to another Space. Drag folders to reorder them within their Space. Removing a folder keeps its links.

Right-click a Space and choose **Close open tabs** to close every tab in all Chrome groups associated with it, including additional non-pinned tabs and tabs in other windows. The menu shows how many tabs will close. Saved links and folders remain available.

The last Space cannot be deleted manually. Reset recreates the starting layout; import and restore replace the sidebar with the loaded contents.

### Favorites and pinned links

Favorites are shared across all Spaces. Pinned links belong to a Space or one of its folders. Both remain saved when their browser tabs close.

Click a saved link to open it or focus its existing tab. Right-click to edit its title, URL, icon or destination. Closing its live tab keeps the saved link; opening it again uses the saved URL.

Drag links to place them before or after other links, inside a folder, between folders or at the Space’s root. Drop a link on another Space to move it there.

Drag Favorites to change their order. Move pinned links into Favorites, or drag Favorites back between a Space’s pinned links and folders or into a folder. Their custom icons and live tabs follow the move. Drop onto **+ Favorite** when the Favorites collection is empty.

New tabs opened from a Favorite go into the currently selected Space’s Chrome group.

### Search

Press **Command+K** on macOS or **Ctrl+K** on Windows/Linux to open the search popup, including when the sidebar is closed. The sidebar’s **Search or enter URL** control opens the same search inside the sidebar.

With an empty query, search shows recently accessed open tabs. Type to find open tabs across Chrome windows, Favorites, pinned links, folders and Spaces. Results show favicons, match all entered words and ignore differences in accents. Open-tab results include webpages and file URLs.

Enter a URL to open it, or choose a Google search. Use **↑ / ↓** to select a result, **Enter** to open it and **Escape** to dismiss search. Change the shortcut at `chrome://extensions/shortcuts`.

Choosing a pinned link or its bound open tab selects its Space and expands its parent folders. Folder and Space results take you to the selected location; choosing one from the standalone popup opens the fixed sidebar.

### Open tabs and close controls

**Inside a Space**, additional tabs from its Chrome groups appear below the pinned links. Click to activate one; tabs in another window are marked **Other window**. Drag a tab between pinned links, into a folder or into an empty Space to save it, keeping the same live browser tab. Its right-click menu also offers pinning.

**The Open tabs view** shows all tabs in the current Chrome window, organized by Chrome group in tab-bar order, with ungrouped tabs listed together. Right-click the **Open tabs** Space to close all tabs in the window after confirmation.

Chrome’s own pinned tabs appear first in a blue, read-only section with a **Pinned tab** tooltip. They have no sidebar actions or live indicators and are excluded from sidebar close operations.

A **filled red dot** marks a loaded open tab; an **outlined red dot** marks a tab unloaded from memory by Chrome. Folder and group dots are outlined when all their open tabs are unloaded. Favorite dots sit discreetly in the button’s bottom-right corner. Hover over a dot to reveal **×** and **Close**; click it to close the associated tab or tabs while keeping saved links.

When a close action would leave a window empty, the extension opens a default new tab to keep the window available. The next sidebar opening reuses that temporary tab, or removes it when activating an existing tab in the same window. If you navigate away from the temporary tab, it stays as a regular tab.

### Chrome tab groups

Favorites use a **Favorites** group. Each Space uses its own group in every window where its tabs are open. Groups follow the sidebar’s order: **Favorites first**, then Spaces. Reordering Spaces updates the groups, and pinned tabs follow the sidebar’s folder and link order within each group.

When tab or window focus changes, the active tab’s managed group expands and the other managed groups in that window collapse. If the active tab is outside those groups, they all collapse. Between focus changes, you can freely expand or collapse groups yourself.

Additional tabs opened during your work remain part of the Space and appear below its pinned links in the sidebar.

### Sidebar modes and appearance

Use the icon to the left of search to switch between **Autohide** and **Fixed**. The current tab applies the change immediately; other open tabs apply it when you next focus them.

- **Autohide**, the default, floats over the page when the pointer reaches the sidebar edge and closes after the pointer leaves. It stays open while you edit an item. Drag its resize handle to adjust the width.
- **Fixed** opens Chrome’s native side panel alongside the page through the extension’s toolbar button. On Chrome settings or browser error pages, use that toolbar button to open the fixed sidebar.

Both modes follow **Chrome Settings → Appearance → Side panel position**. Each open tab picks up a position change when you next focus it. Each Space and the Open tabs view remember their own scroll position.

Open **Extension options** to adjust:

| Preference | Choices | Default |
| --- | --- | --- |
| Automatic YouTube mini player | On or off | On |
| Autohide timeout | 500–1100 ms in 100 ms steps | 800 ms |
| Favorite button size | 80%, 90%, 100%, 110%, 120% | 100% |

In a Favorite or pinned link editor, choose **Use favicon** for the website’s icon or upload an **SVG, PNG, WebP or JPEG** by clicking the upload area or dropping a file onto it. Save to apply the choice.

Spaces support uploaded images, pasted emojis and a searchable emoji picker. Search by name, keyword, country name/code for flags, or aliases such as `:)`, `:D` and `<3`. Custom icons are included in backups and Chrome Sync.

### Import from Arc Browser

Seamlessly migrate all your Spaces, Favorites, pinned links and folders from Arc Browser, with Space emojis and website favicons. Open **Extension options → Arc import** and select `StorableSidebar.json`.

**Import replaces all current sidebar contents, including My Space.** Download a backup first if you want to keep the existing organization.

**macOS**

```text
~/Library/Application Support/Arc/StorableSidebar.json
```

In Finder or the file picker, press **⌘ Shift G**, enter `~/Library/Application Support/Arc/` and select the file.

**Windows**

```text
%LOCALAPPDATA%\Packages\TheBrowserCompany.Arc_*\LocalCache\Local\Arc\StorableSidebar.json
```

Enter `%LOCALAPPDATA%\Packages` in File Explorer’s address bar. Open the folder beginning with `TheBrowserCompany.Arc_`, then **LocalCache → Local → Arc**, and select the file. The import panel provides buttons to copy these folder paths.

### Chrome Sync

Enable **Chrome Sync** in Extension options to synchronize Spaces, Favorites, folders, pinned links, their order and custom icons across computers signed into the same Chrome Sync account.

Open tabs, the selected Space, folder expansion, scroll positions and sidebar preferences stay local to each computer. When different computers change the organization, the most recently updated sidebar becomes the synchronized version.

### Backup, restore and reset

Use **Extension options → Backup & restore** to download or restore a portable JSON backup.

- **Download backup** saves Spaces, Favorites, folders, pinned links, custom icons, folder expanded/collapsed states, sidebar mode, autohide timeout, Favorite size, sidebar width and the automatic mini player preference.
- **Restore backup** replaces the sidebar contents and restores the saved folder layout and preferences. Older backups preserve current preferences they do not contain.
- **Reset all extension data** clears saved organization and settings, including synchronized data, then recreates Favorites and **🚀 My Space**. Your Chrome tabs stay open.

Download a backup before importing, restoring or resetting if you want to preserve the current setup.

## License

See [LICENSE](LICENSE).
