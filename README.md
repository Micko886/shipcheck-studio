# ShipCheck Studio

**Local-first website QA, SEO/GEO/AEO checks, accessibility diagnostics, and optional local Lighthouse audits.**

ShipCheck Studio is a Chrome Manifest V3 extension for inspecting the quality of a website before release. The extension runs page and site checks locally in the browser. For Lighthouse performance, accessibility, best practices, and basic SEO scores, you can optionally run a separate **localhost-only** Node.js companion.

**Status: v1.0.1 preview / developer build.** The project has automated code tests, but full end-to-end Chrome permissions and real-world Lighthouse execution still require testing on your machine. Do not treat a successful scan as proof of indexing, accessibility conformance, or business-flow completion.

[简体中文说明 / Chinese documentation](README.zh-CN.md) · [Visual workspace notes](README-v1.0.1-VISUAL.md) · [Security policy](SECURITY.md)

## Features

- One-click bounded site crawl with page-level QA plus technical SEO, GEO/AEO-readiness heuristics, and accessibility checks.
- Detailed issues with affected selectors, evidence, explanations, and potential fixes.
- Visual workspace for reviewing available screenshots; a missing screenshot is reported as **not captured**, not fabricated.
- Navigation, layout, broken-resource, internal-link, canonical, hreflang, metadata, and structured-data checks within supported scan coverage.
- Optional local Lighthouse sampling on mobile and desktop via the companion runner; **no Google PageSpeed Insights API required**.
- Exportable reports and issue context for developer agents.

**Not provided:** verified Google indexing, actual AI-search citations, full business transaction testing, or a guaranteed WCAG compliance certificate. Deep AI reviews and third-party search APIs are opt-in and may transmit data to the provider you choose.

## Quick start

### 1. Browser extension (no server required)

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Select **Load unpacked**, then choose this repository folder (the folder containing `manifest.json`).
4. Open a website, click the ShipCheck icon, and use **Scan site**.

A site scan is bounded by discovered pages, browser permissions, and configured page limits. Unscanned or inaccessible URLs are not labeled as passing.

### 2. Optional local Lighthouse runner

Requires Node.js **22.19+** and Google Chrome/Chromium locally.

**Windows:** run `local-runner/start-windows.cmd`.

**macOS / Linux:**

```bash
cd local-runner
chmod +x start-mac-linux.sh
./start-mac-linux.sh
```

The companion downloads Lighthouse with npm the first time, then listens only on `127.0.0.1:48762`. A local token is generated in `local-runner/.shipcheck-token`; keep it private. Enter the token in the extension's **Speed / CWV** view to connect.

The browser extension works without the companion. Lighthouse cannot be run directly as an arbitrary Node.js process inside the extension's sandbox.

## Tests

```bash
node --test tests/*.test.cjs
# or
npm test
```

Automated unit and integration-mock tests do **not** constitute a full browser or production-environment audit.

## Project layout

| Path | Purpose |
|---|---|
| `manifest.json`, `src/background.js` | Chrome MV3 integration |
| `src/sidepanel/` | Main plugin UI |
| `src/content/` | Page inspection and accessibility bridge |
| `src/studio/` | Visual and technical issue workspace |
| `local-runner/` | Optional local Lighthouse HTTP companion |
| `mcp/` | Agent-oriented command and scan utilities |
| `tests/` | Automated tests and fixtures |
| `docs/legacy/` | Archived implementation notes (not necessarily active) |

## Privacy and permissions

- Normal scans execute in your browser and access the target website and its loaded resources.
- The optional Lighthouse process runs locally on your machine. It does not require a ShipCheck cloud account.
- `debugger` permission is optional and may trigger a Chrome warning if you enable multi-viewport captures.
- Some optional external-model and webmaster API integrations require separate consent and can send data to those services.
- Do **not** commit local runner tokens, `.env` files, scan exports, screenshots of private pages, or access credentials.

Read [SECURITY.md](SECURITY.md) before scanning sensitive websites. Scan only sites you own or have permission to assess.

## Contributing

Bug reports and PRs are welcome. Please follow [CONTRIBUTING.md](CONTRIBUTING.md). This is a preview release, so avoid relying on undocumented interfaces.

## License

The original ShipCheck source in this repository is released under the **MIT License**; see [LICENSE](LICENSE). The vendored `src/vendor/axe.min.js` is copyright Deque Systems and is licensed under **MPL-2.0**. It is **not** relicensed under MIT. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [licenses/MPL-2.0.txt](licenses/MPL-2.0.txt).
