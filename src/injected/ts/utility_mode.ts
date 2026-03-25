(function utilityMode() {
  "use strict";

  type RuntimeConfig = {
    initialRoute: string;
    version: string;
  };

  type UtilityMode = "utility" | "viewer";

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
  const VIEWER_BAR_ID = "justagram-utility-viewer-bar";
  const EMPTY_STATE_ID = "justagram-utility-empty-state";
  const BLANK_MASK_REASON = "blank";
  const NAV_MASK_REASON = "nav";
  const HOME_ROUTE = /^\/$/;
  const BLANK_ROUTE_PATTERNS = [
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

  function isHomeRoute(path: string): boolean {
    return HOME_ROUTE.test(path);
  }

  function isBlankRoute(path: string): boolean {
    return BLANK_ROUTE_PATTERNS.some((pattern) => pattern.test(path));
  }

  function isViewerRoute(path: string): boolean {
    return (
      /(?:^|\/)reel\/[^/]+\/?$/.test(path) ||
      /(?:^|\/)p\/[^/]+\/?$/.test(path) ||
      path.startsWith("/stories/") ||
      /^\/reels(?:\/[^/]+)?\/?$/.test(path)
    );
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

    restoreMaskedElements(BLANK_MASK_REASON);
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(VIEWER_BAR_ID)?.remove();
    document.getElementById(EMPTY_STATE_ID)?.remove();
    delete document.documentElement.dataset.justagramMode;
    if (document.body) {
      delete document.body.dataset.justagramMode;
    }

    if (runtimeWindow.__JUSTAGRAM_UTILITY_RUNTIME__?.cleanup === cleanup) {
      delete runtimeWindow.__JUSTAGRAM_UTILITY_RUNTIME__;
    }
  }

  function maskElement(element: Element | null, reason: string): void {
    if (!element || !(element instanceof HTMLElement)) {
      return;
    }

    if (element.id === EMPTY_STATE_ID || element.id === VIEWER_BAR_ID) {
      return;
    }

    element.style.setProperty("display", "none", "important");
    element.dataset.justagramHidden = reason;
  }

  function restoreMaskedElements(reason: string): void {
    document
      .querySelectorAll<HTMLElement>(`[data-justagram-hidden="${reason}"]`)
      .forEach((element) => {
        element.style.removeProperty("display");
        delete element.dataset.justagramHidden;
      });
  }

  function injectBaseStyles(): void {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      html[data-justagram-mode="viewer"],
      body[data-justagram-mode="viewer"] {
        overscroll-behavior: none !important;
      }

      #${VIEWER_BAR_ID} {
        position: fixed;
        left: 12px;
        right: 12px;
        bottom: 16px;
        z-index: 2147483646;
        display: none;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 14px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 16px;
        background: rgba(16, 16, 16, 0.94);
        color: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.42);
      }

      #${VIEWER_BAR_ID}[data-visible="true"] {
        display: flex;
      }

      #${VIEWER_BAR_ID} .justagram-copy {
        min-width: 0;
        font-size: 13px;
        line-height: 1.45;
        color: rgba(255, 255, 255, 0.88);
      }

      #${VIEWER_BAR_ID} .justagram-title {
        display: block;
        margin-bottom: 4px;
        font-size: 15px;
        font-weight: 700;
        color: #ffffff;
      }

      #${VIEWER_BAR_ID} .justagram-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      #${VIEWER_BAR_ID} button {
        border: 0;
        border-radius: 999px;
        padding: 10px 14px;
        font: inherit;
        font-weight: 600;
      }

      #${VIEWER_BAR_ID} button[data-action="back"] {
        background: #ffffff;
        color: #111111;
      }

      #${VIEWER_BAR_ID} button[data-action="direct"] {
        background: rgba(255, 255, 255, 0.08);
        color: #ffffff;
      }

      #${EMPTY_STATE_ID} {
        margin: 24px auto;
        max-width: 560px;
        padding: 20px 18px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 18px;
        background: rgba(16, 16, 16, 0.92);
        color: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.3);
      }

      #${EMPTY_STATE_ID} .justagram-title {
        display: block;
        margin-bottom: 6px;
        font-size: 16px;
        font-weight: 700;
      }

      #${EMPTY_STATE_ID} .justagram-copy {
        font-size: 14px;
        line-height: 1.5;
        color: rgba(255, 255, 255, 0.88);
      }
    `;

    document.head.appendChild(style);
  }

  function ensureViewerBar(): HTMLDivElement {
    injectBaseStyles();

    let bar = document.getElementById(VIEWER_BAR_ID) as HTMLDivElement | null;
    if (!bar) {
      bar = document.createElement("div");
      bar.id = VIEWER_BAR_ID;
      document.body.appendChild(bar);
    }

    return bar;
  }

  function renderViewerBar(visible: boolean): void {
    const bar = ensureViewerBar();
    if (!visible) {
      bar.dataset.visible = "false";
      bar.replaceChildren();
      return;
    }

    bar.dataset.visible = "true";
    bar.innerHTML = `
      <div class="justagram-copy">
        <span class="justagram-title">Utility mode</span>
        <span>You can view the current item, but swipe-style continuation stays blocked.</span>
      </div>
      <div class="justagram-actions">
        <button type="button" data-action="back">Back</button>
        <button type="button" data-action="direct">Direct</button>
      </div>
    `;

    bar.querySelector<HTMLButtonElement>('button[data-action="back"]')?.addEventListener("click", () => {
      navigateTo(viewerSession?.returnPath ?? lastUtilityPath);
    });

    bar.querySelector<HTMLButtonElement>('button[data-action="direct"]')?.addEventListener("click", () => {
      navigateTo(DEFAULT_RETURN_PATH);
    });
  }

  function clearEmptyState(): void {
    restoreMaskedElements(BLANK_MASK_REASON);
    document.getElementById(EMPTY_STATE_ID)?.remove();
  }

  function applyEmptyState(kind: "home" | "explore"): void {
    clearEmptyState();
    injectBaseStyles();

    const main = document.querySelector("main") as HTMLElement | null;
    if (!main) {
      return;
    }

    Array.from(main.children).forEach((child) => {
      maskElement(child, BLANK_MASK_REASON);
    });

    const panel = document.createElement("div");
    panel.id = EMPTY_STATE_ID;
    panel.innerHTML = `
      <span class="justagram-title">${kind === "home" ? "Home feed hidden" : "Discovery hidden"}</span>
      <div class="justagram-copy">
        ${
          kind === "home"
            ? "The feed route stays available for utility navigation, but posts, stories, and endless recommendations are removed."
            : "Explore-style discovery stays disabled in this build."
        }
      </div>
    `;
    main.appendChild(panel);
  }

  function setMode(mode: UtilityMode): void {
    currentMode = mode;
    document.documentElement.dataset.justagramMode = mode;
    document.body.dataset.justagramMode = mode;
    renderViewerBar(mode === "viewer");
  }

  function stripLimitedNavEntrypoints(): void {
    const navSelectors = [
      'nav a[href="/explore/"]',
      'nav a[href="/reels/"]',
      '[role="tablist"] a[href="/explore/"]',
      '[role="tablist"] a[href="/reels/"]',
      'a[href*="threads.com"]',
    ];

    document.querySelectorAll(navSelectors.join(",")).forEach((element) => {
      maskElement(element.closest("a, button") ?? element, NAV_MASK_REASON);
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
          maskElement(button, NAV_MASK_REASON);
        }
      });
  }

  function sanitizeUtilityDom(): void {
    clearEmptyState();
    setMode("utility");
    stripLimitedNavEntrypoints();
  }

  function sanitizeViewerDom(path: string): void {
    clearEmptyState();
    if (!viewerSession || viewerSession.initialPath !== path) {
      viewerSession = {
        initialPath: path,
        returnPath: lastUtilityPath,
      };
    }

    setMode("viewer");
  }

  function sanitizeHomeDom(): void {
    viewerSession = null;
    lastUtilityPath = "/";
    setMode("utility");
    stripLimitedNavEntrypoints();
    applyEmptyState("home");
  }

  function sanitizeBlankRouteDom(): void {
    viewerSession = null;
    setMode("utility");
    stripLimitedNavEntrypoints();
    applyEmptyState("explore");
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

    if (isHomeRoute(path)) {
      sanitizeHomeDom();
      return;
    }

    if (isBlankRoute(path)) {
      sanitizeBlankRouteDom();
      return;
    }

    if (isViewerRoute(path)) {
      sanitizeViewerDom(path);
      return;
    }

    viewerSession = null;
    lastUtilityPath = path;
    sanitizeUtilityDom();
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
      if (currentMode !== "viewer" || isEditableTarget(event.target)) {
        return;
      }

      if (BLOCKED_KEYBOARD_KEYS.has(event.key)) {
        event.preventDefault();
      }
    };

    const motionHandler = (event: Event) => {
      if (currentMode !== "viewer") {
        return;
      }

      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest(`#${VIEWER_BAR_ID}`)) {
        return;
      }

      event.preventDefault();
    };

    document.addEventListener("click", clickHandler, true);
    document.addEventListener("keydown", keydownHandler, true);
    document.addEventListener("wheel", motionHandler, {
      capture: true,
      passive: false,
    });
    document.addEventListener("touchmove", motionHandler, {
      capture: true,
      passive: false,
    });

    registerCleanup(() => {
      document.removeEventListener("click", clickHandler, true);
      document.removeEventListener("keydown", keydownHandler, true);
      document.removeEventListener("wheel", motionHandler, true);
      document.removeEventListener("touchmove", motionHandler, true);
    });
  }

  function installRouteHooks(): void {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function pushState(...args) {
      const result = originalPushState.apply(
        this,
        args as Parameters<History["pushState"]>
      );
      queueMicrotask(queueSanitize);
      return result;
    };

    history.replaceState = function replaceState(...args) {
      const result = originalReplaceState.apply(
        this,
        args as Parameters<History["replaceState"]>
      );
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
