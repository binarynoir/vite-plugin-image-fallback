export interface ImageFallbackOptions {
  /**
   * File extensions (without the dot) treated as image imports.
   * @default ["jpg", "jpeg", "png", "gif", "svg", "webp", "avif"]
   */
  extensions?: string[];

  /**
   * The asset returned in place of a missing image — a data URI, or any
   * string Vite can serve as a URL.
   * @default a plain gray placeholder SVG reading "Missing Image Asset"
   */
  fallback?: string;

  /**
   * Suppress the console warning normally emitted for each missing asset.
   * @default false
   */
  silent?: boolean;
}
