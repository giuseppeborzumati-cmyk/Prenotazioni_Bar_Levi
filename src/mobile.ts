import { Capacitor } from "@capacitor/core";

export const isNative = Capacitor.isNativePlatform();
export const schoolSite = "https://bar-prenotazione-levi.web.app/";

export async function openSchoolSite() {
  if (isNative) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url: schoolSite, toolbarColor: "#172a25" });
  } else window.location.assign(schoolSite);
}

/** User-initiated export; native files stay in the application's private cache. */
export async function saveFile(name: string, blob: Blob) {
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  if (isNative) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import("@capacitor/filesystem"),
      import("@capacitor/share"),
    ]);
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () =>
        reject(new Error("Impossibile preparare il documento."));
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.readAsDataURL(blob);
    });
    const path = `intervallo/${safeName}`;
    const file = await Filesystem.writeFile({
      path,
      directory: Directory.Cache,
      data,
      recursive: true,
    });
    try {
      await Share.share({
        title: safeName,
        files: [file.uri],
        dialogTitle: "Salva o condividi il documento",
      });
    } catch (error) {
      if (!/cancel/i.test(String(error))) {
        window.alert(
          "Il documento non è stato condiviso. Riprova e scegli Salva su File o un’app disponibile.",
        );
      }
    } finally {
      // The receiving application has its own copy after the system share sheet.
      await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(
        () => undefined,
      );
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = safeName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function registerOfflinePage() {
  if (!import.meta.env.PROD || isNative || !("serviceWorker" in navigator))
    return;
  window.addEventListener(
    "load",
    () => {
      void navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}sw.js`)
        .catch(() => {
          /* Installation is optional; orders still use the network. */
        });
    },
    { once: true },
  );
}
