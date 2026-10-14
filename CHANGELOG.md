# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
