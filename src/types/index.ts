export type JustagramConfig = {
  initialRoute: string;
  version: string;
};

export type LoadedAssets = {
  config: JustagramConfig;
  injectedScript: string;
};
