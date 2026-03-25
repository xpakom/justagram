# Injected Utility Mode

`src/injected/ts/utility_mode.ts` is the only script injected into Instagram.

## Responsibilities

- Prefer `/direct/inbox/` as the default route
- Redirect blocked discovery routes such as `/`, `/explore/`, and `/reels/`
- Hide discovery entry points that remain in the DOM
- Allow a directly opened reel, post, or story to render once
- Prevent continuation into other viewer items by locking scroll and blocking route changes

## Explicit non-goals

- No `fetch` or `XMLHttpRequest` patching
- No traffic instrumentation or blocklists
- No analytics or data extraction
- No bridge back into the native app for settings or privileged actions

The only runtime input is `window.__JUSTAGRAM_CONFIG__`, injected by the app shell before the script runs.
