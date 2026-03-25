import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import packageJson from "../package.json";

const SRC_DIR = "src";
const WWW_DIR = "www";
const APP_DIR = join(SRC_DIR, "app");
const INJECTED_ENTRY = join(SRC_DIR, "injected", "ts", "utility_mode.ts");

async function build() {
  console.log("Starting build process...");

  await mkdir(join(APP_DIR, "generated"), { recursive: true });

  const version = packageJson.version;
  await Bun.write(
    join(APP_DIR, "generated", "Version.ts"),
    `export const AppVersion = "${version}";`
  );

  await rm(WWW_DIR, { recursive: true, force: true });
  await mkdir(join(WWW_DIR, "app", "js"), { recursive: true });
  await mkdir(join(WWW_DIR, "app", "css"), { recursive: true });
  await mkdir(join(WWW_DIR, "injected", "js"), { recursive: true });

  console.log("Bundling app shell...");
  const appBuild = await Bun.build({
    entrypoints: [join(APP_DIR, "main.ts")],
    outdir: join(WWW_DIR, "app", "js"),
    sourcemap: "none",
    minify: true,
    target: "browser",
  });
  if (!appBuild.success) {
    throw new Error("App shell build failed");
  }

  console.log("Bundling injected utility mode...");
  const injectedBuild = await Bun.build({
    entrypoints: [INJECTED_ENTRY],
    outdir: join(WWW_DIR, "injected", "js"),
    sourcemap: "none",
    minify: true,
    target: "browser",
  });
  if (!injectedBuild.success) {
    throw new Error("Injected bundle build failed");
  }

  console.log("Copying static assets...");
  await Bun.write(join(WWW_DIR, "index.html"), Bun.file(join(APP_DIR, "index.html")));
  await Bun.write(join(WWW_DIR, "app", "css", "style.css"), Bun.file(join(APP_DIR, "style.css")));

  console.log("Build complete.");
}

build().catch(console.error);
