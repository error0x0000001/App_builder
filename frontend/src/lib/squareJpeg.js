/** Centre-crops an image file to a square and returns it as a small JPEG (what the server accepts for profile photos). */
export async function squareJpeg(file, size = 256) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff'; // JPEG has no transparency
  context.fillRect(0, 0, size, size);
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error('That image could not be read');
  return new File([blob], 'photo.jpg', { type: 'image/jpeg' });
}
