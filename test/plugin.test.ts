import { describe, it, expect, beforeEach, vi } from "vitest";
import { imageFallbackPlugin } from "../src/plugin.js";
import { readHint } from "../src/hint.js";
import type { Plugin } from "vite";
import fs from "node:fs";

vi.mock("node:fs");

// resolveId/load's types allow either a plain function or a
// `{ handler, order }` object; this plugin only ever uses the plain
// function form, so casting through these helpers avoids re-asserting
// that at every call site.
function callResolveId(plugin: Plugin, source: string) {
  const hook = plugin.resolveId as unknown as (
    this: unknown,
    source: string,
  ) => string | null | undefined;
  return hook.call({}, source);
}

function callLoad(plugin: Plugin, id: string) {
  const hook = plugin.load as unknown as (this: unknown, id: string) => string | null | undefined;
  return hook.call({}, id);
}

describe("imageFallbackPlugin", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("asset resolution", () => {
    it("should leave existing image assets to Vite", () => {
      const plugin = imageFallbackPlugin();
      vi.mocked(fs.existsSync).mockReturnValue(true);
      expect(callResolveId(plugin, "./test.png")).toBeUndefined();
      expect(callResolveId(plugin, "/test.png")).toBeUndefined();
    });

    it("should return fallback for missing assets", () => {
      const plugin = imageFallbackPlugin();
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const result = callLoad(plugin, "\0image-fallback:missing.png");
      expect(result).toBeDefined();
      expect(result).toContain("data:image/svg+xml");
    });

    it("should intercept asset requests for images", () => {
      const plugin = imageFallbackPlugin();
      const result = callResolveId(plugin, ".jpg");
      expect(result).toContain("\0image-fallback:");
    });

    it("should intercept asset requests for PNG files", () => {
      const plugin = imageFallbackPlugin();
      const result = callResolveId(plugin, ".png");
      expect(result).toContain("\0image-fallback:");
    });
  });

  describe("fallback image handling", () => {
    it("should return fallback SVG for missing images", () => {
      const plugin = imageFallbackPlugin();
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const result = callLoad(plugin, "\0image-fallback:missing.jpg");
      expect(result).toContain("export default");
      expect(result).toContain("data:image/svg+xml;base64");
    });

    it("should return fallback for any missing asset type", () => {
      const plugin = imageFallbackPlugin();
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const result = callLoad(plugin, "\0image-fallback:missing.gif");
      expect(result).toContain("data:image/svg+xml;base64");
    });

    it("should return fallback for missing WebP files", () => {
      const plugin = imageFallbackPlugin();
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const result = callLoad(plugin, "\0image-fallback:missing.webp");
      expect(result).toContain("data:image/svg+xml;base64");
    });
  });

  describe("asset path handling", () => {
    it("should handle relative asset paths", () => {
      const plugin = imageFallbackPlugin();
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const result = callResolveId(plugin, "./test.png");
      expect(result).toContain("\0image-fallback:");
    });

    it("should handle nested asset paths", () => {
      const plugin = imageFallbackPlugin();
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const result = callResolveId(plugin, "./images/test.png");
      expect(result).toContain("\0image-fallback:");
    });

    it("should handle absolute paths", () => {
      const plugin = imageFallbackPlugin();
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const result = callResolveId(plugin, "/images/test.png");
      expect(result).toContain("\0image-fallback:");
    });
  });

  describe("non-image assets", () => {
    it("should not intercept non-image files", () => {
      const plugin = imageFallbackPlugin();
      const result = callResolveId(plugin, "./test.css");
      expect(result).toBeUndefined();
    });

    it("should not intercept JavaScript files", () => {
      const plugin = imageFallbackPlugin();
      const result = callResolveId(plugin, "./test.js");
      expect(result).toBeUndefined();
    });

    it("should not intercept HTML files", () => {
      const plugin = imageFallbackPlugin();
      const result = callResolveId(plugin, "./test.html");
      expect(result).toBeUndefined();
    });

    it("should not intercept bare package specifiers", () => {
      const plugin = imageFallbackPlugin();
      const result = callResolveId(plugin, "some-icon-package/icon.png");
      expect(result).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("should handle empty asset paths", () => {
      const plugin = imageFallbackPlugin();
      const result = callResolveId(plugin, "");
      expect(result).toBeUndefined();
    });

    it("should handle invalid asset paths", () => {
      const plugin = imageFallbackPlugin();
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const result = callLoad(plugin, "\0image-fallback:");
      expect(result).toBeDefined();
    });

    it("should handle special characters in paths", () => {
      const plugin = imageFallbackPlugin();
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const result = callResolveId(plugin, "./test-file.png");
      expect(result).toContain("\0image-fallback:");
    });

    it("should handle very long paths", () => {
      const plugin = imageFallbackPlugin();
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const longPath = "./" + "a/".repeat(100) + "test.png";
      const result = callResolveId(plugin, longPath);
      expect(result).toContain("\0image-fallback:");
    });
  });

  describe("integration tests", () => {
    it("should handle mixed existing and missing assets", () => {
      const plugin = imageFallbackPlugin();
      vi.mocked(fs.existsSync).mockImplementation(
        (target) => typeof target === "string" && target.includes("existing"),
      );
      const existingResult = callResolveId(plugin, "./existing.png");
      const missingResult = callResolveId(plugin, "./missing.png");
      expect(existingResult).toBeUndefined();
      expect(missingResult).toContain("\0image-fallback:");
    });

    it("should handle multiple asset types", () => {
      const plugin = imageFallbackPlugin();
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const jpgResult = callResolveId(plugin, "./test.jpg");
      const pngResult = callResolveId(plugin, "./test.png");
      const webpResult = callResolveId(plugin, "./test.webp");
      expect(jpgResult).toContain("\0image-fallback:");
      expect(pngResult).toContain("\0image-fallback:");
      expect(webpResult).toContain("\0image-fallback:");
    });

    it("should handle asset resolution chain", () => {
      const plugin = imageFallbackPlugin({ silent: true });
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const result1 = callResolveId(plugin, "./images/test.png");
      const result2 = callLoad(plugin, result1!);
      expect(result2).toContain("data:image/svg+xml;base64");
    });
  });

  describe("options", () => {
    it("restricts interception to the configured extensions", () => {
      const plugin = imageFallbackPlugin({ extensions: ["png"] });
      expect(callResolveId(plugin, "./test.png")).toContain("\0image-fallback:");
      expect(callResolveId(plugin, "./test.jpg")).toBeUndefined();
    });

    it("returns a custom fallback asset", () => {
      const plugin = imageFallbackPlugin({ fallback: "/placeholder.png" });
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const result = callLoad(plugin, "\0image-fallback:missing.png");
      expect(result).toContain('"/placeholder.png#image-fallback=');
    });

    it("returns the fallback exactly as given with hints: false", () => {
      const plugin = imageFallbackPlugin({ fallback: "/placeholder.png", hints: false });
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const result = callLoad(plugin, "\0image-fallback:missing.png");
      expect(result).toBe(`export default ${JSON.stringify("/placeholder.png")}`);
    });

    it("suppresses the warning when silent is set", () => {
      const plugin = imageFallbackPlugin({ silent: true });
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      callLoad(plugin, "\0image-fallback:missing.png");
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it("warns by default when an asset is missing", () => {
      const plugin = imageFallbackPlugin();
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      callLoad(plugin, "\0image-fallback:missing.png");
      expect(warnSpy).toHaveBeenCalledOnce();
      warnSpy.mockRestore();
    });
  });

  describe("hints", () => {
    /** The default export of a loaded module, as the string it exports. */
    const exported = (code: string | null | undefined) =>
      JSON.parse(String(code).replace(/^export default /, "")) as string;

    it("passes the importer through the virtual id", () => {
      const plugin = imageFallbackPlugin();
      const hook = plugin.resolveId as unknown as (source: string, importer?: string) => string;
      expect(hook("./missing.png", "/site/docs/guide/page.md")).toBe(
        "\0image-fallback:/site/docs/guide/page.md\0import:./missing.png",
      );
    });

    it("records the missing import, its file and its line in the placeholder URL", () => {
      const plugin = imageFallbackPlugin();
      (plugin.configResolved as unknown as (c: { root: string }) => void)({ root: "/site/docs" });
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readFileSync).mockReturnValue(
        "# Page\n\nThe file `./missing.png` is shown below.\n\n![Diagram](./missing.png)\n",
      );
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const url = exported(
        callLoad(
          plugin,
          "\0image-fallback:/site/docs/guide/page.md?vue&type=script\0import:./missing.png",
        ),
      );
      expect(url.startsWith("data:image/svg+xml;base64,")).toBe(true);
      expect(readHint(url)).toEqual({ src: "./missing.png", file: "guide/page.md", line: 5 });
      expect(warnSpy.mock.calls[0]?.[0]).toContain("missing.png (imported by guide/page.md:5)");
      warnSpy.mockRestore();
    });

    it("resolves a relative import against the importing file, in the warning", () => {
      const plugin = imageFallbackPlugin();
      (plugin.configResolved as unknown as (c: { root: string }) => void)({ root: "/site/docs" });
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      callLoad(plugin, "\0image-fallback:/site/docs/guide/page.md\0import:./img/missing.png");
      expect(warnSpy.mock.calls[0]?.[0]).toContain(
        "Could not find /site/docs/guide/img/missing.png",
      );
      warnSpy.mockRestore();
    });

    it("warns once per missing import, though it is loaded again", () => {
      const plugin = imageFallbackPlugin();
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      callLoad(plugin, "\0image-fallback:/site/a.md\0import:./x.png");
      callLoad(plugin, "\0image-fallback:/site/a.md\0import:./x.png");
      callLoad(plugin, "\0image-fallback:/site/b.md\0import:./x.png");
      expect(warnSpy).toHaveBeenCalledTimes(2);
      warnSpy.mockRestore();
    });

    it("leaves the line out when the importer can't be read", () => {
      const plugin = imageFallbackPlugin({ silent: true });
      (plugin.configResolved as unknown as (c: { root: string }) => void)({ root: "/site/docs" });
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error("ENOENT");
      });
      const url = exported(
        callLoad(plugin, "\0image-fallback:/site/docs/page.md\0import:./missing.png"),
      );
      expect(readHint(url)).toEqual({ src: "./missing.png", file: "page.md" });
    });
  });
});
