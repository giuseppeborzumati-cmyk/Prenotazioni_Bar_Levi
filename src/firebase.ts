import { initializeApp } from "firebase/app";
import {
  getAuth,
  browserSessionPersistence,
  setPersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
  deleteUser,
} from "firebase/auth";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  getToken,
} from "firebase/app-check";
import { doc, getFirestore, setDoc, serverTimestamp } from "firebase/firestore";
import type {
  Catalog,
  CartLine,
  Order,
  Registration,
  Settings,
  SlotId,
  Snapshot,
} from "../shared/types";
export const firebaseConfig = {
  apiKey: "AIzaSyB8D59EUQ8xZmHKKqv0T7990aJAsryI1AQ",
  authDomain: "bar-prenotazione-levi.firebaseapp.com",
  projectId: "bar-prenotazione-levi",
  storageBucket: "bar-prenotazione-levi.firebasestorage.app",
  messagingSenderId: "680627424161",
  appId: "1:680627424161:web:86df1047e915c74d5759e0",
};
let runtime: ReturnType<typeof initialize> | undefined;
let staffSession = "";
function initialize() {
  const app = initializeApp(firebaseConfig);
  const check = import.meta.env.VITE_APP_CHECK_SITE_KEY
    ? initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(
          import.meta.env.VITE_APP_CHECK_SITE_KEY,
        ),
        isTokenAutoRefreshEnabled: true,
      })
    : null;
  return { auth: getAuth(app), db: getFirestore(app), check };
}
function rt() {
  return (runtime ??= initialize());
}
const base = String(import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
async function api(path: string, method = "GET", body?: unknown) {
  if (!base || !base.startsWith("https://"))
    throw new Error(
      "Il collegamento sicuro al server deve essere configurato. Consulta la guida di attivazione.",
    );
  const r = rt();
  await r.auth.authStateReady();
  const token = await r.auth.currentUser?.getIdToken();
  const appCheck = r.check ? (await getToken(r.check)).token : "";
  const response = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(staffSession ? { "X-Staff-Session": staffSession } : {}),
      ...(appCheck ? { "X-Firebase-AppCheck": appCheck } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    credentials: "omit",
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Servizio non disponibile. Riprova.");
  return data;
}
function friendly(error: unknown): never {
  const code = (error as { code?: string }).code;
  const messages: Record<string, string> = {
    "auth/invalid-credential": "Email o password non corretti.",
    "auth/email-already-in-use": "Esiste già un account con questa email.",
    "auth/weak-password": "La password non soddisfa i requisiti di sicurezza.",
    "auth/operation-not-allowed":
      "Attivare Email/Password nella console Firebase Authentication.",
    "auth/configuration-not-found":
      "Firebase Authentication non è ancora configurato.",
    "auth/too-many-requests": "Troppi tentativi. Attendi prima di riprovare.",
    "auth/unauthorized-domain":
      "Questo dominio deve essere autorizzato in Firebase Authentication.",
    "permission-denied":
      "Le regole Firebase devono essere pubblicate come indicato nella guida.",
  };
  throw new Error(
    messages[code || ""] ||
      (error instanceof Error ? error.message : "Operazione non riuscita."),
  );
}
export const live = {
  async bootstrap(): Promise<Snapshot> {
    return api("/bootstrap");
  },
  async signIn(email: string, password: string, otp = "") {
    try {
      const { auth } = rt();
      await setPersistence(auth, browserSessionPersistence);
      await signInWithEmailAndPassword(auth, email, password);
      if (!auth.currentUser?.emailVerified)
        throw new Error(
          "Verifica la tua email prima di accedere. Usa “Reinvia verifica” se necessario.",
        );
      const p = await api("/profile");
      if (["bar", "school_admin"].includes(p.role)) {
        if (!/^\d{6}$/.test(otp))
          throw new Error(
            "Inserisci il codice a 6 cifre del tuo autenticatore riservato.",
          );
        staffSession = (await api("/staff/session", "POST", { code: otp }))
          .token;
      }
    } catch (e) {
      friendly(e);
    }
  },
  async signOut() {
    staffSession = "";
    await signOut(rt().auth);
  },
  async register(r: Registration) {
    let newUser: import("firebase/auth").User | undefined;
    let saved = false;
    try {
      if (!r.accepted) throw new Error("Leggi e accetta le condizioni.");
      if (r.name.trim().length < 2 || r.name.length > 80)
        throw new Error("Inserisci nome e cognome validi.");
      if (r.password.length < 12) throw new Error("Usa almeno 12 caratteri.");
      if (
        r.requestedRole === "student" &&
        !/^[1-5][A-Z]{1,3}$/.test(r.className)
      )
        throw new Error("Classe non valida, per esempio 3L.");
      const { auth, db } = rt();
      await setPersistence(auth, browserSessionPersistence);
      const { user } = await createUserWithEmailAndPassword(
        auth,
        r.email.trim(),
        r.password,
      );
      newUser = user;
      await updateProfile(user, { displayName: r.name.trim() });
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        name: r.name.trim(),
        email: user.email,
        role: r.requestedRole,
        requestedRole: r.requestedRole,
        className: r.requestedRole === "student" ? r.className : "",
        staffCategory: r.requestedRole === "staff" ? r.staffCategory : "",
        approved: false,
        disabled: false,
        budgetCents: 2000,
        createdAt: serverTimestamp(),
      });
      saved = true;
      await sendEmailVerification(user);
      await signOut(auth);
      return "Account creato. Conferma la tua email e attendi l’approvazione della scuola.";
    } catch (e) {
      if (newUser && !saved) await deleteUser(newUser).catch(() => {});
      friendly(e);
    }
  },
  async resendVerification() {
    const u = rt().auth.currentUser;
    if (!u) throw new Error("Accedi prima con email e password.");
    await sendEmailVerification(u);
  },
  async resetPassword(email: string) {
    try {
      await sendPasswordResetEmail(rt().auth, email);
    } catch (e) {
      friendly(e);
    }
  },
  async barOrders(date: string): Promise<Order[]> {
    return api("/bar/orders?date=" + encodeURIComponent(date));
  },
  async availability(date: string) {
    return api("/availability?date=" + encodeURIComponent(date));
  },
  async order(body: {
    id: string;
    cart: CartLine[];
    date: string;
    slot: SlotId;
    paymentMethod: "counter" | "nexi";
    catalogVersion: number;
    termsVersion: string;
  }): Promise<Order> {
    return api("/orders", "POST", body);
  },
  async orderAction(id: string, action: string, code = "") {
    return api("/orders/" + id + "/action", "POST", { action, code });
  },
  async saveCatalog(c: Catalog) {
    return api("/catalog", "PUT", c);
  },
  async saveSettings(s: Settings) {
    return api("/settings", "PUT", s);
  },
  async userAction(uid: string, action: "approve" | "disable" | "enable") {
    return api("/users/" + encodeURIComponent(uid) + "/action", "POST", {
      action,
    });
  },
  async budget(cents: number) {
    return api("/budget", "PUT", { budgetCents: cents });
  },
  async resetDemo() {
    throw new Error("Disponibile solo nella demo.");
  },
  async nexi(id: string) {
    return api("/orders/" + id + "/payment", "POST", {});
  },
  async reconcile(id: string) {
    return api("/orders/" + id + "/reconcile", "POST", {});
  },
};
