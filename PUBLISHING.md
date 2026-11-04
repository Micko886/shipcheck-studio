# Publish ShipCheck Studio to GitHub

The source package is prepared for a **public** repository. It is not automatically published by unpacking this ZIP.

## Suggested repository settings

- Repository name: `shipcheck-studio`
- Visibility: **Public**
- Short description: `Local-first website QA, SEO/GEO, accessibility and Lighthouse audits in a Chrome extension.`
- Topics: `chrome-extension`, `lighthouse`, `seo`, `accessibility`, `web-quality`, `playwright`, `local-first`
- License: **MIT for original ShipCheck code**, with separately licensed MPL-2.0 vendored axe-core (see third-party notices)

## Command-line publishing

1. Create an empty, **Public** repository named `shipcheck-studio` on your GitHub account; do **not** automatically add a README, .gitignore or license (they are included here).
2. In a terminal, enter the unzipped project folder and run:

```bash
git init -b main
git add .
git status --short
git commit -m "Initial public release: ShipCheck Studio v1.0.1"
git remote add origin https://github.com/YOUR_USERNAME/shipcheck-studio.git
git push -u origin main
```

3. After verifying public code and documentation, optionally create a GitHub Release tag:

```bash
git tag v1.0.1
git push origin v1.0.1
```

Alternatively, use GitHub Desktop to create and publish the repository from this folder.

## Before publishing

- Review `manifest.json` and optional domain permissions.
- Confirm any product name and icons are yours to publish.
- Confirm the MIT license matches your intended licensing policy.
- Do **not** upload local runner token files, reports, `.env` files, private screenshots or website/customer exports.
- Understand that this is a developer-preview release, with 53 automated tests passed but local Lighthouse end-to-end audit not verified in this environment.
