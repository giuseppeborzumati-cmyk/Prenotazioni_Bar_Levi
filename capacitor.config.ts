import type { CapacitorConfig } from "@capacitor/cli";

// This package is deliberately a local demonstration. Real orders use the
// school's HTTPS PWA, preserving browser Auth, App Check and payment isolation.
const config: CapacitorConfig = {
  appId: "it.primolevi.intervallo.prova",
  appName: "Intervallo Prova",
  webDir: "dist",
  backgroundColor: "#172a25",
  server: { androidScheme: "https", cleartext: false },
  android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
  ios: { contentInset: "automatic", allowsLinkPreview: false },
};
export default config;
