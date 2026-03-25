
import { AssetService } from './services/AssetService';
import { BrowserService } from './services/BrowserService';
import { ThemeService } from './services/ThemeService';

// Detect if running in a browser (no cordova) or native
if (typeof cordova !== 'undefined') {
  document.addEventListener("deviceready", onDeviceReady, false);
} else {
  // Fallback for browser testing
  console.log("[DistractionFreeDMs] Running in browser mode (No Cordova)");
  // Small delay to ensure DOM is ready
  setTimeout(onDeviceReady, 500);
}

async function onDeviceReady(): Promise<void> {
  console.log("Device ready - Launching Distraction Free DMs");

  await ThemeService.init();

  const data = await AssetService.loadAssets();

  await BrowserService.open(data);
}
