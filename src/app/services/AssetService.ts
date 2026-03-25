import type { JustagramConfig, LoadedAssets } from "../../types";
import { AppVersion } from "../generated/Version";

export class AssetService {
  private static readonly INJECTED_SCRIPT_PATH = "injected/js/utility_mode.js";
  private static readonly INITIAL_ROUTE = "/direct/inbox/";

  public static async loadAssets(): Promise<LoadedAssets | null> {
    try {
      const response = await fetch(this.INJECTED_SCRIPT_PATH, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Failed to load ${this.INJECTED_SCRIPT_PATH}`);
      }

      const config: JustagramConfig = {
        initialRoute: this.INITIAL_ROUTE,
        version: AppVersion,
      };

      return {
        config,
        injectedScript: await response.text(),
      };
    } catch (error) {
      console.error("[DistractionFreeDMs] Failed to load assets", error);
      alert(
        "Failed to load Distraction Free DMs assets. The app may not function correctly."
      );
      return null;
    }
  }
}
