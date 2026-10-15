export async function enlargeToolbarIcon() {
  // Keep the original artwork, but use less of its transparent outer margin in
  // the toolbar's fixed-size slot. Render once, with crisp standard/Retina sizes.
  const response = await fetch(chrome.runtime.getURL('src/icons/icon512.png'));
  const bitmap = await createImageBitmap(await response.blob());
  try {
    const imageData = {};
    for (const size of [16, 32]) {
      const canvas = new OffscreenCanvas(size, size);
      const context = canvas.getContext('2d');
      context.drawImage(bitmap, 16, 16, 480, 480, 0, 0, size, size);
      imageData[size] = context.getImageData(0, 0, size, size);
    }
    await chrome.action.setIcon({ imageData });
  } finally { bitmap.close(); }
}
