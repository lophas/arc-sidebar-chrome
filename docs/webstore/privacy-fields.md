# Chrome Web Store Privacy practices

Prepared from the 4.0.3 source. Recheck after changing permissions or data handling.

## Single purpose description

Provide a Space-based tab-management workspace for Chrome. Organize and navigate saved links and open tabs through a sidebar that stays synchronized with native Chrome tab groups. Search, focus handling and an optional video mini player help users switch between tabs while keeping their working context.

## tabs justification

Read open-tab URLs, titles, favicons, status and last-access times to display and search tabs, identify saved links that are already open, and switch to the correct tab and Space. Tab and window information also supports reopening saved links, close controls and returning focus to an opener.

## scripting justification

Inject or refresh the bundled autohide sidebar and video mini player controllers in eligible webpages, including already-open tabs after an extension reload or mode change. Bundled scripts also pass the active-tab state and settings needed to open and restore Picture-in-Picture correctly. No remotely hosted scripts are executed.

## tabGroups justification

Create and manage native Chrome groups associated with Favorites and Spaces. Keep their names, colors and order aligned with the sidebar, place project tabs in the correct group, show additional grouped tabs, close a Space’s open tabs, and expand or collapse managed groups when focus changes.

## storage justification

Store the user’s Spaces, Favorites, folders, saved URLs and titles, custom icons, palettes, preferences and tab-restoration metadata. Session storage keeps temporary tab/group bindings. When the user enables Chrome Sync, synchronize the saved organization through chrome.storage.sync. Fixed/Autohide mode, timeout, edge-trigger geometry, Favorite button size and sidebar width remain local and are included in backups.

## sidePanel justification

Display the persistent native Chrome sidebar containing Favorites, Spaces, pinned links, folders, search and open-tab controls. Users can open it with the toolbar button and switch between Fixed and Autohide modes. The native panel also provides access on browser pages where webpage injection is unavailable.

## favicon justification

Display recognizable website icons beside saved links, Favorites, open tabs and search results, using Chrome’s extension favicon service when an existing favicon URL is unavailable. This helps users identify and navigate their tabs.

## contextMenus justification

Add the “Pin to Arc Side of the Chrome” menu to webpage and link context menus. Users can save the current page or selected link directly to Favorites or one of their Spaces.

## Host permission justification

The autohide sidebar must work on arbitrary HTTP/HTTPS sites selected by the user, so a fixed domain list is insufficient. HTTPS page access also lets bundled scripts detect playing HTML5 videos and manage the mini player when switching tabs. Host access allows the background worker to fetch a user-specified link’s page title when no matching open-tab title is available. Access supports these disclosed workspace features; it is not used for analytics or advertising.

## Remote code

Select **No, I am not using remote code**. All executable code is bundled; fetched page titles and website images are data.

## Data usage

Check **Web history**, **User activity** and **Website content**. This covers open/saved tab URLs and titles; local tab-activation, recent-tab and interface state; favicons/images and video handling. The extension does not access Chrome's browsing-history database or send interaction telemetry to the developer. These disclosures include local-only processing, as required by the Chrome Web Store User Data FAQ.

Leave Personally identifiable information, Health information, Financial and payment information, Authentication information, Personal communications and Location unchecked. The extension does not collect those categories as application data; the privacy policy explains that user-chosen URLs/titles may themselves contain personal information and that normal website requests carry network information.

Check all three Limited Use certifications: no sale/transfer outside approved uses, no unrelated use/transfer, no creditworthiness/lending use.

## Privacy policy URL

https://github.com/lophas/arc-sidebar-chrome/blob/main/PRIVACY.md

## Basis

- https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
- Local source audit: manifest, favicon helper, page-title lookup, tab/session/restoration management, Chrome Sync, backup/reset, overlay and mini player controllers. This document describes handling needed for visible extension features, not a claim that no user data is processed.
