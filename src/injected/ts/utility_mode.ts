(function utilityMode() {
  "use strict";

  type RuntimeConfig = {
    initialRoute: string;
    version: string;
  };

  type RuntimeHandle = {
    cleanup(): void;
  };

  type PendingViewer = {
    at: number;
    sourcePath: string;
  };

  type ViewerSession = {
    path: string;
    returnPath: string;
    flexibleUntil: number;
  };

  type RuntimeWindow = Window & {
    __JUSTAGRAM_CONFIG__?: RuntimeConfig;
    __JUSTAGRAM_UTILITY_RUNTIME__?: RuntimeHandle;
  };

  const runtimeWindow = window as RuntimeWindow;
  runtimeWindow.__JUSTAGRAM_UTILITY_RUNTIME__?.cleanup();

  const runtimeConfig = runtimeWindow.__JUSTAGRAM_CONFIG__;
  if (!runtimeConfig) {
    console.error("[DistractionFreeDMs] Utility mode config is missing");
    return;
  }

  const activeConfig = runtimeConfig;
  const DEFAULT_RETURN_PATH = normalizePath(activeConfig.initialRoute);
  const STORAGE_LAST_DIRECT_KEY = "justagram.lastDirectPath";
  const STORAGE_PENDING_VIEWER_KEY = "justagram.pendingViewer";
  const STORAGE_ACTIVE_VIEWER_KEY = "justagram.activeViewer";
  const STYLE_ID = "justagram-utility-style";
  const VIEWER_BAR_ID = "justagram-utility-viewer-bar";
  const HIDDEN_NAV_REASON = "nav";
  const DISABLED_LINK_REASON = "direct-link";
  const VIEWER_CHROME_REASON = "viewer-chrome";
  const VIEWER_PENDING_TTL_MS = 15000;
  const VIEWER_CANONICALIZATION_TTL_MS = 5000;
  const BLOCKED_KEYBOARD_KEYS = new Set([
    "ArrowDown",
    "ArrowUp",
    "PageDown",
    "PageUp",
    "Home",
    "End",
    " ",
  ]);
  const AUTH_ROUTE_PATTERNS = [
    /^\/accounts(?:\/|$)/,
    /^\/challenge(?:\/|$)/,
    /^\/checkpoint(?:\/|$)/,
    /^\/session(?:\/|$)/,
    /^\/two_factor(?:\/|$)/,
    /^\/consent(?:\/|$)/,
  ];
  const DIRECT_ROUTE_PATTERN = /^\/direct(?:\/|$)/;
  const STRICT_VIEWER_PATTERNS = [
    /^\/reel\/[^/]+\/?$/,
    /^\/[^/]+\/reel\/[^/]+\/?$/,
    /^\/p\/[^/]+\/?$/,
    /^\/stories\/[^/].*$/,
    /^\/reels\/[^/]+\/?$/,
    /^\/share\/reel\/[^/]+\/?$/,
    /^\/share\/p\/[^/]+\/?$/,
  ];
  const TRANSIENT_VIEWER_PATTERNS = [/^\/reels\/?$/];

  let observer: MutationObserver | null = null;
  let sanitizeQueued = false;
  let viewerSession: ViewerSession | null = null;
  let lastDirectPath = readStoredString(STORAGE_LAST_DIRECT_KEY) ?? DEFAULT_RETURN_PATH;
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

  function readStoredString(key: string): string | null {
    try {
      return window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function writeStoredString(key: string, value: string): void {
    try {
      window.sessionStorage.setItem(key, value);
    } catch {
      // Ignore storage failures in private/ephemeral contexts.
    }
  }

  function removeStoredValue(key: string): void {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // Ignore storage failures.
    }
  }

  function readStoredJson<T>(key: string): T | null {
    const raw = readStoredString(key);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as T;
    } catch {
      removeStoredValue(key);
      return null;
    }
  }

  function writeStoredJson<T>(key: string, value: T): void {
    writeStoredString(key, JSON.stringify(value));
  }

  function isAuthRoute(path: string): boolean {
    return AUTH_ROUTE_PATTERNS.some((pattern) => pattern.test(path));
  }

  function isDirectRoute(path: string): boolean {
    return DIRECT_ROUTE_PATTERN.test(path);
  }

  function isStrictViewerRoute(path: string): boolean {
    return STRICT_VIEWER_PATTERNS.some((pattern) => pattern.test(path));
  }

  function isTransientViewerRoute(path: string): boolean {
    return TRANSIENT_VIEWER_PATTERNS.some((pattern) => pattern.test(path));
  }

  function isViewerCandidateRoute(path: string): boolean {
    return isStrictViewerRoute(path) || isTransientViewerRoute(path);
  }

  function isExternalHref(href: string | null | undefined): boolean {
    if (!href) {
      return false;
    }

    try {
      const url = new URL(href, window.location.origin);
      return url.origin !== window.location.origin;
    } catch {
      return false;
    }
  }

  function getPathFromHref(href: string | null | undefined): string {
    if (!href) {
      return "";
    }

    try {
      const url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin) {
        return "";
      }
      return normalizePath(url.pathname);
    } catch {
      return "";
    }
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
        console.warn("[DistractionFreeDMs] Cleanup callback failed", error);
      }
    }

    restoreMaskedElements(HIDDEN_NAV_REASON);
    restoreDisabledInteractions(DISABLED_LINK_REASON);
    restoreMaskedElements(VIEWER_CHROME_REASON);
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(VIEWER_BAR_ID)?.remove();
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

    if (element.id === VIEWER_BAR_ID) {
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

  function disableElementInteraction(
    element: Element | null,
    reason: string
  ): void {
    if (!element || !(element instanceof HTMLElement)) {
      return;
    }

    if (element.id === VIEWER_BAR_ID) {
      return;
    }

    element.style.setProperty("pointer-events", "none", "important");
    element.style.setProperty("cursor", "default", "important");
    element.dataset.justagramDisabled = reason;
    if (element instanceof HTMLAnchorElement) {
      element.setAttribute("tabindex", "-1");
      element.setAttribute("aria-disabled", "true");
    }
  }

  function restoreDisabledInteractions(reason: string): void {
    document
      .querySelectorAll<HTMLElement>(`[data-justagram-disabled="${reason}"]`)
      .forEach((element) => {
        element.style.removeProperty("pointer-events");
        element.style.removeProperty("cursor");
        delete element.dataset.justagramDisabled;
        if (element instanceof HTMLAnchorElement) {
          element.removeAttribute("tabindex");
          element.removeAttribute("aria-disabled");
        }
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
        left: 50%;
        bottom: 16px;
        z-index: 2147483646;
        display: none;
        align-items: center;
        justify-content: center;
        gap: 10px;
        transform: translateX(-50%);
        width: auto;
        max-width: calc(100vw - 24px);
        padding: 10px 12px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 999px;
        background: rgba(16, 16, 16, 0.94);
        color: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        box-shadow: 0 14px 36px rgba(0, 0, 0, 0.42);
      }

      #${VIEWER_BAR_ID}[data-visible="true"] {
        display: flex;
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
      <div class="justagram-actions">
        <button type="button" data-action="back">Back to messages</button>
      </div>
    `;

    bar.querySelector<HTMLButtonElement>('button[data-action="back"]')?.addEventListener("click", () => {
      navigateTo(viewerSession?.returnPath ?? lastDirectPath);
    });
  }

  function setMode(mode: "utility" | "viewer"): void {
    document.documentElement.dataset.justagramMode = mode;
    document.body.dataset.justagramMode = mode;
    renderViewerBar(mode === "viewer");
  }

  function hideGlobalNav(): void {
    restoreMaskedElements(HIDDEN_NAV_REASON);

    const selectors = [
      "nav",
      "header > div button[aria-label='Back']",
      "header > div button[aria-label='Atrás']",
      "header > div button[aria-label*='back' i]",
      "header > div button[aria-label*='atrás' i]",
      "[role='tablist']",
      'a[href="/explore/"]',
      'a[href="/reels/"]',
      'a[href*="threads.com"]',
      'a[href="/"]',
      'button[aria-label*="Home"]',
      'button[aria-label*="Inicio"]',
      'button[aria-label*="Explore"]',
      'button[aria-label*="Buscar"]',
      'button[aria-label*="Reels"]',
    ];

    document.querySelectorAll(selectors.join(",")).forEach((element) => {
      maskElement(element, HIDDEN_NAV_REASON);
    });
  }

  function persistLastDirectPath(path: string): void {
    lastDirectPath = normalizePath(path);
    writeStoredString(STORAGE_LAST_DIRECT_KEY, lastDirectPath);
  }

  function clearPendingViewer(): void {
    removeStoredValue(STORAGE_PENDING_VIEWER_KEY);
  }

  function storePendingViewer(): void {
    const pending: PendingViewer = {
      at: Date.now(),
      sourcePath: lastDirectPath,
    };
    writeStoredJson(STORAGE_PENDING_VIEWER_KEY, pending);
  }

  function loadPendingViewer(): PendingViewer | null {
    const pending = readStoredJson<PendingViewer>(STORAGE_PENDING_VIEWER_KEY);
    if (!pending) {
      return null;
    }

    if (Date.now() - pending.at > VIEWER_PENDING_TTL_MS) {
      clearPendingViewer();
      return null;
    }

    return {
      at: pending.at,
      sourcePath: normalizePath(pending.sourcePath || lastDirectPath),
    };
  }

  function clearActiveViewer(): void {
    viewerSession = null;
    removeStoredValue(STORAGE_ACTIVE_VIEWER_KEY);
  }

  function storeActiveViewer(session: ViewerSession): void {
    viewerSession = session;
    writeStoredJson(STORAGE_ACTIVE_VIEWER_KEY, session);
  }

  function loadActiveViewer(): ViewerSession | null {
    const active = readStoredJson<ViewerSession>(STORAGE_ACTIVE_VIEWER_KEY);
    if (!active) {
      return null;
    }

    return {
      path: normalizePath(active.path),
      returnPath: normalizePath(active.returnPath || lastDirectPath),
      flexibleUntil:
        typeof active.flexibleUntil === "number" ? active.flexibleUntil : 0,
    };
  }

  function sanitizeDirectDom(path: string): void {
    persistLastDirectPath(path);
    clearActiveViewer();
    restoreMaskedElements(VIEWER_CHROME_REASON);
    setMode("utility");
    hideGlobalNav();
    restoreDisabledInteractions(DISABLED_LINK_REASON);

    document.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
      if (anchor.closest(`#${VIEWER_BAR_ID}`)) {
        return;
      }

      const href = anchor.getAttribute("href") ?? "";
      const anchorPath = getPathFromHref(href);

      if (isExternalHref(href)) {
        disableElementInteraction(anchor, DISABLED_LINK_REASON);
        return;
      }

      if (!anchorPath) {
        return;
      }

      if (isDirectRoute(anchorPath) || isAuthRoute(anchorPath)) {
        return;
      }

      if (isViewerCandidateRoute(anchorPath)) {
        return;
      }

      disableElementInteraction(anchor, DISABLED_LINK_REASON);
    });
  }

  function sanitizeViewerDom(): void {
    restoreDisabledInteractions(DISABLED_LINK_REASON);
    setMode("viewer");
    hideGlobalNav();
    hideViewerChrome();
  }

  function redirectToDirect(): void {
    clearPendingViewer();
    clearActiveViewer();
    restoreDisabledInteractions(DISABLED_LINK_REASON);
    restoreMaskedElements(VIEWER_CHROME_REASON);
    navigateTo(lastDirectPath || DEFAULT_RETURN_PATH);
  }

  function hideViewerChrome(): void {
    if (window.location.pathname.includes('/reel/')) {
      return;
    }

    restoreMaskedElements(VIEWER_CHROME_REASON);

    document.querySelectorAll<HTMLElement>("body *").forEach((element) => {
      if (element.id === VIEWER_BAR_ID || element.closest(`#${VIEWER_BAR_ID}`)) {
        return;
      }

      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") {
        return;
      }

      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return;
      }

      const isBottomRegion =
        rect.bottom >= window.innerHeight - 8 &&
        rect.top >= window.innerHeight * 0.65;
      const isWideBottomChrome =
        isBottomRegion && rect.width >= window.innerWidth * 0.45;
      const isBottomCornerBubble =
        isBottomRegion &&
        rect.width <= 120 &&
        rect.height <= 120 &&
        rect.right >= window.innerWidth - 8;
      const isFixedChrome =
        (style.position === "fixed" || style.position === "sticky") &&
        rect.bottom >= window.innerHeight - 8 &&
        rect.height <= 160;

      const text = (element.getAttribute("aria-label") ?? "") +
        " " +
        (element.getAttribute("title") ?? "") +
        " " +
        (element.textContent ?? "");
      const loweredText = text.toLowerCase();
      const hasViewerNavHints =
        loweredText.includes("message") ||
        loweredText.includes("mensaje") ||
        loweredText.includes("profile") ||
        loweredText.includes("perfil");

      const href =
        element instanceof HTMLAnchorElement
          ? element.getAttribute("href") ?? ""
          : "";
      const leadsToUtilitySurface =
        href.includes("/direct/") ||
        href.includes("/explore/") ||
        href.includes("/reels/") ||
        /^\/[^/]+\/?$/.test(href);

      if (
        isFixedChrome ||
        isWideBottomChrome ||
        isBottomCornerBubble ||
        hasViewerNavHints ||
        leadsToUtilitySurface
      ) {
        maskElement(element, VIEWER_CHROME_REASON);
      }
    });
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

  function allowViewerRoute(path: string, returnPath: string): void {
    clearPendingViewer();
    storeActiveViewer({
      path: normalizePath(path),
      returnPath: normalizePath(returnPath),
      flexibleUntil: Date.now() + VIEWER_CANONICALIZATION_TTL_MS,
    });
    sanitizeViewerDom();
  }

  function applyRoutePolicy(): void {
    const path = normalizePath(window.location.pathname);

    if (isAuthRoute(path)) {
      clearActiveViewer();
      restoreMaskedElements(VIEWER_CHROME_REASON);
      setMode("utility");
      renderViewerBar(false);
      return;
    }

    if (isDirectRoute(path)) {
      clearPendingViewer();
      sanitizeDirectDom(path);
      return;
    }

    const activeViewer = loadActiveViewer();
    if (activeViewer && isViewerCandidateRoute(path)) {
      if (path === activeViewer.path) {
        viewerSession = activeViewer;
        sanitizeViewerDom();
        return;
      }

      if (Date.now() <= activeViewer.flexibleUntil) {
        allowViewerRoute(path, activeViewer.returnPath);
        return;
      }

      redirectToDirect();
      return;
    }

    const pendingViewer = loadPendingViewer();
    if (pendingViewer && isViewerCandidateRoute(path)) {
      allowViewerRoute(path, pendingViewer.sourcePath);
      return;
    }

    redirectToDirect();
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
      if (!target) {
        return;
      }

      const currentPath = normalizePath(window.location.pathname);
      const anchor = target.closest("a[href]") as HTMLAnchorElement | null;
      const interactive = target.closest(
        "button, [role='button'], [role='link']"
      ) as HTMLElement | null;

      if (isDirectRoute(currentPath) && interactive && !isEditableTarget(target)) {
        storePendingViewer();
      }

      if (!anchor) {
        return;
      }

      const href = anchor.getAttribute("href") ?? "";
      const anchorPath = getPathFromHref(href);

      if (isExternalHref(href)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (isDirectRoute(currentPath)) {
        if (!anchorPath) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        if (isDirectRoute(anchorPath) || isAuthRoute(anchorPath)) {
          return;
        }

        if (isViewerCandidateRoute(anchorPath)) {
          storePendingViewer();
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (viewerSession) {
        const insideViewerBar = target.closest(`#${VIEWER_BAR_ID}`);
        if (insideViewerBar) {
          return;
        }

        if (anchorPath && isDirectRoute(anchorPath)) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        navigateTo(viewerSession.returnPath);
      }
    };

    const keydownHandler = (event: KeyboardEvent) => {
      if (!viewerSession || isEditableTarget(event.target)) {
        return;
      }

      if (BLOCKED_KEYBOARD_KEYS.has(event.key)) {
        event.preventDefault();
      }
    };

    const motionHandler = (event: Event) => {
      if (!viewerSession) {
        return;
      }

      if (window.location.pathname.includes('/reel/')) {
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
      hideGlobalNav();
      if (viewerSession) {
        hideViewerChrome();
      }
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
    console.log(
      `[DistractionFreeDMs] Messages-only mode active (v${activeConfig.version})`
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
