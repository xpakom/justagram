
import { AssetService } from './services/AssetService';
import { BrowserService } from './services/BrowserService';
import { ThemeService } from './services/ThemeService';

// Detect if running in a browser (no cordova) or native
if (typeof cordova !== 'undefined') {
  document.addEventListener("deviceready", onDeviceReady, false);
} else {
  // Fallback for browser testing
  console.log("[JustAgram] Running in browser mode (No Cordova)");
  // Small delay to ensure DOM is ready
  setTimeout(onDeviceReady, 500);
}

async function onDeviceReady(): Promise<void> {
  console.log("Device ready - Launching JustAgram");

  await ThemeService.init();

  const data = await AssetService.loadAssets();

  const launchBtn = document.getElementById("launch-btn");
  if (launchBtn) {
    launchBtn.addEventListener("click", () => {
      BrowserService.open(data);
    });
  }

  await BrowserService.open(data);
  ThemeService.enableButtons();
}
