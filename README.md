# vite-plugin-image-fallback

[![npm version](https://img.shields.io/npm/v/@binarynoir/vite-plugin-image-fallback.svg)](https://www.npmjs.com/package/@binarynoir/vite-plugin-image-fallback)
[![CI](https://github.com/binarynoir/vite-plugin-image-fallback/actions/workflows/ci.yml/badge.svg)](https://github.com/binarynoir/vite-plugin-image-fallback/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@binarynoir/vite-plugin-image-fallback.svg)](LICENSE)

A [Vite](https://vite.dev) plugin that stops one broken image from taking
down your whole build.

[Documentation and live demo](https://binarynoir.tech/plugins/image-fallback)

[![Support me on Buy Me a Coffee](https://img.shields.io/badge/Support%20me-Buy%20Me%20a%20Coffee-orange?style=for-the-badge&logo=buy-me-a-coffee)](https://buymeacoffee.com/binarynoir)
[![Support me on Ko-fi](https://img.shields.io/badge/Support%20me-Ko--fi-blue?style=for-the-badge&logo=ko-fi)](https://ko-fi.com/binarynoir)
[![More tools](https://img.shields.io/badge/Website-binarynoir.tech-8c8c8c?style=for-the-badge)](https://binarynoir.tech)

## What this does

If a page in your project imports an image that doesn't actually exist,
maybe a typo in the filename, a file someone forgot to add, or an asset that
got renamed, Vite normally stops the entire build with a Rollup "could not
resolve" error. Nobody's build finishes until that one image gets fixed.

This plugin catches that case instead. When an image import doesn't resolve
to a real file, it swaps in a placeholder image and prints a clear console
warning naming exactly which import is missing. Your build finishes, your
site still deploys, and you can go fix the actual image without everyone
else being blocked on it.

Every image that does exist is left completely alone and passed straight
through to Vite as usual. Only a genuinely missing one gets swapped.

## Install

```sh
npm install --save-dev @binarynoir/vite-plugin-image-fallback
```

## Usage

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { imageFallbackPlugin } from "@binarynoir/vite-plugin-image-fallback";

export default defineConfig({
  plugins: [imageFallbackPlugin()],
});
```

Only relative (`./foo.png`) and root-relative (`/foo.png`) image imports are
intercepted — bare package specifiers (`some-icon-package/icon.png`) are left
alone so they still go through normal `node_modules` resolution. An existing
file is untouched and passed straight through to Vite's own asset pipeline;
only an import that doesn't resolve to a real file gets swapped. A
root-relative import counts as existing if it is in Vite's root or in its
`publicDir`, wherever that is (VitePress's default `<srcDir>/public`, or an
absolute path outside the root).

## Dev server

In `vite dev` (and `vitepress dev`), not every image is an import. VitePress
compiles a Markdown image such as `![x](./assets/missing.png)` to a plain URL,
which the browser requests directly. Without this plugin, a missing image's
request gets the page's HTML back, and the browser shows its broken-image
icon.

The plugin answers those requests too. A request for an image that isn't in
the root or `publicDir` gets the placeholder, with the missing path drawn
into it, and logs the same warning, naming the page that requested it. A
custom `fallback` data URI is served as is; a custom `fallback` URL is
redirected to.

Every placeholder response carries an `X-Image-Fallback` header holding the
missing path (URI-encoded), and a `HEAD` request for a missing image gets a
`200` with that header (never a redirect). The `#image-fallback=` hint can't
be added to these URLs, so on a dev-server page the client script (see
[Hints](#hints)) asks the server about each image with a `HEAD` request
instead, and shows the same outline and popover.

## Options

| Option       | Default                                                    | Description                                                                                                                                   |
| ------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `extensions` | `["jpg", "jpeg", "png", "gif", "svg", "webp", "avif"]`     | File extensions (without the dot) treated as image imports.                                                                                   |
| `fallback`   | a plain gray placeholder SVG reading "Missing Image Asset" | The asset returned in place of a missing image — a data URI, or any string Vite can serve as a URL.                                           |
| `silent`     | `false`                                                    | Suppress the console warning normally emitted for each missing asset.                                                                         |
| `hints`      | `true`                                                     | Record which import was missing, and where, in each placeholder's URL, for the on-page hints below. `false` uses `fallback` exactly as given. |

```ts
imageFallbackPlugin({
  extensions: ["png", "jpg", "jpeg"],
  fallback: "/branding/placeholder.png",
  silent: false,
});
```

## Hints

Each placeholder can explain itself on the page, the same way
[Broken Links](https://binarynoir.tech/plugins/broken-links) and
[HTML Escape](https://binarynoir.tech/plugins/html-escape/) explain their
fixes. Turn the hints on in the browser, in VitePress from your theme's
`enhanceApp`:

```ts
// .vitepress/theme/index.ts
import DefaultTheme from "vitepress/theme";
import { enableImageFallbackHints } from "@binarynoir/vite-plugin-image-fallback/client";

export default {
  extends: DefaultTheme,
  enhanceApp() {
    enableImageFallbackHints();
  },
};
```

Every placeholder then gets a dashed outline. Hover it, or click or tap it,
for a popover that names the missing import and the file and line that
imported it:

```txt
plugins/image-fallback.md, line 19
./missing-image-demo.png could not be found, so a placeholder is shown
instead. Check the path and the file name, or add the image.
```

The build warning names the same file and line. The plugin records them in a
`#image-fallback=…` fragment on the placeholder's URL, which the browser
ignores when it loads the image, so the placeholder looks the same with or
without the client script.

`enableImageFallbackHints(options)` takes:

| Option            | Default                              | Description                                                                                                                    |
| ----------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `hover`           | `true`                               | Show the popover on mouse hover. `false` for click and tap only.                                                               |
| `hoverDelay`      | `300`                                | Milliseconds the mouse rests on a placeholder before the popover shows.                                                        |
| `injectStyles`    | `true`                               | Inject the default styles. `false` lets you style `img[src*="#image-fallback="]` and `img[data-image-fallback]` yourself.      |
| `devPlaceholders` | on a page the Vite dev server served | Find the dev server's placeholders with one `HEAD` request per same-origin image URL, including images added or changed later. |

On the dev server, each placeholder found gets a `data-image-fallback`
attribute holding the missing path, and fires a bubbling `image-fallback`
event whose `detail.src` is that path. To treat placeholders differently in
your own code, for example to skip them in a click-to-zoom handler, use
`isImageFallback(img)`. It is true for built placeholders, and for dev ones
once they have been found:

```ts
import { isImageFallback } from "@binarynoir/vite-plugin-image-fallback/client";

if (isImageFallback(img)) return; // nothing to zoom
```

The colors follow the VitePress theme and can be changed with the
`--image-fallback-hint-error` CSS variable.

## Why not just let the build fail?

For most application code, a missing asset failing the build is exactly the
right behavior — you want to know immediately. This plugin is aimed at
content-heavy sites (docs, blogs, CMS-driven pages) where hundreds of
Markdown/MDX pages reference images added by many different contributors, and
one bad reference in page 400 of 500 shouldn't block deploying the other 499.
It trades a hard failure for a loud warning plus a visibly-broken (but
visually obvious) placeholder.

## Releasing

Releases are tag-triggered. To ship a new version, from a clean `main` that's
in sync with `origin/main`:

```sh
npm run release:patch   # or release:minor / release:major
```

This runs typecheck/lint/test/build locally, then `npm version <bump>`
(bumps `package.json`, commits, and creates a matching `vX.Y.Z` tag) and
`git push --follow-tags`. Pushing that tag triggers
[`.github/workflows/release.yml`](.github/workflows/release.yml), which
re-runs the checks, publishes to npm (with
[provenance](https://docs.npmjs.com/generating-provenance-statements)), and
creates a GitHub release with auto-generated notes.

For a prerelease or an explicit version, use `npm run release -- <arg>`
(e.g. `npm run release -- 1.2.3` or `npm run release -- prerelease`) — see
[`npm version`](https://docs.npmjs.com/cli/v10/commands/npm-version) for the
full list of accepted values.

This requires an `NPM_TOKEN` repository secret (an npm
[automation token](https://docs.npmjs.com/creating-and-viewing-access-tokens)
with publish access) — set it under Settings → Secrets and variables →
Actions. First time publishing this package? See [PUBLISHING.md](PUBLISHING.md).

## License

[MIT](LICENSE)

---

## Feedback and support

Bug reports, feature requests and questions are all welcome. Please open them on this project's [GitHub issue tracker](https://github.com/binarynoir/vite-plugin-image-fallback/issues):

- **Found a bug?** [Report it](https://github.com/binarynoir/vite-plugin-image-fallback/issues/new?labels=bug&title=Bug%3A%20). Include your version and the steps to reproduce it.
- **Have an idea?** [Request a feature](https://github.com/binarynoir/vite-plugin-image-fallback/issues/new?labels=enhancement&title=Feature%20request%3A%20). Tell us what you are trying to do.
- **Something else?** [Browse open issues](https://github.com/binarynoir/vite-plugin-image-fallback/issues) to see if it has already been raised.

Pull requests are welcome too.

<!-- binarynoir:more:start (generated from binarynoir.github.io/products.json) -->

## More from BinaryNoir

<p align="center">
  <a href="https://binarynoir.tech">
    <img alt="BinaryNoir" src="https://binarynoir.tech/logo-horizontal.png" width="320">
  </a>
</p>

Image Fallback is one of a family of open-source tools from BinaryNoir.

**Pairs well with Image Fallback**

- [Optimize Images](https://binarynoir.tech/plugins/optimize-images): smaller images in the build output
- [Broken Links](https://binarynoir.tech/plugins/broken-links): dead links shown as text, not build errors

**New:** [Blog](https://binarynoir.tech/plugins/blog/): posts anywhere, a main blog and section blogs, with RSS feeds

**See them all:** VitePress plugins, Vite plugins, editor extensions and command-line tools, with documentation and live demos, at **[binarynoir.tech](https://binarynoir.tech)**.

<!-- binarynoir:more:end -->

## Author

John Smith III, [BinaryNoir](https://binarynoir.tech). Thanks to all contributors and users for their support and feedback.
