# Chrome Web Store images

All screenshots are 1280 × 800 RGB JPEGs. Upload these in order in the **Screenshots** field:

1. `01-spaces-and-chrome.jpg` — the sidebar alongside matching native Chrome tab groups.
2. `02-search-every-tab.jpg` — keyboard search across saved links and live tabs.
3. `03-video-mini-player.jpg` — native video Picture-in-Picture over another working tab.
4. `04-space-palettes.jpg` — Work, Personal and Reading in light and dark themes.
5. `05-sidebar-options.jpg` — edge triggers, the Favorite size slider, backup and Sync.

Other fields:

- **Store icon:** `src/icons/icon128.png` (128 × 128).
- **Small promo tile:** `promo-small-440x280.jpg` (440 × 280).
- **Marquee promo tile:** `promo-marquee-1400x560.jpg` (1400 × 560).

Captures use the real installed extension with fictional example workspaces and sites. Eight distinct Favorite buttons appear as two rows of four. Social brand SVGs are obtained from Simple Icons; brand marks remain the property of their respective owners. Search, palette and Options images place real interface captures inside presentation frames. See `capture-info.json` for the extension and browser versions.

To reproduce, run `ARC_CAPTURE_WEBSTORE=1 node docs/screenshots/capture.mjs` under a 1280 × 800 Xvfb desktop with Openbox. The script requires Playwright Chromium, ImageMagick, FFmpeg and Noto Color Emoji. The screenshot workflow enables this mode automatically on branches containing `webstore` in their name.
