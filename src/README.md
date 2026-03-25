# Source Layout

The source tree now has two execution contexts and one injected entry point:

```text
src/
  app/         Capacitor shell that opens Instagram in InAppBrowser
  injected/    Single DOM-only utility script for instagram.com
  types/       Shared TypeScript types for the shell and injected script
```

## Build output

`bun run build` regenerates `www/` from scratch:

- `src/app/main.ts` -> `www/app/js/main.js`
- `src/injected/ts/utility_mode.ts` -> `www/injected/js/utility_mode.js`
- `src/app/index.html` -> `www/index.html`
- `src/app/style.css` -> `www/app/css/style.css`

## Current design

- The shell injects one minimal global, `window.__JUSTAGRAM_CONFIG__`.
- The injected script is responsible only for route control, DOM cleanup, and viewer locking.
- Network interception, injected menus, and app-webview message passing are intentionally removed.

Do not edit `www/` directly. Rebuild through `bun run build` or `bun run sync`.
