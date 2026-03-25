import { StatusBar, Style } from '@capacitor/status-bar';

export class ThemeService {
  public static async init(): Promise<void> {
    if (typeof cordova !== 'undefined') {
      try {
        await StatusBar.setOverlaysWebView({ overlay: false });
        await StatusBar.setStyle({ style: Style.Dark });
      } catch (e) {
        console.warn("[JustAgram] StatusBar plugin not available or failed:", e);
      }
    }
  }

  public static enableButtons(): void {
    const buttons = document.querySelectorAll("#launch-btn");
    buttons.forEach((btn) => {
      (btn as HTMLButtonElement).disabled = false;
    });

    const spinner = document.querySelector(".spinner");
    if (spinner) {
      (spinner as HTMLElement).style.display = "none";
    }

    const p = document.querySelector("p");
    if (p) {
      p.innerText = "Ready to launch";
    }
  }
}
