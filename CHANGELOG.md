# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-04

### Added

- `createInk(canvas, options)`: the ink background from nathanz.cloud as a
  framework-free function. It takes five colours (any CSS colour, including
  `var(--token)`), offers `calm` or `full` presence and a `still` mode, and
  returns `setColors`, `setPresence` and `destroy`.
- `InkBackground` React component (`@nathanzhou/ink-background/react`), with a
  gradient fallback where WebGL is unavailable.
- `PALETTES.light` and `PALETTES.dark`.
- Example page, unit tests, and an MIT license with a visible-credit condition.
