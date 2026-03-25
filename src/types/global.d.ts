import type { JustagramConfig } from "./index";

declare global {
  interface Cordova {
    InAppBrowser: {
      open(url: string, target?: string, options?: string): InAppBrowser;
    };
  }

  interface InAppBrowser {
    addEventListener(eventname: string, callback: (event: any) => void): void;
    removeEventListener(eventname: string, callback: (event: any) => void): void;
    close(): void;
    show(): void;
    hide(): void;
    executeScript(details: { code?: string; file?: string }, callback?: (result: any) => void): void;
    insertScript(details: { code?: string; file?: string }, callback?: (result: any) => void): void;
    insertCSS(details: { code?: string; file?: string }, callback?: () => void): void;
  }

  interface Navigator {
    app: {
      exitApp(): void;
    };
  }

  interface Window {
    __JUSTAGRAM_CONFIG__?: JustagramConfig;
    cordova: Cordova;
  }

  var cordova: Cordova;
}

export {};
