import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "org.folio.reader",
  appName: "Folio",
  webDir: "dist",
  loggingBehavior: "none",
  server: { androidScheme: "https" },
  android: { allowMixedContent: false },
};
export default config;
