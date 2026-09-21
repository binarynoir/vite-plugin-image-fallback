# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
