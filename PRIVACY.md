# Privacy Policy — Arc Side of the Chrome

Last updated: October 16, 2026

Publisher: Jata (GitHub: [lophas](https://github.com/lophas)).

Arc Side of the Chrome provides a Space-based workspace for organizing saved links and open Chrome tabs. It processes browsing information to provide its sidebar, native tab-group integration, search and video mini player. The extension has no developer-operated data collection server, advertising system or analytics service. Your workspace is not sent to the developer.

## Information handled and why

- **Saved organization:** Space and folder names, Favorites, pinned URLs and titles, item order, palettes, emojis, uploaded or imported icons and internal item IDs. These provide the workspace you create, import or restore.
- **Open-tab information:** Tab IDs, URLs, titles, favicon locations, window and group membership, tab order, active/loading/discarded status and Chrome-provided last-access times. These enable open-tab search, recent-tab switching, close controls and matching the sidebar to Chrome's tab bar.
- **Tab restoration information:** The latest URL, title, tab position and update time associated with a saved link may be stored locally to reconnect it to an existing tab after a browser restart. This is not a complete record of every page visited. The extension does not use Chrome's browsing-history database.
- **Interface activity and preferences:** The selected Space, folder expansion, sidebar scroll positions, mode, size and edge-trigger preferences. Pointer/button events, keyboard interactions with the extension, tab activation and visibility changes are processed locally to operate the interface and focus behavior. The extension does not record general webpage keystroke logs or send interaction analytics.
- **Website content needed for features:** Page titles, URLs, favicons and HTML5 video elements/playback state. When you save or edit a link with an empty title, the extension first checks an open tab's title. If unavailable, it may fetch the specified webpage and temporarily read its HTML to extract the title. This request omits authentication credentials; the fetched page's scripts are not executed and its page body is not saved as workspace content.
- **Mini player state:** The extension detects eligible playing videos and tab changes to display and restore Picture-in-Picture. A small in-memory diagnostic event list can help troubleshoot this feature. Videos are not recorded, copied to a developer server or uploaded by the extension.

The extension does not provide account registration or collect passwords, authentication cookies, payment details, health records, private message bodies or geolocation as application data. URLs, titles and names that you choose to save can themselves contain personal information; they are handled as part of your workspace.

## Local storage

Saved organization and preferences are stored in Chrome's extension storage on your device. Temporary tab/group bindings and operating state use memory or browser-managed session storage. Some restoration information persists locally across browser restarts.

Importing Arc Browser data, restoring a backup and preparing uploaded icon files happen on your device. The extension does not upload the source import or backup file to the developer.

## Optional Chrome Sync

When you enable the extension's Chrome Sync option, it uses Google's Chrome Storage Sync service to synchronize your saved Spaces, Favorites, folders, pinned links, order, palettes, custom icons and edge-trigger settings between eligible Chrome installations. This includes the saved URLs and titles in that organization. Google handles this synchronization under its own Chrome/account policies and settings; the developer does not receive your cloud workspace.

Live open-tab lists, tab restoration bindings, the selected Space, folder expansion, sidebar scroll positions, sidebar mode, close delay, sidebar width, Favorite button size and mini player preference are not included in the extension's synchronized workspace.

Turning Sync off stops further workspace synchronization by this extension. **Reset all extension data** clears local data and turns the extension's Sync option off while deliberately preserving the previous cloud snapshot, so you can restore it by enabling Sync again. Manage any remaining cloud data through Chrome/Google's applicable Sync data controls.

## Backups and retention

Downloading a backup creates a readable JSON file containing your saved organization, custom icons, folder expansion states and supported preferences, including Favorite button size. You choose where to keep it and whether to share or delete it. Restoring a backup or importing Arc Browser data replaces the current saved organization.

Saved local organization remains until you change, delete or reset it, or remove the extension. Runtime-only state lasts for the relevant page/browser session. Resetting the extension does not close your existing Chrome tabs or delete backup files you have downloaded. Previously saved cloud snapshots and copies of backups require separate management as described above.

## Network requests and third parties

The extension may make normal browser requests to the websites you open, to website favicon/image URLs, and to a link's URL when resolving a missing page title. The receiving website or image host can receive the ordinary network information associated with a request, such as an IP address and browser headers. The extension does not use this information for location tracking or advertising.

Choosing a Google search result from the command bar opens Google with the search terms you entered. It does not send searches to the developer. Optional Chrome Sync sends the synchronized data described above to Google's service. Websites you visit, image hosts, Google Search and Chrome Sync operate under their respective privacy policies.

There is no telemetry endpoint, sale of workspace data, advertising profile or developer access to your workspace. The developer can only see workspace information if you choose to send it through a support channel.

## Limited Use

Arc Side of the Chrome uses browsing information only to provide its disclosed workspace features and complies with the Chrome Web Store User Data Policy, including its Limited Use requirements. Data is not sold, used for personalized advertising, transferred for unrelated purposes, or used to determine creditworthiness or for lending. The extension does not provide a mechanism for the developer or other people to remotely read your workspace.

All executable extension code is included in the installed package. Webpage title responses and icons are treated as data, not downloaded executable code.

## Your controls and contact

You can edit or delete saved links and Spaces, turn automatic Picture-in-Picture off, disable Sync, download or restore a backup, reset local data, or uninstall the extension. At least one initial Space is recreated after a reset.

For privacy questions, contact the publisher using the contact email shown on the extension's Chrome Web Store listing. General support is available through [the project repository](https://github.com/lophas/arc-sidebar-chrome/issues).

This policy will be updated when the extension's data handling changes.
