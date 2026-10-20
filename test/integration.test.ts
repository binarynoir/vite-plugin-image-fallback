import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { build, createServer, type InlineConfig, type ViteDevServer } from "vite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { imageFallbackPlugin } from "../src/plugin.js";

// Real Vite builds and dev servers against a fixture on disk, laid out like a
// VitePress site whose `publicDir` sits outside its root:
//   site/docs/            Vite root (VitePress's srcDir)
//   site/docs/guide/      a page's folder, with a real and a missing image
//   site/docs/public/     the default publicDir
//   site/static/          a publicDir given as an absolute path
let site: string;
let docs: string;

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><title>REAL</title></svg>';

function write(file: string, content: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

beforeAll(() => {
  site = fs.mkdtempSync(path.join(os.tmpdir(), "image-fallback-"));
  docs = path.join(site, "docs");
  write(path.join(docs, "guide/assets/real.svg"), SVG);
  write(path.join(docs, "public/default-public.svg"), SVG);
  write(path.join(site, "static/team-member.svg"), SVG);
  write(
    path.join(docs, "guide/entry.js"),
    [
      'import real from "./assets/real.svg";',
      'import missing from "./assets/missing.png";',
      'import team from "/team-member.svg";',
      'import absent from "/absent.svg";',
      "export default { real, missing, team, absent };",
    ].join("\n"),
  );
});

afterAll(() => {
  fs.rmSync(site, { recursive: true, force: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function config(extra: InlineConfig = {}): InlineConfig {
  return {
    root: docs,
    publicDir: path.join(site, "static"),
    logLevel: "silent",
    configFile: false,
    plugins: [imageFallbackPlugin()],
    ...extra,
  };
}

/** The `export default {…}` object of a library build of `guide/entry.js`, as source. */
async function buildEntry(extra: InlineConfig = {}): Promise<string> {
  const result = await build(
    config({
      build: {
        write: false,
        assetsInlineLimit: 0,
        lib: { entry: path.join(docs, "guide/entry.js"), formats: ["es"], fileName: "entry" },
      },
      ...extra,
    }),
  );
  const outputs = (Array.isArray(result) ? result : [result]) as {
    output: { type: string; code?: string }[];
  }[];
  return outputs[0].output.find((chunk) => chunk.type === "chunk")?.code ?? "";
}

describe("build", () => {
  it("keeps an image from an absolute publicDir outside the root", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const code = await buildEntry();

    expect(code).toContain('"/team-member.svg"');
    const messages = warn.mock.calls.map((call) => String(call[0]));
    expect(messages.some((m) => m.includes("team-member.svg"))).toBe(false);
  });

  it("keeps an image from the default publicDir inside the root", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    write(
      path.join(docs, "guide/public-entry.js"),
      'export { default } from "/default-public.svg";',
    );
    const result = await build(
      config({
        publicDir: undefined,
        build: {
          write: false,
          lib: { entry: path.join(docs, "guide/public-entry.js"), formats: ["es"], fileName: "p" },
        },
      }),
    );
    const outputs = (Array.isArray(result) ? result : [result]) as {
      output: { type: string; code?: string }[];
    }[];
    const code = outputs[0].output.find((chunk) => chunk.type === "chunk")?.code ?? "";
    expect(code).toContain('"/default-public.svg"');
    expect(code).not.toContain("data:image/svg+xml");
  });

  it("passes an existing relative image through Vite's asset pipeline", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const code = await buildEntry();

    // Read by Vite (a library build inlines it), not exported as a raw path.
    expect(code).toMatch(/real: "data:image\/svg\+xml,[^"]*REAL/);
    expect(code).not.toContain('"/assets/real.svg"');
  });

  it("swaps a missing relative or root-relative image for the placeholder", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const code = await buildEntry();

    expect(code.match(/data:image\/svg\+xml;base64,/g)).toHaveLength(2);
    const messages = warn.mock.calls.map((call) => String(call[0]));
    expect(messages.some((m) => m.includes("missing.png"))).toBe(true);
    expect(messages.some((m) => m.includes("absent.svg"))).toBe(true);
  });
});

describe("dev server", () => {
  let server: ViteDevServer;
  let origin: string;

  async function start(extra: InlineConfig = {}) {
    server = await createServer(config({ server: { port: 0, host: "127.0.0.1" }, ...extra }));
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === "string") throw new Error("dev server has no port");
    origin = `http://127.0.0.1:${address.port}`;
  }

  afterEach(async () => {
    await server?.close();
  });

  it("answers a request for a missing image with a placeholder naming it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await start();

    const response = await fetch(`${origin}/guide/assets/missing.png`, {
      headers: { referer: `${origin}/guide/page.html` },
    });
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    const body = await response.text();
    expect(body).toContain("Missing Image Asset");
    expect(body).toContain("/guide/assets/missing.png");
    expect(String(warn.mock.calls[0]?.[0])).toContain("(requested by /guide/page.html)");
  });

  it("marks a placeholder with X-Image-Fallback, and answers HEAD with it too", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await start();

    const get = await fetch(`${origin}/guide/assets/missing.png`);
    expect(get.headers.get("x-image-fallback")).toBe(
      encodeURIComponent("/guide/assets/missing.png"),
    );
    const head = await fetch(`${origin}/guide/assets/missing.png`, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.headers.get("x-image-fallback")).toBe(
      encodeURIComponent("/guide/assets/missing.png"),
    );
    const real = await fetch(`${origin}/guide/assets/real.svg`, { method: "HEAD" });
    expect(real.headers.get("x-image-fallback")).toBeNull();
  });

  it("leaves existing images, in the root and in publicDir, to Vite", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await start();

    for (const url of ["/guide/assets/real.svg", "/team-member.svg"]) {
      const body = await (await fetch(origin + url)).text();
      expect(body, url).toContain("REAL");
    }
  });

  it("leaves VitePress's icon URLs to VitePress", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await start();

    for (const url of ["/_vpi/simple-icons/github.svg", "/docs/_vpi/simple-icons/rss.svg"]) {
      const response = await fetch(origin + url);
      expect(response.headers.get("x-image-fallback"), url).toBeNull();
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it("strips the configured base before looking for the file", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await start({ base: "/docs/" });

    expect(await (await fetch(`${origin}/docs/guide/assets/real.svg`)).text()).toContain("REAL");
    const missing = await fetch(`${origin}/docs/guide/assets/missing.png`);
    expect(await missing.text()).toContain("/guide/assets/missing.png");
  });

  it("serves a custom data URI fallback", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fallback = `data:image/svg+xml;base64,${Buffer.from("<svg>CUSTOM</svg>").toString("base64")}`;
    await start({ plugins: [imageFallbackPlugin({ fallback })] });

    const response = await fetch(`${origin}/guide/assets/missing.png`);
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    expect(await response.text()).toBe("<svg>CUSTOM</svg>");
  });

  it("redirects to a custom URL fallback, and never to itself", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await start({ plugins: [imageFallbackPlugin({ fallback: "/placeholder.png" })] });

    const missing = await fetch(`${origin}/guide/assets/missing.png`, { redirect: "manual" });
    expect(missing.status).toBe(302);
    expect(missing.headers.get("location")).toBe("/placeholder.png");
    const itself = await fetch(`${origin}/placeholder.png`, { redirect: "manual" });
    expect(itself.status).not.toBe(302);
    // HEAD isn't redirected, so the marker header reaches the client.
    const head = await fetch(`${origin}/guide/assets/missing.png`, {
      method: "HEAD",
      redirect: "manual",
    });
    expect(head.status).toBe(200);
    expect(head.headers.get("x-image-fallback")).not.toBeNull();
  });

  it("stays silent with silent: true", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await start({ plugins: [imageFallbackPlugin({ silent: true })] });

    await fetch(`${origin}/guide/assets/missing.png`);
    expect(warn).not.toHaveBeenCalled();
  });
});
