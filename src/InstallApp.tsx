import { useEffect, useState } from "react";
import { Download, ExternalLink, Smartphone, WifiOff } from "lucide-react";
import { isNative, openSchoolSite } from "./mobile";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [help, setHelp] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [installed, setInstalled] = useState(
    window.matchMedia("(display-mode: standalone)").matches,
  );
  useEffect(() => {
    const before = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const installedNow = () => {
      setInstalled(true);
      setPrompt(null);
    };
    const online = () => setOffline(!navigator.onLine);
    window.addEventListener("beforeinstallprompt", before);
    window.addEventListener("appinstalled", installedNow);
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    return () => {
      window.removeEventListener("beforeinstallprompt", before);
      window.removeEventListener("appinstalled", installedNow);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
    };
  }, []);
  return (
    <>
      {offline && (
        <div className="notice warning" role="status">
          <WifiOff size={20} />
          <span>
            Connessione assente. Le prenotazioni reali richiedono una conferma
            dal server. Nessun ordine viene inviato automaticamente al ritorno
            della rete.
          </span>
        </div>
      )}
      {isNative ? (
        <div className="install-card">
          <Smartphone size={22} />
          <div>
            <b>App di prova · dati solo su questo dispositivo</b>
            <p>
              Le prenotazioni della prova non arrivano al bar. Il servizio della
              scuola si apre separatamente quando sarà attivato.
            </p>
          </div>
          <button className="text-button" onClick={() => void openSchoolSite()}>
            Apri servizio scuola <ExternalLink size={16} />
          </button>
        </div>
      ) : (
        !installed && (
          <div className="install-card">
            <Smartphone size={22} />
            <div>
              <b>La tua pausa, anche dalla Home.</b>
              <p>Aggiungi Intervallo al telefono. Non serve uno store.</p>
            </div>
            <button
              className="text-button"
              onClick={async () => {
                if (prompt) {
                  await prompt.prompt();
                  await prompt.userChoice;
                  setPrompt(null);
                } else setHelp(!help);
              }}
            >
              <Download size={16} /> Installa app
            </button>
          </div>
        )
      )}
      {help && (
        <div className="notice" role="status">
          <Smartphone size={20} />
          <span>
            <b>iPhone:</b> apri in Safari, tocca Condividi, poi Aggiungi alla
            schermata Home e Apri come app web. <b>Android:</b> dal menu di
            Chrome scegli Installa app o Aggiungi a schermata Home.
          </span>
        </div>
      )}
    </>
  );
}

export function NativeService() {
  return (
    <main className="native-landing">
      <img src="./icons/icon-192.png" alt="" width="80" height="80" />
      <p className="eyebrow">INTERVALLO · BAR LEVI</p>
      <h1>Il servizio della scuola.</h1>
      <p>
        Accedi dal browser protetto per registrarti, prenotare e consultare i
        tuoi ordini. Il servizio richiede l’attivazione da parte della scuola.
      </p>
      <button className="button primary" onClick={() => void openSchoolSite()}>
        Apri il servizio <ExternalLink size={18} />
      </button>
      <p className="muted">
        Su iPhone e Android puoi anche aggiungere il sito alla schermata Home.
      </p>
    </main>
  );
}
