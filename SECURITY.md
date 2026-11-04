# Security and privacy

ShipCheck Studio scans webpages and can process URLs, DOM text, screenshots and diagnostic data. **Do not scan a private site without authorization.** A local-only runner does not mean a scan is fully offline: Chromium will still request the inspected website and its third-party resources.

## Reporting security issues

Before opening a public issue, reproduce the problem with sanitized data and avoid posting credentials, authentication cookies, URLs containing tokens, or private scan screenshots. If responsible disclosure is needed, ask the repository maintainer to establish a private reporting channel before sharing exploit details.

## Running safely

- The optional local runner binds only to `127.0.0.1` and requires a generated token. Treat that token as a secret.
- The extension may request optional access to website origins and Chrome debugger capabilities. Grant access only when needed.
- The local Lighthouse browser runs in a separate context and does not automatically reuse your signed-in Chrome profile.
- External model APIs and third-party webmaster integrations are opt-in; review the endpoint and data before enabling them.
- Reports can contain DOM information, URLs and screenshots. Keep them private when they capture sensitive material.

## Development hygiene

Use `.gitignore` for local secrets and outputs, rotate any token accidentally published, and review permission and network changes as part of code review.
