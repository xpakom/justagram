import { StatusBar, Style } from '@capacitor/status-bar';

export class ThemeService {
  public static async init(): Promise<void> {
    if (typeof cordova !== 'undefined') {
      try {
        await StatusBar.setOverlaysWebView({ overlay: false });
        await StatusBar.setStyle({ style: Style.Dark });
      } catch (e) {
        console.warn(
          "[DistractionFreeDMs] StatusBar plugin not available or failed:",
          e
        );
      }
    }
  }
}
