## Arc Sidebar for Chrome 2.0.2

- **Autohide on tab changes:** switching tabs closes the overlay reliably. Returning to a tab while the mouse stays on Chrome’s tab bar no longer opens the sidebar automatically.
- **Fresh edge movement:** opening the sidebar requires actual pointer movement at the page edge. Stale editor locks cannot keep the overlay open after tab activation.

Includes all features and visual improvements from 2.0.1.

### Install or update

Download `arc-sidebar-chrome-v2.0.2.zip` and extract it. Open **chrome://extensions → Developer mode → Load unpacked**, then select the folder containing `manifest.json`.

For an existing installation, replace the files in its current folder, click **Reload**, and reload already-open webpages so they receive the updated edge-trigger code. Your saved sidebar organization is retained.
