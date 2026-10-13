## Arc Side of the Chrome 3.1.3

*Spaces, tabs & a little harmony.*

### Automatic link titles

Leave the title empty when adding or editing a pinned link or Favorite to use the current page title from its URL. Existing open pages provide their current title; otherwise the extension reads the page’s HTML title. If no title is available, the URL is used. Canceling a lookup or changing the URL cannot save a stale title into another link.

### Safer Chrome Sync and reset

- A fresh installation and the default My Space never overwrite an existing cloud snapshot with empty data.
- Enabling Sync after a fresh installation or reset restores the saved cloud organization, even when the empty local starting layout has a newer timestamp.
- Reset clears local data and settings and turns Sync off while keeping the cloud snapshot. Re-enable Sync to restore it.
- Uploading starts once there is a saved link, folder or customized Space.
- Sync safely handles simultaneous requests and cloud data arriving in separate chunks.

### Automatic GitHub releases

Extension changes on main are now published automatically after all checks pass, with a new patch version, release notes and a ready-to-install ZIP.

### Install or update

Download `arc-side-of-the-chrome-v3.1.3.zip`, extract it and open **chrome://extensions → Developer mode → Load unpacked**. Select the folder containing `manifest.json`.

For an existing installation, replace the files in its current folder and click **Reload**. Your saved sidebar organization and preferences are retained.
