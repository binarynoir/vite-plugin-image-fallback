# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-10-14

### Added

- Dev server: placeholder responses carry an `X-Image-Fallback` header with the missing path, and a `HEAD` request for a missing image is answered with it (never redirected)
- Hints in dev: `enableImageFallbackHints` finds the dev server's placeholders with one `HEAD` request per same-origin image URL (including images added later), marks them with a `data-image-fallback` attribute and an `image-fallback` event, and explains them with the same outline and popover as built ones. On by default on a page the Vite dev server served; set `devPlaceholders` to choose
- `isImageFallback(img)` from `/client`: whether an image is a placeholder, built or dev

## [0.3.0] - 2026-10-14

### Added

- Dev server: a request for a missing image that isn't an import (such as a Markdown image VitePress compiles to a plain URL) gets the placeholder, with the missing path drawn into it, instead of the page's HTML, and logs a warning naming the page that requested it

### Fixed

- A root-relative image in Vite's `publicDir` is left to Vite instead of being replaced by the placeholder, including when `publicDir` is outside the root
- An existing image is no longer turned into a virtual module that exported its raw source path, bypassing Vite's asset pipeline; every existing image is now left to Vite

## [0.2.0] - 2026-10-14

### Added

- Hints: `enableImageFallbackHints` from `@binarynoir/vite-plugin-image-fallback/client` outlines each placeholder and explains it in a popover on hover, click or tap, naming the missing import and the file and line that imported it
- `hints` option (default `true`): records that information in a `#image-fallback=…` fragment on the placeholder's URL; `false` uses `fallback` exactly as given

### Changed

- The build warning names the file and line that imported the missing image, and is logged once per missing import instead of once per build pass

### Fixed

- A relative import is resolved against the file that imported it, not the Vite root, so the warning names the path that was actually looked for

## [0.1.9] - 2026-10-14

### Changed

- README: list the Exclude, README Index and Broken Links plugins under More from BinaryNoir, and point documentation and website links to binarynoir.tech

## [0.1.8] - 2026-10-13

### Changed

- README: remove the binarynoir.github.io badge; the binarynoir.tech website badge remains

## [0.1.7] - 2026-10-13

### Changed

- README: add a Feedback and support section with links to report a bug, request a feature, or browse open issues
- README: add a More from BinaryNoir section with the BinaryNoir logo and links to the other plugins and command-line tools on [binarynoir.github.io](https://binarynoir.github.io)
- README: add a binarynoir.github.io badge

## [0.1.6] - 2026-10-08

### Changed

- Add a link to the documentation site in README

## [0.1.5] - 2026-10-06

### Changed

- Add support, author, and acknowledgments sections to README

## [0.1.4] - 2026-10-06

### Changed

- Add support and website badges to README

## [0.1.3] - 2026-09-21

### Changed

- Rewrote the README's introduction and feature summary for clarity.

## [0.1.2] - 2026-09-21

### Changed

- Updated dev dependencies to their latest compatible versions.

## [0.1.1] - 2026-09-21

### Changed

- **Breaking:** raised the minimum supported Node.js version from `>=20` to `>=22`. CI now tests against Node 22, 24, and 26, and releases publish on Node 26.

## [0.1.0] - 2026-09-18

### Added

- `imageFallbackPlugin(options?)` — Vite plugin that swaps a relative/root-relative
  image import that doesn't resolve to a real file for a placeholder SVG, so a
  broken reference warns at build time instead of failing the whole build with
  a Rollup "could not resolve" error.
- Options: `extensions`, `fallback`, `silent`.
