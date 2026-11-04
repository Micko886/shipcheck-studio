# Contributing

Thanks for helping improve ShipCheck Studio.

1. Open an issue with reproducible steps and an **anonymized** example URL or fixture.
2. Create a focused branch and keep behavioral changes small.
3. Add or update tests for any scanner, workspace or runner change.
4. Run `npm test` (Node.js 22.19+). Include results and any unsupported environment details in your PR.
5. Never commit tokens, credentials, production customer URLs, private screenshots, or exported scan reports.
6. Keep browser permissions minimal. Any additional permissions or external network requests must be documented.
7. Distinguish **passed / failed / not tested** when reporting audit results; avoid promises of indexing, traffic or WCAG certification.

Third-party code must retain its own attribution and license terms; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
