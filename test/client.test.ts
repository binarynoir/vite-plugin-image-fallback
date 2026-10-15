// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enableImageFallbackHints, isImageFallback } from "../src/client.js";
import { readHint, withHint } from "../src/hint.js";

const PLACEHOLDER = "data:image/svg+xml;base64,PHN2Zy8+";
const withLocation = withHint(PLACEHOLDER, { src: "./diagram.png", file: "guide/api.md", line: 3 });
const noLocation = withHint(PLACEHOLDER, { src: "/shared/logo.svg" });

const popover = () => document.querySelector<HTMLElement>(".image-fallback-hint-popover");
const image = (index = 0) => document.querySelectorAll<HTMLImageElement>("img")[index];
const pointer = (type: string, target: Element, relatedTarget: Element | null = null) =>
  target.dispatchEvent(
    new PointerEvent(type, { bubbles: true, pointerType: "mouse", relatedTarget }),
  );

let disable: () => void;

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = `<p><img src="${withLocation}" alt="Diagram"> <img src="${noLocation}" alt="Logo"> <img src="/real.png" alt="Real"></p><p id="other">Other</p>`;
});

afterEach(() => {
  disable?.();
  vi.useRealTimers();
});

describe("withHint / readHint", () => {
  it("round-trips a hint through a placeholder URL", () => {
    expect(readHint(withLocation)).toEqual({ src: "./diagram.png", file: "guide/api.md", line: 3 });
    expect(withLocation.startsWith(`${PLACEHOLDER}#image-fallback=`)).toBe(true);
  });

  it("returns null for a URL without a hint, or a damaged one", () => {
    expect(readHint("/real.png")).toBeNull();
    expect(readHint(`${PLACEHOLDER}#image-fallback=%7Bnope`)).toBeNull();
  });
});

describe("enableImageFallbackHints", () => {
  it("injects the outline, cursor and popover styles once", () => {
    disable = enableImageFallbackHints();
    enableImageFallbackHints()();
    const styles = document.querySelectorAll("#image-fallback-hint-style");
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toContain("outline: 2px dashed");
    expect(styles[0].textContent).toContain('img[src*="#image-fallback="]');
  });

  it("keeps only the touch rule with injectStyles: false", () => {
    disable = enableImageFallbackHints({ injectStyles: false });
    const css = document.getElementById("image-fallback-hint-style")!.textContent!;
    expect(css).toContain("cursor: pointer !important");
    expect(css).not.toContain("dashed");
  });

  it("opens a popover with the location and message on click, and closes it on a second click", () => {
    disable = enableImageFallbackHints();
    image().click();
    expect(popover()?.getAttribute("role")).toBe("tooltip");
    expect(popover()?.querySelector(".image-fallback-hint-popover-location")?.textContent).toBe(
      "guide/api.md, line 3",
    );
    expect(popover()?.querySelector("code")?.textContent).toBe("./diagram.png");
    expect(popover()?.textContent).toContain(
      "could not be found, so a placeholder is shown instead",
    );
    image().click();
    expect(popover()).toBeNull();
  });

  it("leaves out a missing location", () => {
    disable = enableImageFallbackHints();
    image(1).click();
    expect(popover()?.querySelector(".image-fallback-hint-popover-location")).toBeNull();
    expect(popover()?.querySelector("code")?.textContent).toBe("/shared/logo.svg");
  });

  it("ignores images that are not placeholders", () => {
    disable = enableImageFallbackHints();
    image(2).click();
    expect(popover()).toBeNull();
  });

  it("closes on a click elsewhere and on Escape", () => {
    disable = enableImageFallbackHints();
    image().click();
    document.getElementById("other")!.click();
    expect(popover()).toBeNull();

    image().click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(popover()).toBeNull();
  });

  it("opens on hover after the delay, and closes when the mouse leaves", () => {
    vi.useFakeTimers();
    disable = enableImageFallbackHints({ hoverDelay: 300 });
    pointer("pointerover", image());
    expect(popover()).toBeNull();
    vi.advanceTimersByTime(300);
    expect(popover()).not.toBeNull();
    pointer("pointerout", image(), document.getElementById("other"));
    expect(popover()).toBeNull();
  });

  it("does not open on hover with hover: false", () => {
    vi.useFakeTimers();
    disable = enableImageFallbackHints({ hover: false });
    pointer("pointerover", image());
    vi.advanceTimersByTime(1000);
    expect(popover()).toBeNull();
  });

  it("removes its listeners when disabled", () => {
    enableImageFallbackHints()();
    image().click();
    expect(popover()).toBeNull();
  });
});

describe("dev-server placeholders", () => {
  /** Answers HEAD requests like the dev server: `missing` URLs get the header. */
  function fakeServer(missing: Record<string, string>) {
    return vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      const headers = new Headers();
      if (missing[path]) headers.set("X-Image-Fallback", encodeURIComponent(missing[path]));
      return new Response(null, { status: 200, headers });
    });
  }

  /** Lets the HEAD requests and their handlers settle. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("marks an image the dev server answers as a placeholder, and explains it", async () => {
    const fetch = fakeServer({ "/guide/missing.png": "/guide/missing.png" });
    vi.stubGlobal("fetch", fetch);
    document.body.innerHTML = `<img src="/guide/missing.png" alt="Missing"> <img src="/real.png" alt="Real">`;
    const events: string[] = [];
    document.addEventListener("image-fallback", (e) => events.push((e as CustomEvent).detail.src));

    disable = enableImageFallbackHints({ devPlaceholders: true });
    await settle();

    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/guide\/missing\.png$/), {
      method: "HEAD",
      cache: "no-store",
    });
    expect(image().getAttribute("data-image-fallback")).toBe("/guide/missing.png");
    expect(isImageFallback(image())).toBe(true);
    expect(isImageFallback(image(1))).toBe(false);
    expect(events).toEqual(["/guide/missing.png"]);

    image().click();
    expect(popover()?.querySelector("code")?.textContent).toBe("/guide/missing.png");
  });

  it("checks images added or changed later, once per URL", async () => {
    const fetch = fakeServer({ "/b.png": "/b.png" });
    vi.stubGlobal("fetch", fetch);
    document.body.innerHTML = `<img src="/a.png">`;
    disable = enableImageFallbackHints({ devPlaceholders: true });
    await settle();
    expect(image().hasAttribute("data-image-fallback")).toBe(false);

    image().setAttribute("src", "/b.png");
    document.body.insertAdjacentHTML("beforeend", `<p><img src="/b.png"></p>`);
    await settle();
    await settle();
    expect(image(0).getAttribute("data-image-fallback")).toBe("/b.png");
    expect(image(1).getAttribute("data-image-fallback")).toBe("/b.png");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("skips data URIs, built placeholders and other origins", async () => {
    const fetch = fakeServer({});
    vi.stubGlobal("fetch", fetch);
    document.body.innerHTML = `<img src="${withLocation}"><img src="data:image/png;base64,AA=="><img src="https://elsewhere.example/x.png">`;
    disable = enableImageFallbackHints({ devPlaceholders: true });
    await settle();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("is off by default on a page the dev server didn't serve", async () => {
    const fetch = fakeServer({});
    vi.stubGlobal("fetch", fetch);
    disable = enableImageFallbackHints();
    await settle();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("is on by default on a page with the Vite client", async () => {
    const fetch = fakeServer({});
    vi.stubGlobal("fetch", fetch);
    document.head.innerHTML = `<script type="text/plain" src="/@vite/client"></script>`;
    disable = enableImageFallbackHints();
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
