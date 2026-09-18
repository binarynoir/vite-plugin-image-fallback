# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `imageFallbackPlugin(options?)` — Vite plugin that swaps a relative/root-relative
  image import that doesn't resolve to a real file for a placeholder SVG, so a
  broken reference warns at build time instead of failing the whole build with
  a Rollup "could not resolve" error.
- Options: `extensions`, `fallback`, `silent`.
