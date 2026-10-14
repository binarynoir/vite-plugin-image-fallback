import type { Connect, Plugin } from "vite";
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
// Dev-server requests with these queries are module imports, which go through
// `resolveId`/`load` instead of the middleware.
const MODULE_QUERIES = ["import", "url", "raw", "inline"];
// The longest missing path drawn into a dev-mode placeholder before it is
// shortened from the left.
const MAX_LABEL_LENGTH = 48;

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** The default placeholder SVG, with `label` (the missing path) under its title. */
function defaultFallbackSvg(label?: string): string {
  if (!label) {
    return `
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
  <rect width="200" height="100" fill="#cccccc"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#000000" font-size="16" font-family="Arial, sans-serif">
    Missing Image Asset
  </text>
</svg>
`;
  }
  const shown =
    label.length > MAX_LABEL_LENGTH ? "…" + label.slice(-(MAX_LABEL_LENGTH - 1)) : label;
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="100" viewBox="0 0 320 100">
  <rect width="320" height="100" fill="#cccccc"/>
  <text x="50%" y="40%" dominant-baseline="middle" text-anchor="middle" fill="#000000" font-size="16" font-family="Arial, sans-serif">
    Missing Image Asset
  </text>
  <text x="50%" y="66%" dominant-baseline="middle" text-anchor="middle" fill="#333333" font-size="11" font-family="Menlo, Consolas, monospace">
    ${escapeXml(shown)}
  </text>
</svg>
`;
}

function defaultFallbackImage(): string {
  return `data:image/svg+xml;base64,${Buffer.from(defaultFallbackSvg()).toString("base64")}`;
}

/** Splits a `data:` URI into its media type and bytes, or `null` if it isn't one. */
function decodeDataUri(uri: string): { type: string; body: Buffer } | null {
  const match = /^data:([^;,]*)((?:;[^;,]*)*?)(;base64)?,(.*)$/s.exec(uri);
  if (!match) return null;
  const type = (match[1] || "text/plain") + match[2];
  const body = match[3]
    ? Buffer.from(match[4], "base64")
    : Buffer.from(decodeURIComponent(match[4]));
  return { type, body };
}

/** The path of the page that requested an image, from its `Referer` header. */
function refererPath(referer: string | undefined): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).pathname;
  } catch {
    return undefined;
  }
}

/** `source` without a `?query` or `#hash`. */
function stripQuery(source: string): string {
  return source.replace(/[?#].*$/s, "");
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
 * untouched so they still go through normal node_modules resolution, and
 * so is every image that exists, including one in Vite's `publicDir`.
 *
 * On the dev server it also answers a request for a missing image (one that
 * isn't an import, such as a Markdown image VitePress compiles to a plain
 * URL) with the placeholder, instead of the page's HTML.
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
  // Empty when `publicDir` is disabled.
  let publicDir = "";
  let base = "/";
  // VitePress builds each page twice (client and SSR); warn once per missing import.
  const warned = new Set<string>();

  /** Where an import points on disk, the way Vite would look for it first. */
  function importPath(assetPath: string, importerFile: string | undefined): string {
    return importerFile && assetPath.startsWith(".")
      ? path.resolve(path.dirname(importerFile), assetPath)
      : path.resolve(root, assetPath.replace(/^\//, ""));
  }

  /** The file in `publicDir` a root-relative URL path names, if it exists there. */
  function inPublicDir(urlPath: string): boolean {
    return !!publicDir && fs.existsSync(path.join(publicDir, urlPath.replace(/^\//, "")));
  }

  /** Whether a relative or root-relative import resolves to a real file. */
  function exists(source: string, importerFile: string | undefined): boolean {
    const file = stripQuery(source);
    if (fs.existsSync(importPath(file, importerFile))) return true;
    if (!file.startsWith("/")) return false;
    // A root-relative import may name a public file, or be an absolute
    // filesystem path (Vite passes those to `resolveId` too).
    return inPublicDir(file) || fs.existsSync(file.replace(/^\/@fs\//, "/"));
  }

  function warn(key: string, message: string) {
    if (silent || warned.has(key)) return;
    warned.add(key);
    console.warn(`[vite-plugin-image-fallback] ${message}`);
  }

  /** Answers a dev-server request for a missing image with the placeholder. */
  const serveFallback: Connect.NextHandleFunction = (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();

    let url: URL;
    let pathname: string;
    try {
      url = new URL(req.url ?? "/", "http://localhost");
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return next();
    }
    if (!imageRe.test(pathname)) return next();
    if (MODULE_QUERIES.some((query) => url.searchParams.has(query))) return next();
    if (pathname.startsWith("/@") || pathname.includes("/node_modules/")) return next();
    // A custom fallback that is itself missing would otherwise redirect to itself.
    if (stripQuery(fallback) === pathname) return next();
    if (!pathname.startsWith(base)) return next();
    pathname = "/" + pathname.slice(base.length);
    if (stripQuery(fallback) === pathname) return next();

    const file = path.join(root, pathname.slice(1));
    if (fs.existsSync(file) || inPublicDir(pathname)) return next();

    const page = refererPath(req.headers.referer);
    warn(
      `dev:${pathname}`,
      `Could not find ${file}${page ? ` (requested by ${page})` : ""}. Serving fallback image.`,
    );

    if (!options.fallback) {
      res.setHeader("Content-Type", "image/svg+xml");
      res.setHeader("Cache-Control", "no-cache");
      res.end(req.method === "HEAD" ? undefined : defaultFallbackSvg(pathname));
      return;
    }
    const data = decodeDataUri(fallback);
    if (data) {
      res.setHeader("Content-Type", data.type);
      res.setHeader("Cache-Control", "no-cache");
      res.end(req.method === "HEAD" ? undefined : data.body);
      return;
    }
    res.statusCode = 302;
    res.setHeader("Location", fallback);
    res.end();
  };

  return {
    name: "vite-plugin-image-fallback",

    configResolved(config) {
      root = config.root;
      publicDir = config.publicDir ?? "";
      base = config.base?.startsWith("/") ? config.base : "/";
    },

    configureServer(server) {
      // Added directly, so it runs ahead of Vite's own middleware and the
      // SPA fallback that would otherwise answer with the page's HTML.
      server.middlewares.use(serveFallback);
    },

    resolveId(source, importer) {
      if (!imageRe.test(source)) return;
      if (!source.startsWith(".") && !source.startsWith("/")) return;
      // The importing file, without a query such as Vue's `?vue&type=…`.
      const importerFile = importer?.split("?")[0];
      // Leave every real file, public ones included, to Vite's asset pipeline.
      if (exists(source, importerFile)) return;
      return VIRTUAL_PREFIX + (importer ? importer + IMPORT_SEPARATOR : "") + source;
    },

    load(id) {
      if (!id.startsWith(VIRTUAL_PREFIX)) return;

      const rest = id.slice(VIRTUAL_PREFIX.length);
      const separator = rest.lastIndexOf(IMPORT_SEPARATOR);
      const importer = separator === -1 ? undefined : rest.slice(0, separator);
      const assetPath = separator === -1 ? rest : rest.slice(separator + IMPORT_SEPARATOR.length);
      const importerFile = importer?.split("?")[0];
      const fullPath = importPath(stripQuery(assetPath), importerFile);

      const hint: ImageFallbackHint = { src: assetPath };
      if (importerFile) {
        hint.file = path.relative(root, importerFile).split(path.sep).join("/");
        hint.line = findLine(importerFile, assetPath);
      }

      const where = hint.file
        ? ` (imported by ${hint.file}${hint.line ? `:${hint.line}` : ""})`
        : "";
      const alsoPublic =
        assetPath.startsWith("/") && publicDir
          ? ` or ${path.join(publicDir, stripQuery(assetPath).slice(1))}`
          : "";
      warn(id, `Could not find ${fullPath}${alsoPublic}${where}. Using fallback image.`);
      return `export default ${JSON.stringify(hints ? withHint(fallback, hint) : fallback)}`;
    },
  };
}
