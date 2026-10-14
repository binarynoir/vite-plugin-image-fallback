/** What a placeholder records about the image it stands in for. */
export interface ImageFallbackHint {
  /** The import that could not be found, as written, e.g. `./diagram.png`. */
  src: string;
  /** The file that imported it, relative to the Vite root. */
  file?: string;
  /** The 1-based line of the import in `file`, when it could be found. */
  line?: number;
}

/** Marks a placeholder URL, ahead of the hint's JSON, in its #fragment. */
export const HINT_MARKER = "image-fallback=";

/**
 * Adds `hint` to a placeholder URL as a `#image-fallback=…` fragment, which
 * the client script (`enableImageFallbackHints`) reads back. Browsers leave
 * the fragment out when loading the image, so it looks the same.
 */
export function withHint(url: string, hint: ImageFallbackHint): string {
  return `${url}#${HINT_MARKER}${encodeURIComponent(JSON.stringify(hint))}`;
}

/** Reads the hint back out of a placeholder URL, or `null` if it has none. */
export function readHint(url: string): ImageFallbackHint | null {
  const index = url.lastIndexOf(`#${HINT_MARKER}`);
  if (index === -1) return null;
  try {
    const hint = JSON.parse(decodeURIComponent(url.slice(index + 1 + HINT_MARKER.length)));
    return typeof hint?.src === "string" ? hint : null;
  } catch {
    return null;
  }
}
