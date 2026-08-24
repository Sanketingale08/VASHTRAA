---
name: Bulk product image contract
description: Safe, browser-loadable image handling for spreadsheet product imports.
---

Bulk product imports must validate image values at the server write boundary without downloading arbitrary remote content. Accept normalized public product-image paths and remote URLs that are recognizably direct image assets (or established image-delivery endpoints); reject unsafe schemes and page/share links as row-level import failures.

**Why:** Spreadsheet examples can contain social-media page URLs, which persist successfully but cannot render as product images. Fetching a third-party URL during import would introduce SSRF, reliability, and licensing risks.

**How to apply:** Keep individual image-upload paths compatible with bulk imports, preserve ordered multi-image arrays, and use a shared browser fallback in every product image surface, including gallery lightboxes.