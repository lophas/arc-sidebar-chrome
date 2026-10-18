export async function enlargeToolbarIcon() {
  // Fit the colored arch itself to the toolbar slot, rather than scaling its
  // padded background tile. Preserve its aspect ratio and original colors.
  const response = await fetch(chrome.runtime.getURL('src/icons/icon512.png'));
  const bitmap = await createImageBitmap(await response.blob());
  try {
    const imageData = {};
    for (const size of [16, 32]) {
      const canvas = new OffscreenCanvas(size, size);
      const context = canvas.getContext('2d');
      const height = size * 324 / 344;
      context.drawImage(bitmap, 84, 90, 344, 324, 0, (size - height) / 2, size, height);
      const pixels = context.getImageData(0, 0, size, size);
      // The source logo includes a charcoal tile. Omit its neutral dark
      // pixels in the toolbar so Chrome's own light/dark surface shows through.
      // This runs once when preparing the tiny 16px and 32px action icons.
      for (let i = 0; i < pixels.data.length; i += 4) {
        const channels = pixels.data.subarray(i, i + 3);
        const highest = Math.max(...channels), lowest = Math.min(...channels);
        if (highest < 80 && highest - lowest < 32) pixels.data[i + 3] = 0;
      }
      imageData[size] = pixels;
    }
    await chrome.action.setIcon({ imageData });
    return imageData;
  } finally { bitmap.close(); }
}
