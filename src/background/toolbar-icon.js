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
      imageData[size] = context.getImageData(0, 0, size, size);
    }
    await chrome.action.setIcon({ imageData });
    return imageData;
  } finally { bitmap.close(); }
}
