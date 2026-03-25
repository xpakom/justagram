(function utilityMode() {
  "use strict";

  const runtimeConfig = window.__JUSTAGRAM_CONFIG__;
  if (!runtimeConfig) {
    console.error("[JustAgram] Utility mode config is missing");
    return;
  }

  const activeConfig = runtimeConfig;
  const DEFAULT_RETURN_PATH = normalizePath(activeConfig.initialRoute);
  const VIEWER_BAR_ID = "justagram-utility-viewer-bar";
  const STYLE_ID = "justagram-utility-style";
  const DISCOVERY_PATTERNS = [
    /^\/$/,
    /^\/explore(?:\/|$)/,
    /^\/reels(?:\/|$)/,
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
  let viewerSession: { path: string; returnPath: string } | null = null;
  let lastUtilityPath = DEFAULT_RETURN_PATH;

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

  function isDiscoveryRoute(path: string): boolean {
    return DISCOVERY_PATTERNS.some((pattern) => pattern.test(path));
  }

  function isStoriesRoute(path: string): boolean {
    return path.startsWith("/stories/");
  }

  function isViewerRoute(path: string): boolean {
    return (
      /(?:^|\/)reel\/[^/]+\/?$/.test(path) ||
      /(?:^|\/)p\/[^/]+\/?$/.test(path) ||
      isStoriesRoute(path)
    );
  }

  function isProfileRoute(path: string): boolean {
    const segments = path.split("/").filter(Boolean);
    return segments.length === 1 && !["accounts", "direct", "explore", "reels"].includes(segments[0] ?? "");
  }

  function isReturnableUtilityRoute(path: string): boolean {
    return (
      path.startsWith("/direct/") ||
      path.startsWith("/create/") ||
      path.startsWith("/accounts/edit/") ||
      path.startsWith("/accounts/settings/") ||
      path.startsWith("/your_activity/") ||
      isProfileRoute(path)
    );
  }

  function hideElement(element: Element | null): void {
    if (!element || !(element instanceof HTMLElement)) {
      return;
    }

    if (element.id === VIEWER_BAR_ID) {
      return;
    }

    element.style.setProperty("display", "none", "important");
    element.setAttribute("data-justagram-hidden", "true");
  }

  function disableAnchor(anchor: HTMLAnchorElement): void {
    anchor.style.setProperty("pointer-events", "none", "important");
    anchor.style.setProperty("display", "none", "important");
    anchor.setAttribute("tabindex", "-1");
    anchor.setAttribute("aria-hidden", "true");
  }

  function closestDirectChild(parent: Element, node: Element | null): Element | null {
    let current = node;
    while (current && current.parentElement && current.parentElement !== parent) {
      current = current.parentElement;
    }
    return current && current.parentElement === parent ? current : null;
  }

  function injectBaseStyles(): void {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      html[data-justagram-viewer="locked"],
      body[data-justagram-viewer="locked"] {
        overscroll-behavior: none !important;
        overflow: hidden !important;
        touch-action: manipulation !important;
      }

      #${VIEWER_BAR_ID} {
        position: fixed;
        left: 12px;
        right: 12px;
        bottom: 12px;
        z-index: 2147483646;
        display: none;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 14px;
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 14px;
        background: rgba(15, 15, 15, 0.94);
        color: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.45);
      }

      #${VIEWER_BAR_ID}[data-visible="true"] {
        display: flex;
      }

      #${VIEWER_BAR_ID} .justagram-copy {
        min-width: 0;
        font-size: 13px;
        line-height: 1.35;
      }

      #${VIEWER_BAR_ID} .justagram-title {
        display: block;
        margin-bottom: 2px;
        font-weight: 600;
      }

      #${VIEWER_BAR_ID} button {
        border: 0;
        border-radius: 999px;
        padding: 10px 14px;
        background: #ffffff;
        color: #111111;
        font: inherit;
        font-weight: 600;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureViewerBar(): void {
    injectBaseStyles();

    let bar = document.getElementById(VIEWER_BAR_ID) as HTMLDivElement | null;
    if (!bar) {
      bar = document.createElement("div");
      bar.id = VIEWER_BAR_ID;
      bar.innerHTML = `
        <div class="justagram-copy">
          <span class="justagram-title">Utility mode</span>
          <span>Only this item stays available. Discovery and next items are blocked.</span>
        </div>
        <button type="button">Back to Direct</button>
      `;

      const button = bar.querySelector("button");
      button?.addEventListener("click", () => {
        redirectTo(viewerSession?.returnPath ?? DEFAULT_RETURN_PATH);
      });

      document.body.appendChild(bar);
    }

    bar.dataset.visible = "true";
  }

  function removeViewerBar(): void {
    const bar = document.getElementById(VIEWER_BAR_ID) as HTMLDivElement | null;
    if (bar) {
      bar.dataset.visible = "false";
    }
  }

  function setViewerLock(enabled: boolean): void {
    const value = enabled ? "locked" : "open";
    document.documentElement.dataset.justagramViewer = value;
    document.body.dataset.justagramViewer = value;
    if (enabled) {
      ensureViewerBar();
    } else {
      removeViewerBar();
    }
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
      hideElement(element.closest("a, button, li, div, section"));
    });

    document.querySelectorAll<HTMLElement>("nav button, [role='tablist'] button").forEach((button) => {
      const label = [
        button.getAttribute("aria-label"),
        button.getAttribute("title"),
        button.textContent,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (BLOCKED_NAV_LABELS.some((entry) => label.includes(entry))) {
        hideElement(button.closest("button, li, div"));
      }
    });
  }

  function sanitizeViewerDom(path: string): void {
    setViewerLock(true);
    stripGlobalDiscoveryEntrypoints();

    const main = document.querySelector("main");
    const article = main?.querySelector("article");
    const viewerRoot = main ? closestDirectChild(main, article ?? main.firstElementChild) : null;

    if (main && viewerRoot) {
      Array.from(main.children).forEach((child) => {
        if (child !== viewerRoot && child.id !== VIEWER_BAR_ID) {
          hideElement(child);
        }
      });
    }

    document.querySelectorAll<HTMLAnchorElement>("main a[href]").forEach((anchor) => {
      const anchorPath = getPathFromHref(anchor.getAttribute("href"));
      if (!anchorPath) {
        const href = anchor.getAttribute("href") ?? "";
        if (href.includes("threads.com")) {
          disableAnchor(anchor);
        }
        return;
      }

      const isOtherViewer = isViewerRoute(anchorPath) && anchorPath !== path;
      if (isOtherViewer || isDiscoveryRoute(anchorPath)) {
        disableAnchor(anchor);
        hideElement(anchor.closest("li, article, section, div"));
      }
    });

    document.querySelectorAll<HTMLElement>("button, [role='button']").forEach((button) => {
      const label = [
        button.getAttribute("aria-label"),
        button.getAttribute("title"),
        button.textContent,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (
        label.includes("next") ||
        label.includes("siguiente") ||
        label.includes("more posts") ||
        label.includes("reels")
      ) {
        hideElement(button.closest("button, div"));
      }
    });
  }

  function sanitizeNonViewerDom(): void {
    setViewerLock(false);
    stripGlobalDiscoveryEntrypoints();
  }

  function queueSanitize(): void {
    if (sanitizeQueued) {
      return;
    }

    sanitizeQueued = true;
    window.requestAnimationFrame(() => {
      sanitizeQueued = false;
      const path = normalizePath(window.location.pathname);
      if (viewerSession) {
        sanitizeViewerDom(path);
      } else {
        sanitizeNonViewerDom();
      }
    });
  }

  function redirectTo(path: string): void {
    const targetPath = normalizePath(path);
    if (normalizePath(window.location.pathname) === targetPath) {
      queueSanitize();
      return;
    }

    window.location.replace(new URL(targetPath, window.location.origin).toString());
  }

  function applyRoutePolicy(): void {
    const path = normalizePath(window.location.pathname);

    if (isDiscoveryRoute(path)) {
      viewerSession = null;
      setViewerLock(false);
      redirectTo(DEFAULT_RETURN_PATH);
      return;
    }

    if (isViewerRoute(path)) {
      if (!viewerSession) {
        viewerSession = {
          path,
          returnPath: lastUtilityPath,
        };
      } else if (viewerSession.path !== path) {
        redirectTo(viewerSession.returnPath);
        return;
      }

      sanitizeViewerDom(path);
      return;
    }

    viewerSession = null;
    if (isReturnableUtilityRoute(path)) {
      lastUtilityPath = path;
    }

    sanitizeNonViewerDom();
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
    document.addEventListener(
      "click",
      (event) => {
        const target = event.target instanceof HTMLElement ? event.target : null;
        const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
        if (!anchor) {
          return;
        }

        const href = anchor.getAttribute("href") ?? "";
        const anchorPath = getPathFromHref(href);

        if (!anchorPath && href.includes("threads.com")) {
          event.preventDefault();
          redirectTo(lastUtilityPath);
          return;
        }

        if (anchorPath && isDiscoveryRoute(anchorPath)) {
          event.preventDefault();
          redirectTo(lastUtilityPath);
          return;
        }

        if (
          viewerSession &&
          anchorPath &&
          isViewerRoute(anchorPath) &&
          anchorPath !== viewerSession.path
        ) {
          event.preventDefault();
          redirectTo(viewerSession.returnPath);
        }
      },
      true
    );

    document.addEventListener(
      "keydown",
      (event: KeyboardEvent) => {
        if (!viewerSession || isEditableTarget(event.target)) {
          return;
        }

        if (BLOCKED_KEYBOARD_KEYS.has(event.key)) {
          event.preventDefault();
        }
      },
      true
    );

    const stopViewerScroll = (event: Event) => {
      if (!viewerSession) {
        return;
      }

      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest(`#${VIEWER_BAR_ID}`)) {
        return;
      }

      event.preventDefault();
    };

    document.addEventListener("wheel", stopViewerScroll, {
      capture: true,
      passive: false,
    });
    document.addEventListener("touchmove", stopViewerScroll, {
      capture: true,
      passive: false,
    });
  }

  function installRouteHooks(): void {
    const originalPushState = history.pushState;
    history.pushState = function pushState(state, unused, url) {
      const result = originalPushState.apply(this, [state, unused, url]);
      queueMicrotask(applyRoutePolicy);
      return result;
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function replaceState(state, unused, url) {
      const result = originalReplaceState.apply(this, [state, unused, url]);
      queueMicrotask(applyRoutePolicy);
      return result;
    };

    window.addEventListener("popstate", applyRoutePolicy);
    window.addEventListener("hashchange", applyRoutePolicy);
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
