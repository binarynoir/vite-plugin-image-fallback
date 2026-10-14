import type { Plugin } from "vite";
import fs from "node:fs";
import path from "node:path";
import { withHint, type ImageFallbackHint } from "./hint.js";
import type { ImageFallbackOptions } from "./types.js";

const DEFAULT_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "svg", "webp", "avif"];
const VIRTUAL_PREFIX = "\0image-fallback:";
// Separates the importing file from the import, inside a virtual id. The
// import goes last, so the id still ends in its image extension: an id ending
// in the importer's `.md` or `.vue` would be picked up by those plugins.
const IMPORT_SEPARATOR = "\0import:";

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
 * The 1-based line of `file` that uses `source`, if it can be read: the first
 * line where it is a Markdown image or link target or a quoted attribute
 * value, else the first line that mentions it at all.
 */
function findLine(file: string, source: string): number | undefined {
  let lines: string[];
  try {
    lines = fs.readFileSync(file, "utf-8").split(/\r?\n/);
  } catch {
    return undefined;
  }
  const uses = [`](${source}`, `"${source}"`, `'${source}'`];
  let index = lines.findIndex((line) => uses.some((use) => line.includes(use)));
  if (index === -1) index = lines.findIndex((line) => line.includes(source));
  return index === -1 ? undefined : index + 1;
}

/**
 * Swaps a relative/root-relative image import that doesn't resolve to a
 * real file for a placeholder SVG, so a broken reference warns at build
 * time instead of failing the whole build with a Rollup "could not
 * resolve" error. Bare specifiers (package-provided images) are left
 * untouched so they still go through normal node_modules resolution.
 *
 * With `hints` (on by default), each placeholder also records which import
 * was missing and where, for `enableImageFallbackHints` from
 * `@binarynoir/vite-plugin-image-fallback/client` to explain on the page.
 */
export function imageFallbackPlugin(options: ImageFallbackOptions = {}): Plugin {
  const extensions = options.extensions ?? DEFAULT_EXTENSIONS;
  const imageRe = new RegExp(`\\.(${extensions.join("|")})(\\?.*)?$`, "i");
  const fallback = options.fallback ?? defaultFallbackImage();
  const silent = options.silent ?? false;
  const hints = options.hints ?? true;

  let root = process.cwd();
  // VitePress builds each page twice (client and SSR); warn once per missing import.
  const warned = new Set<string>();

  return {
    name: "vite-plugin-image-fallback",

    configResolved(config) {
      root = config.root;
    },

    resolveId(source, importer) {
      if (!imageRe.test(source)) return;
      if (!source.startsWith(".") && !source.startsWith("/")) return;
      return VIRTUAL_PREFIX + (importer ? importer + IMPORT_SEPARATOR : "") + source;
    },

    load(id) {
      if (!id.startsWith(VIRTUAL_PREFIX)) return;

      const rest = id.slice(VIRTUAL_PREFIX.length);
      const separator = rest.lastIndexOf(IMPORT_SEPARATOR);
      const importer = separator === -1 ? undefined : rest.slice(0, separator);
      const assetPath = separator === -1 ? rest : rest.slice(separator + IMPORT_SEPARATOR.length);
      // The importing file, without a query such as Vue's `?vue&type=…`.
      const importerFile = importer?.split("?")[0];
      // A relative import is relative to the file that made it; anything else to the root.
      const fullPath =
        importerFile && assetPath.startsWith(".")
          ? path.resolve(path.dirname(importerFile), assetPath)
          : path.resolve(root, assetPath.replace(/^\//, ""));

      if (fs.existsSync(fullPath)) {
        const publicPath = "/" + assetPath.replace(/^\.?\//, "");
        return `export default ${JSON.stringify(publicPath)}`;
      }

      const hint: ImageFallbackHint = { src: assetPath };
      if (importerFile) {
        hint.file = path.relative(root, importerFile).split(path.sep).join("/");
        hint.line = findLine(importerFile, assetPath);
      }

      if (!silent && !warned.has(id)) {
        warned.add(id);
        const where = hint.file
          ? ` (imported by ${hint.file}${hint.line ? `:${hint.line}` : ""})`
          : "";
        console.warn(
          `[vite-plugin-image-fallback] Could not find ${fullPath}${where}. Using fallback image.`,
        );
      }
      return `export default ${JSON.stringify(hints ? withHint(fallback, hint) : fallback)}`;
    },
  };
}
