import type { Plugin } from "vite";
import fs from "node:fs";
import path from "node:path";
import type { ImageFallbackOptions } from "./types.js";

const DEFAULT_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "svg", "webp", "avif"];
const VIRTUAL_PREFIX = "\0image-fallback:";

function defaultFallbackImage(): string {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
  <rect width="200" height="100" fill="#cccccc"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#000000" font-size="16" font-family="Arial, sans-serif">
    Missing Image Asset
  </text>
</svg>
`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/**
 * Swaps a relative/root-relative image import that doesn't resolve to a
 * real file for a placeholder SVG, so a broken reference warns at build
 * time instead of failing the whole build with a Rollup "could not
 * resolve" error. Bare specifiers (package-provided images) are left
 * untouched so they still go through normal node_modules resolution.
 */
export function imageFallbackPlugin(options: ImageFallbackOptions = {}): Plugin {
  const extensions = options.extensions ?? DEFAULT_EXTENSIONS;
  const imageRe = new RegExp(`\\.(${extensions.join("|")})(\\?.*)?$`, "i");
  const fallback = options.fallback ?? defaultFallbackImage();
  const silent = options.silent ?? false;

  let root = process.cwd();

  return {
    name: "vite-plugin-image-fallback",

    configResolved(config) {
      root = config.root;
    },

    resolveId(source) {
      if (!imageRe.test(source)) return;
      if (!source.startsWith(".") && !source.startsWith("/")) return;
      return VIRTUAL_PREFIX + source;
    },

    load(id) {
      if (!id.startsWith(VIRTUAL_PREFIX)) return;

      const assetPath = id.slice(VIRTUAL_PREFIX.length);
      const fullPath = path.resolve(root, assetPath.replace(/^\//, ""));

      if (fs.existsSync(fullPath)) {
        const publicPath = "/" + assetPath.replace(/^\.?\//, "");
        return `export default ${JSON.stringify(publicPath)}`;
      }

      if (!silent) {
        console.warn(
          `[vite-plugin-image-fallback] Could not find ${fullPath}. Using fallback image.`,
        );
      }
      return `export default ${JSON.stringify(fallback)}`;
    },
  };
}
