import type { JustagramConfig, LoadedAssets } from "../../types";

export class BrowserService {
  private static browser: InAppBrowser | null = null;

  private static readonly INSTAGRAM_URL = "https://www.instagram.com/direct/inbox/";
  private static readonly INSTAGRAM_ORIGIN = "https://www.instagram.com";
  private static readonly BROWSER_OPTIONS =
    "location=no,zoom=no,toolbar=no,footer=no,hardwareback=yes,fullscreen=no";

  public static async open(data: LoadedAssets | null): Promise<void> {
    if (!cordova?.InAppBrowser) {
      console.warn(
        "[JustAgram] InAppBrowser not available. Opening in new tab."
      );
      window.open(this.INSTAGRAM_URL, "_blank");
      return;
    }

    this.browser = cordova.InAppBrowser.open(
      this.INSTAGRAM_URL,
      "_blank",
      this.BROWSER_OPTIONS
    );

    this.setupEventListeners(data);
  }

  public static close(): void {
    if (this.browser) {
      this.browser.close();
      this.browser = null;
    }
  }

  private static setupEventListeners(data: LoadedAssets | null): void {
    if (!this.browser) return;

    this.browser.addEventListener("loadstop", (event: any) => {
      if (!data) {
        return;
      }

      const url = typeof event?.url === "string" ? event.url : "";
      if (!this.shouldInject(url)) {
        return;
      }

      this.injectConfig(data.config);
      this.injectScript(data.injectedScript);
    });

    this.browser.addEventListener("loaderror", (event: any) => {
      console.error("Failed to load Instagram:", event);
    });

    this.browser.addEventListener("exit", () => {
      navigator.app?.exitApp();
    });
  }

  private static shouldInject(url: string): boolean {
    try {
      return new URL(url).origin === this.INSTAGRAM_ORIGIN;
    } catch {
      return false;
    }
  }

  private static injectConfig(config: JustagramConfig): void {
    if (!this.browser) return;

    const configScript = `window.__JUSTAGRAM_CONFIG__ = ${JSON.stringify(config)};`;
    this.browser.insertScript({ code: configScript });
  }

  private static injectScript(script: string): void {
    if (!this.browser) return;

    this.browser.insertScript({ code: script });
  }
}
