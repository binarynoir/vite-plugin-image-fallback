/// <reference lib="dom" />
// Browser-only: the one module that runs in the page, not at build time.
import { HINT_MARKER, readHint, type ImageFallbackHint } from "./hint.js";

export interface ImageFallbackHintOptions {
  /**
   * Show a placeholder's popover when the mouse hovers it, in addition to
   * click and tap. Set to `false` for click and tap only. Default: `true`.
   */
  hover?: boolean;
  /**
   * Milliseconds the mouse must rest on a placeholder before its popover
   * appears. Moving off it first cancels it, and a click opens it
   * immediately. Set to `0` to show it instantly. Default: `300`.
   */
  hoverDelay?: number;
  /**
   * Inject the default styles: the dashed outline, the `help` cursor and the
   * popover. Set to `false` to style placeholders (`img[src*="#image-fallback="]`)
   * and `.image-fallback-hint-popover` yourself. Default: `true`.
   */
  injectStyles?: boolean;
}

const SELECTOR = `img[src*="#${HINT_MARKER}"]`;
const STYLE_ID = "image-fallback-hint-style";

// Colors fall back to VitePress theme variables, then to neutral values, and
// can be overridden with the --image-fallback-hint-* variables.
const CSS = `
${SELECTOR} {
  cursor: help;
  outline: 2px dashed var(--image-fallback-hint-error, var(--vp-c-danger-1, #e5484d));
  outline-offset: 2px;
}
.image-fallback-hint-popover {
  position: absolute;
  z-index: 1000;
  box-sizing: border-box;
  max-width: min(24rem, calc(100vw - 1.5rem));
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--image-fallback-hint-popover-border, var(--vp-c-divider, #d0d0d0));
  border-left: 3px solid var(--image-fallback-hint-error, var(--vp-c-danger-1, #e5484d));
  border-radius: 8px;
  background: var(--image-fallback-hint-popover-bg, var(--vp-c-bg-elv, #fff));
  color: var(--image-fallback-hint-popover-fg, var(--vp-c-text-1, #222));
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  font-size: 0.875rem;
  line-height: 1.45;
}
.image-fallback-hint-popover-location {
  margin-bottom: 0.25rem;
  color: var(--vp-c-text-2, #666);
  font-size: 0.75rem;
}
.image-fallback-hint-popover code {
  padding: 0.1em 0.3em;
  border-radius: 4px;
  background: var(--vp-c-mute, rgba(127, 127, 127, 0.15));
  font-size: 0.85em;
}
`;

/** Explains a placeholder: what was missing, and how to fix it. */
export function imageFallbackMessage(hint: ImageFallbackHint): string {
  return `\`${hint.src}\` could not be found, so a placeholder is shown instead. Check the path and the file name, or add the image.`;
}

/** Appends `text` to `parent`, with each `…` span in backticks as a <code>. */
function appendWithCode(parent: HTMLElement, text: string): void {
  text.split("`").forEach((part, index) => {
    if (!part) return;
    if (index % 2 === 0) {
      parent.append(part);
      return;
    }
    const code = document.createElement("code");
    code.textContent = part;
    parent.append(code);
  });
}

/** "guide/api.md, line 12", or whichever of the two the hint carries. */
function locationText(hint: ImageFallbackHint): string {
  return [hint.file, hint.line && `line ${hint.line}`].filter(Boolean).join(", ");
}

/**
 * Outlines every placeholder image with a dashed line and explains it in a
 * popover, so readers know an image is missing and authors can see what to
 * fix. The plugin's `hints` option (on by default) records what to show.
 *
 * - **Mouse:** hover a placeholder to show it; click to pin it open.
 * - **Touch:** tap a placeholder to show it.
 * - Tap it again, tap elsewhere, scroll, or press Escape to dismiss.
 *
 * Call once in the browser, in VitePress from your theme's `enhanceApp`:
 *
 * ```ts
 * // .vitepress/theme/index.ts
 * import DefaultTheme from 'vitepress/theme';
 * import { enableImageFallbackHints } from '@binarynoir/vite-plugin-image-fallback/client';
 *
 * export default {
 *   extends: DefaultTheme,
 *   enhanceApp() {
 *     enableImageFallbackHints();
 *   },
 * };
 * ```
 *
 * Returns a function that removes the listeners and any open popover. Safe
 * to call during SSR: it does nothing without a `document`.
 */
export function enableImageFallbackHints(options: ImageFallbackHintOptions = {}): () => void {
  if (typeof document === "undefined" || typeof window === "undefined") return () => {};

  const { hover = true, hoverDelay = 300, injectStyles = true } = options;

  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    // iOS Safari only dispatches `click` for elements it considers clickable,
    // which a bare <img> isn't, and `cursor: pointer` opts it in. Only touch
    // screens need it, so it is scoped to them and kept with
    // `injectStyles: false`.
    style.textContent =
      `@media (hover: none), (pointer: coarse) {\n  ${SELECTOR} {\n    cursor: pointer !important;\n    -webkit-tap-highlight-color: transparent;\n  }\n}\n` +
      (injectStyles ? CSS : "");
    document.head.appendChild(style);
  }

  let popover: HTMLElement | null = null;
  let anchor: Element | null = null;
  let pinned = false;
  // A placeholder the mouse is resting on, waiting out `hoverDelay`.
  let pending: Element | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const close = (): void => {
    clearTimeout(timer);
    pending = null;
    popover?.remove();
    popover = null;
    anchor = null;
    pinned = false;
  };

  const open = (image: Element): void => {
    close();
    const hint = readHint(image.getAttribute("src") ?? "");
    if (!hint) return;
    anchor = image;

    const el = document.createElement("div");
    el.className = "image-fallback-hint-popover";
    el.setAttribute("role", "tooltip");
    const location = locationText(hint);
    if (location) {
      const where = document.createElement("div");
      where.className = "image-fallback-hint-popover-location";
      where.textContent = location;
      el.append(where);
    }
    const message = document.createElement("div");
    appendWithCode(message, imageFallbackMessage(hint));
    el.append(message);

    // Measure before placing: hidden but laid out.
    el.style.visibility = "hidden";
    document.body.appendChild(el);
    const rect = image.getBoundingClientRect();
    const margin = 8;
    const docWidth = document.documentElement.clientWidth;
    const left = Math.min(
      Math.max(rect.left + window.scrollX + rect.width / 2 - el.offsetWidth / 2, margin),
      Math.max(margin, docWidth - el.offsetWidth - margin) + window.scrollX,
    );
    // Prefer above the placeholder; flip below when there isn't room.
    const above = rect.top - el.offsetHeight - margin;
    const top = above >= margin ? above : rect.bottom + margin;
    el.style.left = `${left}px`;
    el.style.top = `${top + window.scrollY}px`;
    el.style.visibility = "";
    popover = el;
  };

  const placeholderFor = (event: Event): Element | null =>
    (event.target as Element | null)?.closest?.(SELECTOR) ?? null;

  const onClick = (event: Event): void => {
    const image = placeholderFor(event);
    if (!image) {
      // Clicks inside the popover (to select its text) keep it open.
      if (!popover?.contains(event.target as Node)) close();
      return;
    }
    // Clicking a pinned placeholder toggles it off; clicking one that is only
    // showing because of hover pins it open instead.
    if (image === anchor) {
      if (pinned) close();
      else pinned = true;
      return;
    }
    // A placeholder inside a link shouldn't navigate on the tap that reveals it.
    event.preventDefault();
    open(image);
    pinned = !!popover;
  };

  const onPointerOver = (event: Event): void => {
    // Touch and pen also emit pointer-over just before a tap; only a real
    // mouse hover should open on its own.
    if ((event as PointerEvent).pointerType !== "mouse" || pinned) return;
    const image = placeholderFor(event);
    if (!image || image === anchor || image === pending) return;
    if (hoverDelay <= 0) {
      open(image);
      return;
    }
    close();
    pending = image;
    timer = setTimeout(() => open(image), hoverDelay);
  };

  const onPointerOut = (event: Event): void => {
    const current = anchor ?? pending;
    if ((event as PointerEvent).pointerType !== "mouse" || pinned || !current) return;
    const next = (event as PointerEvent).relatedTarget as Node | null;
    if (next && current.contains(next)) return;
    close();
  };

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") close();
  };

  document.addEventListener("click", onClick);
  document.addEventListener("keydown", onKeydown);
  window.addEventListener("scroll", close, { passive: true });
  if (hover) {
    document.addEventListener("pointerover", onPointerOver);
    document.addEventListener("pointerout", onPointerOut);
  }

  return () => {
    close();
    document.removeEventListener("click", onClick);
    document.removeEventListener("keydown", onKeydown);
    window.removeEventListener("scroll", close);
    document.removeEventListener("pointerover", onPointerOver);
    document.removeEventListener("pointerout", onPointerOut);
  };
}
