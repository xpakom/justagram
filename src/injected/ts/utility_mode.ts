(function utilityMode() {
  "use strict";

  type RuntimeConfig = {
    initialRoute: string;
    version: string;
  };

  type UtilityMode = "utility" | "viewer" | "blocked";

  type ViewerSession = {
    initialPath: string;
    returnPath: string;
  };

  type RuntimeHandle = {
    cleanup(): void;
  };

  type RuntimeWindow = Window & {
    __JUSTAGRAM_CONFIG__?: RuntimeConfig;
    __JUSTAGRAM_UTILITY_RUNTIME__?: RuntimeHandle;
  };

  const runtimeWindow = window as RuntimeWindow;
  runtimeWindow.__JUSTAGRAM_UTILITY_RUNTIME__?.cleanup();

  const runtimeConfig = runtimeWindow.__JUSTAGRAM_CONFIG__;
  if (!runtimeConfig) {
    console.error("[JustAgram] Utility mode config is missing");
    return;
  }

  const activeConfig = runtimeConfig;
  const DEFAULT_RETURN_PATH = normalizePath(activeConfig.initialRoute);
  const STYLE_ID = "justagram-utility-style";
  const GUARD_ID = "justagram-utility-guard";
  const BLOCKED_ROUTE_PATTERNS = [
    /^\/$/,
    /^\/explore(?:\/|$)/,
    /^\/reels\/audio(?:\/|$)/,
  ];
  const BLOCKED_KEYBOARD_KEYS = new Set([
    "ArrowDown",
    "ArrowUp",
    "PageDown",
    "PageUp",
    "Home",
    "End",
    " ",
  ]);
  const BLOCKED_NAV_LABELS = [
    "home",
    "inicio",
    "explore",
    "buscar",
    "search",
    "reels",
  ];

  let observer: MutationObserver | null = null;
  let sanitizeQueued = false;
  let currentMode: UtilityMode = "utility";
  let viewerSession: ViewerSession | null = null;
  let lastUtilityPath = DEFAULT_RETURN_PATH;

  const cleanupCallbacks: Array<() => void> = [];

  runtimeWindow.__JUSTAGRAM_UTILITY_RUNTIME__ = {
    cleanup,
  };

  function normalizePath(pathOrUrl: string): string {
    try {
      const url = new URL(pathOrUrl, window.location.origin);
      const pathname = url.pathname || "/";
      return pathname === "/" || pathname.endsWith("/")
        ? pathname
        : `${pathname}/`;
    } catch {
      return pathOrUrl === "/" || pathOrUrl.endsWith("/")
        ? pathOrUrl
        : `${pathOrUrl}/`;
    }
  }

  function isBlockedRoute(path: string): boolean {
    return BLOCKED_ROUTE_PATTERNS.some((pattern) => pattern.test(path));
  }

  function isViewerRoute(path: string): boolean {
    return (
      /(?:^|\/)reel\/[^/]+\/?$/.test(path) ||
      /(?:^|\/)p\/[^/]+\/?$/.test(path) ||
      path.startsWith("/stories/") ||
      /^\/reels(?:\/|$)/.test(path)
    );
  }

  function isUtilityRoute(path: string): boolean {
    return !isBlockedRoute(path) && !isViewerRoute(path);
  }

  function registerCleanup(callback: () => void): void {
    cleanupCallbacks.push(callback);
  }

  function cleanup(): void {
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    while (cleanupCallbacks.length > 0) {
      const callback = cleanupCallbacks.pop();
      try {
        callback?.();
      } catch (error) {
        console.warn("[JustAgram] Cleanup callback failed", error);
      }
    }

    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(GUARD_ID)?.remove();
    delete document.documentElement.dataset.justagramMode;
    if (document.body) {
      delete document.body.dataset.justagramMode;
    }

    if (runtimeWindow.__JUSTAGRAM_UTILITY_RUNTIME__?.cleanup === cleanup) {
      delete runtimeWindow.__JUSTAGRAM_UTILITY_RUNTIME__;
    }
  }

  function hideElement(element: Element | null): void {
    if (!element || !(element instanceof HTMLElement)) {
      return;
    }

    if (element.id === GUARD_ID) {
      return;
    }

    element.style.setProperty("display", "none", "important");
    element.setAttribute("data-justagram-hidden", "true");
  }

  function injectBaseStyles(): void {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      html[data-justagram-mode="viewer"],
      html[data-justagram-mode="blocked"],
      body[data-justagram-mode="viewer"],
      body[data-justagram-mode="blocked"] {
        overscroll-behavior: none !important;
      }

      #${GUARD_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        display: none;
        pointer-events: none;
      }

      #${GUARD_ID}[data-visible="true"] {
        display: flex;
        pointer-events: auto;
      }

      #${GUARD_ID}[data-mode="viewer"] {
        align-items: flex-end;
        justify-content: center;
        padding: 18px 12px 20px;
        background:
          linear-gradient(to top, rgba(10, 10, 10, 0.34), rgba(10, 10, 10, 0));
      }

      #${GUARD_ID}[data-mode="blocked"] {
        align-items: center;
        justify-content: center;
        padding: 24px 18px;
        background: rgba(10, 10, 10, 0.84);
      }

      #${GUARD_ID} .justagram-panel {
        width: min(100%, 560px);
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        background: rgba(16, 16, 16, 0.94);
        color: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.42);
      }

      #${GUARD_ID}[data-mode="viewer"] .justagram-panel {
        padding: 12px 14px;
      }

      #${GUARD_ID}[data-mode="blocked"] .justagram-panel {
        padding: 18px 18px 16px;
      }

      #${GUARD_ID} .justagram-title {
        display: block;
        margin-bottom: 4px;
        font-size: 15px;
        font-weight: 700;
      }

      #${GUARD_ID} .justagram-copy {
        font-size: 13px;
        line-height: 1.45;
        color: rgba(255, 255, 255, 0.86);
      }

      #${GUARD_ID}[data-mode="viewer"] .justagram-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      #${GUARD_ID}[data-mode="viewer"] .justagram-copy {
        min-width: 0;
      }

      #${GUARD_ID} .justagram-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 14px;
      }

      #${GUARD_ID}[data-mode="viewer"] .justagram-actions {
        margin-top: 0;
      }

      #${GUARD_ID} button {
        border: 0;
        border-radius: 999px;
        padding: 10px 14px;
        font: inherit;
        font-weight: 600;
      }

      #${GUARD_ID} button[data-action="back"] {
        background: #ffffff;
        color: #111111;
      }

      #${GUARD_ID} button[data-action="direct"] {
        background: rgba(255, 255, 255, 0.08);
        color: #ffffff;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureGuard(): HTMLDivElement {
    injectBaseStyles();

    let guard = document.getElementById(GUARD_ID) as HTMLDivElement | null;
    if (!guard) {
      guard = document.createElement("div");
      guard.id = GUARD_ID;
      guard.innerHTML = '<div class="justagram-panel"></div>';

      const swallowPointer = (event: Event) => {
        if (currentMode === "utility") {
          return;
        }

        const target = event.target instanceof HTMLElement ? event.target : null;
        if (target?.closest("button")) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
      };

      guard.addEventListener("click", swallowPointer, true);
      guard.addEventListener("pointerdown", swallowPointer, true);
      guard.addEventListener(
        "touchstart",
        (event) => {
          if (currentMode !== "utility") {
            event.preventDefault();
          }
        },
        { capture: true, passive: false }
      );
      guard.addEventListener(
        "touchmove",
        (event) => {
          if (currentMode !== "utility") {
            event.preventDefault();
          }
        },
        { capture: true, passive: false }
      );
      guard.addEventListener(
        "wheel",
        (event) => {
          if (currentMode !== "utility") {
            event.preventDefault();
          }
        },
        { capture: true, passive: false }
      );

      document.body.appendChild(guard);
    }

    return guard;
  }

  function renderGuard(mode: UtilityMode): void {
    const guard = ensureGuard();
    const panel = guard.querySelector(".justagram-panel") as HTMLDivElement | null;
    if (!panel) {
      return;
    }

    if (mode === "utility") {
      guard.dataset.visible = "false";
      delete guard.dataset.mode;
      panel.replaceChildren();
      return;
    }

    guard.dataset.visible = "true";
    guard.dataset.mode = mode;

    if (mode === "viewer") {
      panel.innerHTML = `
        <div class="justagram-row">
          <div class="justagram-copy">
            <span class="justagram-title">Utility mode</span>
            <span>You can view this item, but gestures and onward discovery stay blocked.</span>
          </div>
          <div class="justagram-actions">
            <button type="button" data-action="back">Back</button>
            <button type="button" data-action="direct">Direct</button>
          </div>
        </div>
      `;
    } else {
      panel.innerHTML = `
        <div class="justagram-copy">
          <span class="justagram-title">Feed blocked</span>
          <span>This route is intentionally disabled to keep the app focused on messaging and explicit shares.</span>
        </div>
        <div class="justagram-actions">
          <button type="button" data-action="back">Go back</button>
          <button type="button" data-action="direct">Open Direct</button>
        </div>
      `;
    }

    panel.querySelector<HTMLButtonElement>('button[data-action="back"]')?.addEventListener("click", () => {
      navigateTo(mode === "viewer" ? viewerSession?.returnPath ?? lastUtilityPath : lastUtilityPath);
    });

    panel.querySelector<HTMLButtonElement>('button[data-action="direct"]')?.addEventListener("click", () => {
      navigateTo(DEFAULT_RETURN_PATH);
    });
  }

  function setMode(mode: UtilityMode): void {
    currentMode = mode;
    document.documentElement.dataset.justagramMode = mode;
    document.body.dataset.justagramMode = mode;
    renderGuard(mode);
  }

  function stripGlobalDiscoveryEntrypoints(): void {
    const navSelectors = [
      'nav a[href="/"]',
      'nav a[href="/explore/"]',
      'nav a[href="/reels/"]',
      '[role="tablist"] a[href="/"]',
      '[role="tablist"] a[href="/explore/"]',
      '[role="tablist"] a[href="/reels/"]',
      'a[href*="threads.com"]',
      'a[href*="/stories/highlights/"]',
    ];

    document.querySelectorAll(navSelectors.join(",")).forEach((element) => {
      hideElement(element.closest("a, button") ?? element);
    });

    document
      .querySelectorAll<HTMLElement>("nav button, [role='tablist'] button")
      .forEach((button) => {
        const label = [
          button.getAttribute("aria-label"),
          button.getAttribute("title"),
          button.textContent,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (BLOCKED_NAV_LABELS.some((entry) => label.includes(entry))) {
          hideElement(button);
        }
      });
  }

  function sanitizeUtilityDom(): void {
    setMode("utility");
    stripGlobalDiscoveryEntrypoints();

    document.querySelectorAll<HTMLAnchorElement>('a[href*="threads.com"]').forEach((anchor) => {
      hideElement(anchor);
    });
  }

  function sanitizeViewerDom(path: string): void {
    if (!viewerSession) {
      viewerSession = {
        initialPath: path,
        returnPath: lastUtilityPath,
      };
    }

    setMode("viewer");
    stripGlobalDiscoveryEntrypoints();
  }

  function sanitizeBlockedDom(): void {
    viewerSession = null;
    setMode("blocked");
    stripGlobalDiscoveryEntrypoints();
  }

  function queueSanitize(): void {
    if (sanitizeQueued) {
      return;
    }

    sanitizeQueued = true;
    window.requestAnimationFrame(() => {
      sanitizeQueued = false;
      applyRoutePolicy();
    });
  }

  function navigateTo(path: string): void {
    const targetPath = normalizePath(path || DEFAULT_RETURN_PATH);
    const targetUrl = new URL(targetPath, window.location.origin).toString();
    if (targetUrl === window.location.href) {
      queueSanitize();
      return;
    }

    window.location.assign(targetUrl);
  }

  function applyRoutePolicy(): void {
    const path = normalizePath(window.location.pathname);

    if (isViewerRoute(path)) {
      sanitizeViewerDom(path);
      return;
    }

    viewerSession = null;
    if (isUtilityRoute(path)) {
      lastUtilityPath = path;
      sanitizeUtilityDom();
      return;
    }

    sanitizeBlockedDom();
  }

  function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    return (
      target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT"
    );
  }

  function installNavigationGuards(): void {
    const clickHandler = (event: Event) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) {
        return;
      }

      const href = anchor.getAttribute("href") ?? "";
      if (!href.includes("threads.com")) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    };

    const keydownHandler = (event: KeyboardEvent) => {
      if (currentMode === "utility" || isEditableTarget(event.target)) {
        return;
      }

      if (BLOCKED_KEYBOARD_KEYS.has(event.key)) {
        event.preventDefault();
      }
    };

    document.addEventListener("click", clickHandler, true);
    document.addEventListener("keydown", keydownHandler, true);

    registerCleanup(() => {
      document.removeEventListener("click", clickHandler, true);
      document.removeEventListener("keydown", keydownHandler, true);
    });
  }

  function installRouteHooks(): void {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function pushState(...args) {
      const result = originalPushState.apply(this, args as Parameters<History["pushState"]>);
      queueMicrotask(queueSanitize);
      return result;
    };

    history.replaceState = function replaceState(...args) {
      const result = originalReplaceState.apply(this, args as Parameters<History["replaceState"]>);
      queueMicrotask(queueSanitize);
      return result;
    };

    window.addEventListener("popstate", queueSanitize);
    window.addEventListener("hashchange", queueSanitize);

    registerCleanup(() => {
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
      window.removeEventListener("popstate", queueSanitize);
      window.removeEventListener("hashchange", queueSanitize);
    });
  }

  function startObserver(): void {
    if (observer) {
      observer.disconnect();
    }

    observer = new MutationObserver(() => {
      queueSanitize();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    registerCleanup(() => {
      observer?.disconnect();
      observer = null;
    });
  }

  function init(): void {
    installNavigationGuards();
    installRouteHooks();
    startObserver();
    applyRoutePolicy();
    console.log(`[JustAgram] Utility mode active (v${activeConfig.version})`);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
