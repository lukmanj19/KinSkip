/**
 * Client-side store that maps mediaId → blob URL for local files.
 * Blob URLs are created from File objects and are only valid for the
 * lifetime of the browser tab — they never leave the user's device.
 */
const blobUrls = new Map<number, string>();

export function storeBlobUrl(mediaId: number, file: File): string {
  // Revoke any previous URL for this media entry to avoid memory leaks
  const existing = blobUrls.get(mediaId);
  if (existing) URL.revokeObjectURL(existing);

  const url = URL.createObjectURL(file);
  blobUrls.set(mediaId, url);
  return url;
}

export function getBlobUrl(mediaId: number): string | undefined {
  return blobUrls.get(mediaId);
}

export function revokeBlobUrl(mediaId: number): void {
  const url = blobUrls.get(mediaId);
  if (url) {
    URL.revokeObjectURL(url);
    blobUrls.delete(mediaId);
  }
}
