# Chrome Web Store Listing — Arc Side of the Chrome

> Last Updated: 2026-11-05

Everything entered in the Chrome Web Store Developer Dashboard for this item, in one
place. Keep it in step with `manifest.json`, `PRIVACY.md` and the store listing. The
release ZIPs never include this file (`scripts/build-release.py` packs `src/` and the
manifest only).

- **Listing:** https://chromewebstore.google.com/detail/arc-side-of-the-chrome/imldpblbhmhblddekjckobcllfcahdbd
- **Item ID:** imldpblbhmhblddekjckobcllfcahdbd
- **Upload:** `arc-side-of-the-chrome-vX.Y.Z-webstore.zip` from the GitHub release (the
  manifest `key` is removed in that package).

## Store Listing

**Extension Name**
Arc Side of the Chrome

**Short Description** (manifest `description`, 123 of 132 characters)
Spaces, tabs & a little harmony. Organize Chrome with a sidebar, Favorites, folders and automatic video Picture-in-Picture.

**Detailed Description** (as live on 2026-11-05)

```text
Spaces, tabs & a little harmony.

Arc Side of the Chrome turns Chrome into a Space-oriented workspace. Keep everyday sites in Favorites, organize projects with pinned links and folders, and move between tasks without losing your place.

YOUR SIDEBAR AND CHROME, WORKING TOGETHER
Spaces stay connected to Chrome’s native tab groups. Group colors and order follow your Spaces, and switching tabs in Chrome selects the matching Space in the sidebar. Additional tabs opened from a Space’s pinned links stay with that project.

SAVE THE ESSENTIALS. CLOSE THE CLUTTER.
Favorites and pinned links remain saved when their tabs close. Reopen a saved link or return to its existing tab, even after navigating away from its original page. Drag links between Favorites, Spaces and folders, or turn an additional open tab into a pinned link.

FREE MEMORY
by automatically unloading idle webpages while keeping their tabs, native groups, sidebar bindings and positions intact.

FIND ANY TAB
Press Option+T on macOS or Alt+T on Windows and Linux to search Favorites, pinned links and open tabs across Chrome windows. With an empty search, press Enter to return to your previously used tab.

LET THE VIDEO FOLLOW YOU
Compatible playing HTML5 videos continue in a floating Picture-in-Picture mini player when you switch tabs, then return to the page when you come back. Automatic PiP is enabled by default; some websites require a per-site browser permission.

MAKE EACH SPACE YOUR OWN
Choose ready-made palettes, a solid color or a two-color gradient. The whole sidebar follows your Space, along with its Chrome group color. Use a fixed side panel or an autohiding sidebar with adjustable edge triggers, delay and Favorite button size.

BRING YOUR ORGANIZATION WITH YOU
Import your Spaces, Favorites, pinned links, folders and icons from Arc Browser. Keep your organization available across computers with optional Chrome Sync, or save and restore portable backups.

Start with My Space, add your everyday links, and give each project a home.

Arc Side of the Chrome is an independent, open-source extension developed from scratch. It is not affiliated with, endorsed by or sponsored by The Browser Company or Arc Browser.
```

**Category**
Functionality & UI

**Single Purpose**
Provide a Space-based tab-management workspace for Chrome. Organize and navigate saved links and open tabs through a sidebar that stays synchronized with native Chrome tab groups. Search, focus handling, configurable automatic idle-tab discard and an optional video mini player help users switch between tabs while keeping their working context.

**Primary Language**
English

## Graphics & Assets

All in `docs/webstore/` unless noted; `docs/webstore/README.md` explains how they are made.
The screenshots were captured from version 4.0.2 (`capture-info.json`).

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon | 128×128 PNG | ✅ Ready | `src/icons/icon128.png` |
| Screenshot 1 | 1280×800 | ✅ Ready | `01-spaces-and-chrome.jpg` |
| Screenshot 2 | 1280×800 | ✅ Ready | `02-search-every-tab.jpg` |
| Screenshot 3 | 1280×800 | ✅ Ready | `03-video-mini-player.jpg` |
| Screenshot 4 | 1280×800 | ✅ Ready | `04-space-palettes.jpg` |
| Screenshot 5 | 1280×800 | 🟡 Predates automatic discard (4.2.0) | `05-sidebar-options.jpg` |
| Small Promo Tile | 440×280 | ✅ Ready | `promo-small-440x280.jpg` |
| Marquee Promo Tile | 1400×560 | ✅ Ready | `promo-marquee-1400x560.jpg` |

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| tabs | permissions | Read open-tab URLs, titles, favicons, status and last-access times to display and search tabs, identify saved links that are already open, and switch to the correct tab and Space. Tab and window information also supports reopening saved links, close controls and returning focus to an opener. |
| scripting | permissions | Inject or refresh the bundled autohide sidebar and video mini player controllers in eligible webpages, including already-open tabs after an extension reload or mode change. Bundled scripts also pass the active-tab state and settings needed to open and restore Picture-in-Picture correctly. No remotely hosted scripts are executed. |
| tabGroups | permissions | Create and manage native Chrome groups associated with Favorites and Spaces. Keep their names, colors and order aligned with the sidebar, place project tabs in the correct group, show additional grouped tabs, close a Space’s open tabs, and expand or collapse managed groups when focus changes. |
| storage | permissions | Store the user’s Spaces, Favorites, folders, saved URLs and titles, custom icons, palettes, preferences and tab-restoration metadata. Session storage keeps temporary tab/group bindings. When the user enables Chrome Sync, synchronize the saved organization through Chrome’s sync storage. Fixed/Autohide mode, timeout, edge-trigger geometry, Favorite button size, sidebar width, automatic discard delay and website exceptions remain local and are included in backups. |
| sidePanel | permissions | Display the persistent native Chrome sidebar containing Favorites, Spaces, pinned links, folders, search and open-tab controls. Users can open it with the toolbar button and switch between Fixed and Autohide modes. The native panel also provides access on browser pages where webpage injection is unavailable. |
| favicon | permissions | Display recognizable website icons beside saved links, Favorites, open tabs and search results, using Chrome’s extension favicon service when an existing favicon URL is unavailable. |
| contextMenus | permissions | Add the “Pin to Arc Side of the Chrome” menu to webpage and link context menus, so users can save the current page or a link to Favorites or a Space. A separate checkbox lets the user keep the current webpage in memory by protecting it from automatic discard. |
| alarms | permissions | Schedule one central wake-up for the next idle-tab deadline, so the background worker can sleep between checks. A delay of 0 clears the alarm; active and protected tabs are excluded. |
| `http://*/*`, `https://*/*` | host_permissions | The autohide sidebar must work on arbitrary HTTP/HTTPS sites selected by the user, so a fixed domain list is insufficient. HTTPS page access also lets bundled scripts detect playing HTML5 videos and manage the mini player when switching tabs. Host access allows the extension to fetch a user-specified link’s page title when no matching open-tab title is available. Idle-tab protection uses bundled local scripts to check editing/playback state and whether camera, microphone or screen-capture tracks are live before unloading a tab. These checks do not record or transmit form values, audio, video or screen contents, and access is not used for analytics or advertising. |

**Remote code:** No, I am not using remote code. All executable code is bundled; fetched page titles and website images are data.

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** Yes — handled locally for visible features (the store counts local-only processing too).

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|-----------|------------------------|---------|---------------------------|
| Personally identifiable info | No | — | — | — |
| Health info | No | — | — | — |
| Financial info | No | — | — | — |
| Authentication info | No | — | — | — |
| Personal communications | No | — | — | — |
| Location | No | — | — | — |
| Web history | Yes | Only with optional Chrome Sync (to Google) | Open/saved tab URLs and titles for the workspace, search and tab restoration | No |
| User activity | Yes | No | Local tab activation, recent-tab switching and interface state | No |
| Website content | Yes | No | Favicons, page titles and video playback state for the mini player | No |

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL**
https://github.com/lophas/arc-sidebar-chrome/blob/main/PRIVACY.md

`docs/webstore/privacy-fields.md` keeps the longer reasoning behind each answer.

## Distribution

**Visibility**: Public
**Regions**: All regions

## Developer Info

**Publisher Name**: Jata (non-trader)
**Contact Email**: lophas@yahoo.com (publisher account: jatahu@gmail.com)
**Support URL**: https://github.com/lophas/arc-sidebar-chrome/issues
**Homepage URL**: https://github.com/lophas/arc-sidebar-chrome

## Version History

Every push to `main` that passes CI becomes a GitHub release; only some of them are
uploaded to the store.

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 4.2.2 | 2026-10-23 | Keep website exceptions when restoring older backups | Published |
| 4.2.0 | 2026-10-20 | Automatic idle-tab discard with protected media, edits and website exceptions | Published (live on 2026-10-23, replaced by 4.2.2) |

## Review Notes

### Known Issues / Limitations
- Automatic Picture-in-Picture needs a per-site browser permission on some websites.
- The sidebar cannot be injected into Chrome's own pages or the Web Store; the native side panel works there.
- The name refers to Arc Browser; the description states the extension is independent and not affiliated with The Browser Company.

### Rejection History
None.
