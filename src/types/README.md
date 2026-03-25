# Shared Types

The shell and injected contexts share only a minimal configuration contract now.

## Files

- `index.ts` defines `JustagramConfig` and `LoadedAssets`
- `global.d.ts` declares Cordova globals and `window.__JUSTAGRAM_CONFIG__`

## Current contract

```ts
type JustagramConfig = {
  initialRoute: string;
  version: string;
};
```

That is the full payload injected into Instagram before `utility_mode.js` runs.
