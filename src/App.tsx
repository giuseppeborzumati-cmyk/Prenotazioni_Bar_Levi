import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode, FormEvent } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Coffee,
  CreditCard,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Leaf,
  ListOrdered,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Menu,
  Minus,
  Package,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sprout,
  Trash2,
  UserRound,
  UsersRound,
  Wallet,
  X,
  RefreshCw,
  AlertCircle,
  UtensilsCrossed,
} from "lucide-react";
import type {
  Catalog,
  CartLine,
  DayLedger,
  Order,
  Product,
  Registration,
  Settings,
  SlotId,
  Snapshot,
} from "../shared/types";
import { ROLE_LABELS, STAFF_LABELS } from "../shared/types";
import {
  aggregateProducts,
  availableDates,
  blankLedger,
  dayName,
  DEFAULT_SETTINGS,
  ingredientNeeds,
  money,
  rome,
  SLOTS,
  validateDate,
} from "../shared/domain";
import { service, IS_DEMO } from "./api";
import { live } from "./firebase";
import { DEMO_ACCOUNTS } from "./demo";
import { downloadCSV, orderPDF, reportPDF } from "./documents";
import { parseExcel } from "./excel";
const EMPTY: Snapshot = {
  profile: null,
  products: [],
  ingredients: [],
  catalogVersion: 1,
  settings: DEFAULT_SETTINGS,
  orders: [],
  users: [],
  audit: [],
  nexiEnabled: false,
};
const STATUS: Record<string, string> = {
  confirmed: "Confermato",
  preparing: "In preparazione",
  ready: "Pronto al ritiro",
  collected: "Ritirato",
  cancelled: "Annullato",
};
const PAYMENT: Record<string, string> = {
  due: "Da pagare",
  pending: "In verifica",
  paid: "Pagato",
  refund_required: "Da rimborsare",
  refunded: "Rimborsato",
};
const IMG = (key: string) =>
  `${import.meta.env.BASE_URL}images/${key === "vegano" ? "caprese" : key}.jpg`;
type Page =
  | "catalog"
  | "orders"
  | "budget"
  | "bar"
  | "needs"
  | "catalog-admin"
  | "school"
  | "settings"
  | "documents";
function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty">
      <Coffee size={36} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="modal"
      aria-label={title}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Chiudi finestra"
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export default function App() {
  const [data, setData] = useState(EMPTY),
    [page, setPage] = useState<Page>("catalog"),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [auth, setAuth] = useState<"login" | "register" | null>(null),
    [mobile, setMobile] = useState(false);
  const [date, setDate] = useState(""),
    [slot, setSlot] = useState<SlotId>("prima"),
    [ledger, setLedger] = useState<DayLedger>(blankLedger()),
    [cart, setCart] = useState<CartLine[]>([]),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("Tutti"),
    [vegan, setVegan] = useState(false),
    [product, setProduct] = useState<Product | null>(null),
    [ticket, setTicket] = useState<Order | null>(null),
    [accepted, setAccepted] = useState(false),
    [method, setMethod] = useState<"counter" | "nexi">("counter");
  const attempt = useRef("");
  const notify = useCallback((text: string) => {
    setToast(text);
    setTimeout(() => setToast(""), 5500);
  }, []);
  const refresh = useCallback(async () => {
    try {
      const snap = await service.bootstrap();
      setData(snap);
      setDate((d) => d || availableDates(snap.settings)[0] || rome().date);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const onStorage = (e: StorageEvent) => {
      if (e.key === "levi-demo-v1") void refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refresh]);
  useEffect(() => {
    if (date)
      service
        .availability(date)
        .then(setLedger)
        .catch((e) => setError((e as Error).message));
  }, [date, data.orders, data.catalogVersion]);
  useEffect(() => {
    if (!date) return;
    try {
      validateDate(date, slot, data.settings);
    } catch {
      const alternative = slot === "prima" ? "seconda" : "prima";
      try {
        validateDate(date, alternative, data.settings);
        setSlot(alternative);
      } catch {
        /* retain unavailable selection with visible error */
      }
    }
  }, [date, slot, data.settings]);
  const run = async (fn: () => Promise<unknown>, message?: string) => {
    if (busy) return false;
    setBusy(true);
    try {
      await fn();
      await refresh();
      if (message) notify(message);
      return true;
    } catch (e) {
      notify((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const navigate = (next: Page) => {
    setPage(next);
    setMobile(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const returnChecked = useRef(false);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("order");
    if (
      IS_DEMO ||
      !data.profile ||
      returnChecked.current ||
      !id ||
      !/^[a-f0-9]{18}$/.test(id)
    )
      return;
    returnChecked.current = true;
    setPage("orders");
    service
      .reconcile(id)
      .then(() => refresh())
      .then(() => notify("Esito del pagamento verificato sul server."))
      .catch((e) => notify((e as Error).message));
    window.history.replaceState({}, "", import.meta.env.BASE_URL);
  }, [data.profile?.uid, refresh, notify]);
  const user = data.profile;
  const bar = user?.role === "bar",
    school = user?.role === "school_admin";
  const nav = [
    { id: "catalog", label: "Il menu", icon: UtensilsCrossed },
    { id: "orders", label: "Le mie prenotazioni", icon: ShoppingBag },
    { id: "budget", label: "Le mie spese", icon: Wallet },
    ...(bar
      ? [
          { id: "bar", label: "Coda e preparazioni", icon: ListOrdered },
          { id: "needs", label: "Fabbisogno e scorte", icon: Package },
          {
            id: "catalog-admin",
            label: "Catalogo ed Excel",
            icon: FileSpreadsheet,
          },
        ]
      : []),
    ...(school
      ? [
          { id: "school", label: "Account della scuola", icon: UsersRound },
          { id: "settings", label: "Regole del servizio", icon: Settings2 },
        ]
      : []),
    { id: "documents", label: "Documenti e aiuto", icon: BookOpen },
  ];
  const total = cart.reduce(
      (sum, l) =>
        sum +
        (data.products.find((p) => p.id === l.productId)?.priceCents || 0) *
          l.quantity,
      0,
    ),
    count = cart.reduce((n, l) => n + l.quantity, 0);
  const add = (p: Product, delta = 1) => {
    setCart((prev) => {
      const quantity =
        (prev.find((l) => l.productId === p.id)?.quantity || 0) + delta;
      const others = prev.filter((l) => l.productId !== p.id);
      if (quantity <= 0) return others;
      if (
        quantity > 10 ||
        others.reduce((n, l) => n + l.quantity, 0) + quantity > 20
      ) {
        notify("Massimo 10 pezzi per prodotto e 20 per ordine.");
        return prev;
      }
      if (quantity > p.dailyLimit - (ledger.counts[p.id] || 0)) {
        notify("La quantità supera la disponibilità del giorno.");
        return prev;
      }
      return [...others, { productId: p.id, quantity }];
    });
    attempt.current = "";
  };
  const checkout = async () => {
    if (!user) {
      setAuth("login");
      return;
    }
    if (!accepted) {
      notify("Conferma di aver letto ingredienti e condizioni.");
      return;
    }
    await run(async () => {
      attempt.current ||= crypto.randomUUID().replaceAll("-", "").slice(0, 18);
      const o = await service.order({
        id: attempt.current,
        cart,
        date,
        slot,
        paymentMethod: method,
        catalogVersion: data.catalogVersion,
        termsVersion: data.settings.termsVersion,
      });
      setCart([]);
      attempt.current = "";
      setAccepted(false);
      setTicket(o);
      if (method === "nexi") {
        const { url } = await service.nexi(o.id);
        window.location.assign(url);
      }
    }, "Prenotazione registrata. Il tuo codice è pronto.");
  };
  const slotError = (() => {
    try {
      validateDate(date, slot, data.settings);
      return "";
    } catch (e) {
      return (e as Error).message;
    }
  })();
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Vai al contenuto
      </a>
      <aside className={`sidebar ${mobile ? "is-open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("catalog");
          }}
        >
          <div className="brand-mark">
            <Coffee size={26} />
          </div>
          <div>
            <strong>
              intervallo<span>.</span>
            </strong>
            <small>IL BAR DEL PRIMO LEVI</small>
          </div>
        </a>
        <div className="sidebar-label">LA TUA PAUSA, ORGANIZZATA</div>
        <nav aria-label="Navigazione principale">
          {nav.map((n) => (
            <button
              key={n.id}
              className={page === n.id ? "active" : ""}
              onClick={() => navigate(n.id as Page)}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
              {n.id === "orders" && user && (
                <small>
                  {
                    data.orders.filter(
                      (o) => o.uid === user.uid && o.status !== "cancelled",
                    ).length
                  }
                </small>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="school-lockup">
            <img
              src={`${import.meta.env.BASE_URL}levi.png`}
              alt="Logo Primo Levi"
            />
            <div>
              <b>I.I.S. Primo Levi</b>
              <span>Seregno</span>
            </div>
          </div>
          <div className="sidebar-note">
            <Clock3 size={17} />
            <div>
              Due pause, un solo posto.
              <br />
              <b>09:45–09:55 · 12:45–13:00</b>
            </div>
          </div>
          <button className="help-link" onClick={() => navigate("documents")}>
            Come funziona <ArrowUpRight size={16} />
          </button>
        </div>
      </aside>
      {mobile && (
        <button
          className="sidebar-backdrop"
          aria-label="Chiudi menu"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-toggle"
              aria-label="Apri menu"
              onClick={() => setMobile(!mobile)}
            >
              <Menu />
            </button>
            <span className="breadcrumb">
              Bar Levi <ChevronRight size={15} />{" "}
              <b>{nav.find((n) => n.id === page)?.label}</b>
            </span>
          </div>
          <div className="topbar-actions">
            <span className="environment">
              <i />
              {IS_DEMO ? "DEMO INTERATTIVA" : "SERVIZIO SCOLASTICO"}
            </span>
            <button
              className="icon-button"
              aria-label="Aggiorna dati"
              onClick={() => void refresh()}
            >
              <RefreshCw size={18} />
            </button>
            {user ? (
              <>
                <button
                  className="profile-button"
                  onClick={() => navigate("budget")}
                >
                  <span className="avatar">
                    {user.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span>
                    <b>{user.name.split(" · ")[0]}</b>
                    <small>{ROLE_LABELS[user.role]}</small>
                  </span>
                </button>
                <button
                  className="icon-button"
                  aria-label="Esci"
                  onClick={() =>
                    void run(async () => {
                      await service.signOut();
                      setCart([]);
                      navigate("catalog");
                    })
                  }
                >
                  <LogOut size={18} />
                </button>
              </>
            ) : (
              <button
                className="button small primary"
                onClick={() => setAuth("login")}
              >
                <UserRound size={16} /> Accedi
              </button>
            )}
          </div>
        </header>
        {IS_DEMO && (
          <div className="demo-strip">
            <span>
              <span className="demo-dot" /> Ambiente dimostrativo: usa dati
              fittizi. Nessun pagamento reale.
            </span>
            <button onClick={() => setAuth("login")}>
              Prova i diversi ruoli <ArrowRight size={14} />
            </button>
          </div>
        )}
        <main id="main" className="content">
          {error && (
            <div role="alert" className="notice error">
              <AlertCircle size={20} />
              <span>{error}</span>
              <button className="text-button" onClick={() => void refresh()}>
                Riprova
              </button>
            </div>
          )}
          {loading ? (
            <div className="empty">
              <LoaderCircle className="spin" />
              <h2>Prepariamo la tua pausa…</h2>
            </div>
          ) : (
            <>
              {user && !user.approved && (
                <div className="notice warning">
                  <ShieldCheck size={20} />
                  <span>
                    Account in attesa di approvazione. Puoi consultare il
                    catalogo; le prenotazioni saranno disponibili dopo la
                    verifica della scuola.
                  </span>
                </div>
              )}
              {page === "catalog" && (
                <>
                  <section className="hero">
                    <div className="hero-copy">
                      <div className="eyebrow">
                        <span /> LA PAUSA CHE ASPETTAVI
                      </div>
                      <h1>
                        Qualcosa di buono.
                        <br />
                        <em>Già pronto per te.</em>
                      </h1>
                      <p>
                        Scegli, prenota e ritira nella tua pausa.
                        <br />
                        Puoi organizzarti anche dal giorno prima.
                      </p>
                      <div className="hero-pills">
                        <span>
                          <Clock3 size={15} /> Ritiro in fascia oraria
                        </span>
                        <span>
                          <Leaf size={15} /> Anche vegano
                        </span>
                      </div>
                    </div>
                    <div className="hero-visual">
                      <img
                        src={IMG("caprese")}
                        alt="Panini, immagine illustrativa del catalogo"
                      />
                      <div className="hero-overlay" />
                      <div className="hero-note">
                        <span className="note-icon">
                          <Check size={18} />
                        </span>
                        <div>
                          <b>La tua merenda, il tuo tempo.</b>
                          <small>Al banco basta il codice di ritiro</small>
                        </div>
                      </div>
                      <span className="hero-number">01 / LA TUA PAUSA</span>
                    </div>
                  </section>
                  <div className="booking-strip">
                    <div className="booking-title">
                      <CalendarDays size={22} />
                      <div>
                        <small>ORGANIZZA IL RITIRO</small>
                        <b>Quando ci vediamo?</b>
                      </div>
                    </div>
                    <label className="date-control">
                      <span>Giorno</span>
                      <select
                        aria-label="Giorno di ritiro"
                        value={date}
                        onChange={(e) => {
                          setDate(e.target.value);
                          attempt.current = "";
                        }}
                      >
                        {availableDates(data.settings).map((d) => (
                          <option key={d} value={d}>
                            {dayName(d)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="slot-buttons">
                      {(Object.keys(SLOTS) as SlotId[]).map((s) => (
                        <button
                          key={s}
                          className={slot === s ? "selected" : ""}
                          aria-pressed={slot === s}
                          onClick={() => {
                            setSlot(s);
                            attempt.current = "";
                          }}
                        >
                          <span>{SLOTS[s].label}</span>
                          <b>
                            {SLOTS[s].start}–{SLOTS[s].end}
                          </b>
                        </button>
                      ))}
                    </div>
                  </div>
                  {data.settings.notice && (
                    <div className="service-notice">
                      <Bell size={15} />
                      {data.settings.notice}
                    </div>
                  )}
                  <div className="catalog-layout">
                    <section className="catalog-area">
                      <div className="section-title">
                        <div>
                          <span className="eyebrow muted">
                            FATTO PER LA TUA GIORNATA
                          </span>
                          <h2>Cosa ti va oggi?</h2>
                        </div>
                        <span className="muted">
                          {data.products.filter((p) => p.active).length}{" "}
                          proposte
                        </span>
                      </div>
                      <div className="catalog-tools">
                        <div className="search-field">
                          <Search size={17} />
                          <input
                            aria-label="Cerca nel menu"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Cerca qualcosa di buono…"
                          />
                        </div>
                        <button
                          className={`filter-button ${vegan ? "selected" : ""}`}
                          onClick={() => setVegan(!vegan)}
                          aria-pressed={vegan}
                        >
                          <Leaf size={16} /> Vegano
                        </button>
                      </div>
                      <div
                        className="category-tabs"
                        role="group"
                        aria-label="Categorie"
                      >
                        {["Tutti", "Panini", "Focacce", "Dolci", "Bevande"].map(
                          (c) => (
                            <button
                              key={c}
                              className={category === c ? "active" : ""}
                              onClick={() => setCategory(c)}
                            >
                              {c}
                            </button>
                          ),
                        )}
                      </div>
                      <div className="products-grid">
                        {data.products
                          .filter(
                            (p) =>
                              p.active &&
                              (category === "Tutti" ||
                                p.category === category) &&
                              (!vegan || p.vegan) &&
                              (p.name + " " + p.description)
                                .toLowerCase()
                                .includes(search.toLowerCase()),
                          )
                          .map((p) => {
                            const left = Math.max(
                              0,
                              p.dailyLimit - (ledger.counts[p.id] || 0),
                            );
                            const qty =
                              cart.find((l) => l.productId === p.id)
                                ?.quantity || 0;
                            return (
                              <article className="product-card" key={p.id}>
                                <button
                                  className={`product-photo ${p.image === "vegano" ? "vegan-photo" : ""}`}
                                  aria-label={`Dettagli e allergeni: ${p.name}`}
                                  onClick={() => setProduct(p)}
                                >
                                  {p.image === "vegano" ? (
                                    <div className="vegan-art">
                                      <Sprout size={60} />
                                      <span>
                                        DALL’ORTO
                                        <br />
                                        ALLA TUA PAUSA
                                      </span>
                                    </div>
                                  ) : (
                                    <img
                                      src={IMG(p.image)}
                                      alt={p.name}
                                      loading="lazy"
                                    />
                                  )}
                                  {p.vegan && (
                                    <span className="vegan-tag">
                                      <Leaf size={12} /> Vegano
                                    </span>
                                  )}
                                  {left < 10 && (
                                    <span className="stock-tag">
                                      {left
                                        ? `${left} disponibili`
                                        : "Esaurito"}
                                    </span>
                                  )}
                                </button>
                                <div className="product-info">
                                  <span className="product-category">
                                    {p.category}
                                  </span>
                                  <h3>
                                    <button onClick={() => setProduct(p)}>
                                      {p.name}
                                    </button>
                                  </h3>
                                  <p>{p.description}</p>
                                  <button
                                    className="allergen-link"
                                    onClick={() => setProduct(p)}
                                  >
                                    Ingredienti e allergeni{" "}
                                    <ArrowUpRight size={12} />
                                  </button>
                                  <div className="product-bottom">
                                    <strong>{money(p.priceCents)}</strong>
                                    {qty ? (
                                      <div className="stepper">
                                        <button
                                          aria-label={`Rimuovi un ${p.name}`}
                                          onClick={() => add(p, -1)}
                                        >
                                          <Minus size={14} />
                                        </button>
                                        <b>{qty}</b>
                                        <button
                                          aria-label={`Aggiungi un ${p.name}`}
                                          disabled={!left || qty >= left}
                                          onClick={() => add(p)}
                                        >
                                          <Plus size={14} />
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        className="add-button"
                                        aria-label={`Aggiungi ${p.name}`}
                                        disabled={!left}
                                        onClick={() => add(p)}
                                      >
                                        <Plus size={19} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </article>
                            );
                          })}
                      </div>
                      <div className="catalog-foot">
                        <ShieldCheck size={16} />
                        <span>
                          Allergeni visibili prima dell’acquisto.{" "}
                          {IS_DEMO
                            ? "Ricette, prezzi e fotografie sono esempi da validare dal bar."
                            : "Chiedi al bar informazioni sulle possibili contaminazioni."}
                        </span>
                      </div>
                    </section>
                    <aside className="cart-panel">
                      <div className="cart-heading">
                        <div className="cart-icon">
                          <ShoppingBag size={20} />
                        </div>
                        <h2>La tua pausa</h2>
                        <span className="count-pill">{count}</span>
                      </div>
                      <p className="cart-subtitle">
                        Un piccolo piano per una buona giornata.
                      </p>
                      <div className="cart-date">
                        <CalendarDays size={16} />
                        <span>
                          {date ? dayName(date) : "Scegli il giorno"}
                          <b>
                            {SLOTS[slot].start}–{SLOTS[slot].end}
                          </b>
                        </span>
                      </div>
                      {cart.length ? (
                        <div className="cart-items">
                          {cart.map((l) => {
                            const p = data.products.find(
                              (p) => p.id === l.productId,
                            );
                            return p ? (
                              <div className="cart-item" key={l.productId}>
                                <div>
                                  <b>{p.name}</b>
                                  <small>{money(p.priceCents)} / pezzo</small>
                                  <div className="stepper">
                                    <button
                                      aria-label={`Meno ${p.name}`}
                                      onClick={() => add(p, -1)}
                                    >
                                      <Minus size={12} />
                                    </button>
                                    <span>{l.quantity}</span>
                                    <button
                                      aria-label={`Più ${p.name}`}
                                      onClick={() => add(p)}
                                    >
                                      <Plus size={12} />
                                    </button>
                                  </div>
                                </div>
                                <strong>
                                  {money(p.priceCents * l.quantity)}
                                </strong>
                              </div>
                            ) : null;
                          })}
                        </div>
                      ) : (
                        <div className="cart-empty">
                          <ShoppingBag size={29} />
                          <b>Il tuo carrello è ancora vuoto</b>
                          <span>Aggiungi la tua prima scelta dal menu.</span>
                        </div>
                      )}
                      <div className="cart-total">
                        <span>Totale</span>
                        <strong>{money(total)}</strong>
                      </div>
                      <label className="payment-option">
                        <input
                          type="radio"
                          name="payment"
                          checked={method === "counter"}
                          onChange={() => setMethod("counter")}
                        />
                        <CreditCard size={17} />
                        <span>
                          <b>Paga al ritiro</b>
                          <small>Con i metodi accettati dal bar</small>
                        </span>
                      </label>
                      <label
                        className={`payment-option ${!data.nexiEnabled ? "disabled" : ""}`}
                      >
                        <input
                          type="radio"
                          name="payment"
                          checked={method === "nexi"}
                          disabled={!data.nexiEnabled}
                          onChange={() => setMethod("nexi")}
                        />
                        <LockKeyhole size={17} />
                        <span>
                          <b>Nexi online</b>
                          <small>
                            {data.nexiEnabled
                              ? "Pagina di pagamento protetta"
                              : "Non attivo in questo ambiente"}
                          </small>
                        </span>
                      </label>
                      {cart.length > 0 && (
                        <label className="check-line consent">
                          <input
                            type="checkbox"
                            checked={accepted}
                            onChange={(e) => setAccepted(e.target.checked)}
                          />
                          <span>
                            Ho letto ingredienti, allergeni e{" "}
                            <button
                              onClick={() => navigate("documents")}
                              type="button"
                            >
                              condizioni del servizio
                            </button>
                            .
                          </span>
                        </label>
                      )}
                      {slotError && <p className="inline-error">{slotError}</p>}
                      <button
                        className="button primary checkout"
                        disabled={
                          !cart.length ||
                          busy ||
                          !!slotError ||
                          (!!user && !user.approved)
                        }
                        onClick={() => void checkout()}
                      >
                        {busy ? (
                          <LoaderCircle className="spin" size={18} />
                        ) : (
                          <ShoppingBag size={17} />
                        )}{" "}
                        {user
                          ? "Conferma con obbligo di pagare"
                          : "Accedi e prenota"}{" "}
                        {!busy && <ArrowRight size={17} />}
                      </button>
                      <p className="cart-fine">
                        <LockKeyhole size={12} /> Nessun dato di carta salvato
                        nel sito.
                      </p>
                      <div className="cart-tip">
                        <Sprout size={20} />
                        <span>
                          Prenotare ci aiuta a preparare il giusto e a ridurre
                          gli sprechi.
                        </span>
                      </div>
                    </aside>
                  </div>
                </>
              )}
              {page === "orders" && (
                <>
                  <PageTitle
                    eyebrow="TUTTO SOTTO CONTROLLO"
                    title="Le tue prenotazioni"
                    description="Controlla lo stato, conserva il codice e organizza il ritiro."
                  />
                  {!user ? (
                    <Empty title="La tua pausa inizia da qui">
                      <button
                        className="button primary"
                        onClick={() => setAuth("login")}
                      >
                        Accedi al tuo account
                      </button>
                    </Empty>
                  ) : (
                    <div className="orders-list">
                      {data.orders.filter((o) => o.uid === user.uid).length ? (
                        data.orders
                          .filter((o) => o.uid === user.uid)
                          .map((o) => (
                            <OrderCard
                              key={o.id}
                              order={o}
                              onTicket={() => setTicket(o)}
                              onCancel={() => {
                                if (confirm("Annullare questa prenotazione?"))
                                  void run(
                                    () => service.orderAction(o.id, "cancel"),
                                    "Prenotazione annullata.",
                                  );
                              }}
                              onPay={() =>
                                void run(async () => {
                                  const r = await service.nexi(o.id);
                                  window.location.assign(r.url);
                                })
                              }
                              onReconcile={() =>
                                void run(
                                  () => service.reconcile(o.id),
                                  "Esito del pagamento aggiornato.",
                                )
                              }
                              onReorder={() => {
                                setCart(
                                  o.lines
                                    .map((l) => ({
                                      productId: l.productId,
                                      quantity: l.quantity,
                                    }))
                                    .filter((l) =>
                                      data.products.some(
                                        (p) => p.id === l.productId && p.active,
                                      ),
                                    ),
                                );
                                setAccepted(false);
                                navigate("catalog");
                                notify(
                                  "Controlla prezzi, disponibilità e allergeni aggiornati prima di confermare.",
                                );
                              }}
                            />
                          ))
                      ) : (
                        <Empty title="Nessuna prenotazione, per ora">
                          La prossima buona pausa ti aspetta nel menu.
                        </Empty>
                      )}
                    </div>
                  )}
                </>
              )}
              {page === "budget" && (
                <>
                  <PageTitle
                    eyebrow="IL TUO ACCOUNT"
                    title="Una pausa consapevole"
                    description="Il riepilogo delle tue spese è visibile soltanto a te."
                  />
                  {user ? (
                    <Budget
                      data={data}
                      onSave={(c) =>
                        void run(() => service.budget(c), "Budget aggiornato.")
                      }
                    />
                  ) : (
                    <Empty title="Accedi per vedere le tue spese">
                      <button
                        className="button primary"
                        onClick={() => setAuth("login")}
                      >
                        Accedi
                      </button>
                    </Empty>
                  )}
                </>
              )}
              {page === "bar" && bar && (
                <Bar data={data} busy={busy} run={run} onTicket={setTicket} />
              )}
              {page === "needs" && bar && (
                <Needs
                  data={data}
                  onSave={(c) =>
                    run(() => service.saveCatalog(c), "Giacenze aggiornate.")
                  }
                />
              )}
              {page === "catalog-admin" && bar && (
                <CatalogAdmin data={data} run={run} notify={notify} />
              )}
              {page === "school" && school && <School data={data} run={run} />}
              {page === "settings" && school && (
                <ServiceSettings data={data} run={run} />
              )}
              {page === "documents" && (
                <Documents
                  data={data}
                  notify={notify}
                  reset={() =>
                    void run(async () => {
                      await service.resetDemo();
                      setCart([]);
                      navigate("catalog");
                    }, "Demo reimpostata.")
                  }
                />
              )}
            </>
          )}
        </main>
        <footer className="footer">
          <span>
            intervallo. <span>Una buona pausa al Primo Levi.</span>
          </span>
          <button onClick={() => navigate("documents")}>
            Privacy · Allergeni · Assistenza
          </button>
        </footer>
      </div>
      {toast && (
        <div role="status" className="toast">
          <CheckCircle2 size={19} />
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="Chiudi avviso"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {auth && (
        <AuthModal
          tab={auth}
          onTab={setAuth}
          onClose={() => setAuth(null)}
          onSuccess={async () => {
            await refresh();
            setAuth(null);
            notify("Accesso effettuato.");
          }}
          notify={notify}
        />
      )}
      {product && (
        <Modal title={product.name} onClose={() => setProduct(null)}>
          <div className="product-detail">
            <Badge tone={product.vegan ? "green" : "neutral"}>
              {product.vegan ? "Ricetta vegana" : product.category}
            </Badge>
            <p>{product.description}</p>
            <h3>Ingredienti della ricetta</h3>
            <p>{product.ingredientNames?.join(", ") || product.description}</p>
            <h3>Allergeni dichiarati</h3>
            <div className="tags">
              {product.allergens.length ? (
                product.allergens.map((a) => (
                  <Badge tone="amber" key={a}>
                    {a}
                  </Badge>
                ))
              ) : (
                <span>Nessun allergene dichiarato nella ricetta.</span>
              )}
            </div>
            {product.traces.length > 0 && (
              <p>
                <b>Possibili tracce:</b> {product.traces.join(", ")}.
              </p>
            )}
            <div className="notice warning">
              <AlertCircle size={19} />
              <span>
                Vegano non significa privo di allergeni. Per esigenze alimentari
                contatta il bar prima di ordinare.{" "}
                {IS_DEMO && "Questa scheda contiene dati di esempio."}
              </span>
            </div>
            <div className="detail-bottom">
              <strong>{money(product.priceCents)}</strong>
              <button
                className="button primary"
                onClick={() => {
                  add(product);
                  setProduct(null);
                }}
              >
                Aggiungi alla tua pausa <Plus size={17} />
              </button>
            </div>
          </div>
        </Modal>
      )}
      {ticket && (
        <Modal title="La tua prenotazione" onClose={() => setTicket(null)}>
          <div className="ticket">
            <div className="ticket-check">
              <Check size={28} />
            </div>
            <span className="eyebrow muted">NUMERO DI RITIRO</span>
            <strong className="queue-number">
              {SLOTS[ticket.slot].prefix}-
              {String(ticket.queueNumber).padStart(3, "0")}
            </strong>
            <p>
              {dayName(ticket.date)}
              <br />
              <b>
                {SLOTS[ticket.slot].start}–{SLOTS[ticket.slot].end}
              </b>
            </p>
            <div className="ticket-code">
              <small>CODICE RISERVATO DA MOSTRARE AL BANCO</small>
              <b>{ticket.pickupCode}</b>
            </div>
            <div className="ticket-summary">
              {ticket.lines.map((l) => (
                <div key={l.productId}>
                  <span>
                    {l.quantity} × {l.name}
                  </span>
                  <b>{money(l.priceCents * l.quantity)}</b>
                </div>
              ))}
              <div>
                <strong>Totale</strong>
                <strong>{money(ticket.totalCents)}</strong>
              </div>
            </div>
            <Badge tone={ticket.paymentStatus === "paid" ? "green" : "amber"}>
              {PAYMENT[ticket.paymentStatus]}
            </Badge>
            <button
              className="button primary full"
              onClick={() => void orderPDF(ticket, data.settings)}
            >
              <ArrowDownToLine size={18} /> Scarica il PDF
            </button>
            <small>
              Il PDF della prenotazione non sostituisce il documento
              commerciale.
            </small>
          </div>
        </Modal>
      )}
    </div>
  );
}
function PageTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-title">
      <span className="eyebrow muted">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}
function AuthModal({
  tab,
  onTab,
  onClose,
  onSuccess,
  notify,
}: {
  tab: "login" | "register";
  onTab: (t: "login" | "register") => void;
  onClose: () => void;
  onSuccess: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [otp, setOtp] = useState(""),
    [name, setName] = useState(""),
    [role, setRole] = useState<"student" | "staff">("student"),
    [category, setCategory] =
      useState<Registration["staffCategory"]>("docente"),
    [className, setClassName] = useState(""),
    [accepted, setAccepted] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (tab === "login") {
        await service.signIn(email, password, otp);
        await onSuccess();
      } else {
        const msg = await service.register({
          name,
          email,
          password,
          requestedRole: role,
          className,
          staffCategory: category,
          accepted,
        });
        notify(msg);
        if (IS_DEMO) await onSuccess();
        else {
          onTab("login");
          setError(msg);
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={tab === "login" ? "Bentornato al Bar Levi" : "Crea il tuo account"}
      onClose={onClose}
    >
      <div className="auth-tabs">
        <button
          className={tab === "login" ? "active" : ""}
          onClick={() => {
            onTab("login");
            setError("");
          }}
        >
          Accedi
        </button>
        <button
          className={tab === "register" ? "active" : ""}
          onClick={() => {
            onTab("register");
            setError("");
          }}
        >
          Registrati
        </button>
      </div>
      {IS_DEMO && (
        <div className="notice compact">
          <ShieldCheck size={18} />
          <span>Demo locale: usa nomi, email e password inventati.</span>
        </div>
      )}
      <form onSubmit={submit} className="form-stack">
        {tab === "register" && (
          <>
            <label>
              Nome e cognome
              <input
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </label>
            <label>
              Tipo di account
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as typeof role)}
              >
                <option value="student">Studente</option>
                <option value="staff">Personale scolastico</option>
              </select>
            </label>
            {role === "student" ? (
              <label>
                Classe
                <input
                  required
                  placeholder="Es. 3L"
                  maxLength={4}
                  pattern="[1-5][A-Z]{1,3}"
                  value={className}
                  onChange={(e) => setClassName(e.target.value.toUpperCase())}
                />
              </label>
            ) : (
              <>
                <label>
                  Categoria
                  <select
                    aria-label="Categoria"
                    value={category}
                    onChange={(e) =>
                      setCategory(e.target.value as typeof category)
                    }
                  >
                    {Object.entries(STAFF_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="fineprint">
                  La scuola verifica l’appartenenza al personale. La categoria
                  non assegna permessi amministrativi.
                </p>
              </>
            )}
          </>
        )}
        <label>
          Email
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            aria-label="Password"
            required
            minLength={tab === "register" ? 12 : 1}
            autoComplete={
              tab === "register" ? "new-password" : "current-password"
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {tab === "register" && (
            <small>Almeno 12 caratteri. Scegli una password unica.</small>
          )}
        </label>
        {!IS_DEMO && tab === "login" && (
          <label>
            Codice autenticatore (solo bar e amministrazione)
            <input
              inputMode="numeric"
              maxLength={6}
              pattern="[0-9]{6}"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="6 cifre"
            />
          </label>
        )}
        {tab === "register" && (
          <label className="check-line">
            <input
              type="checkbox"
              required
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            <span>
              Ho letto le condizioni e l’informativa presenti nell’area
              Documenti. {IS_DEMO && "Sto utilizzando dati fittizi."}
            </span>
          </label>
        )}
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <button className="button primary full" disabled={busy}>
          {busy ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <LockKeyhole size={17} />
          )}{" "}
          {tab === "login" ? "Accedi al tuo spazio" : "Crea account"}
        </button>
        {tab === "login" && (
          <div className="auth-links">
            <button
              type="button"
              onClick={async () => {
                try {
                  if (!email) throw new Error("Inserisci prima la tua email.");
                  await service.resetPassword(email);
                  notify(
                    "Se l’indirizzo è registrato, riceverai le istruzioni.",
                  );
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Password dimenticata?
            </button>
            {!IS_DEMO && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await live.resendVerification();
                    notify("Email di verifica richiesta.");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Reinvia verifica
              </button>
            )}
          </div>
        )}
      </form>
      {IS_DEMO && tab === "login" && (
        <div className="demo-accounts">
          <span className="eyebrow muted">
            ESPLORA LA DEMO CON UN ACCOUNT ESEMPIO
          </span>
          <div>
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                onClick={() => {
                  setEmail(a.email);
                  setPassword(a.password);
                  setError("");
                }}
              >
                <span>{ROLE_LABELS[a.role]}</span>
                <ArrowUpRight size={14} />
              </button>
            ))}
          </div>
          <p>
            Seleziona un profilo e premi Accedi. Queste credenziali funzionano
            soltanto nella demo.
          </p>
        </div>
      )}
    </Modal>
  );
}
function OrderCard({
  order: o,
  onTicket,
  onCancel,
  onPay,
  onReconcile,
  onReorder,
}: {
  order: Order;
  onTicket: () => void;
  onCancel: () => void;
  onPay: () => void;
  onReconcile: () => void;
  onReorder: () => void;
}) {
  return (
    <article className="order-card">
      <div className="order-leading">
        <span className="order-number">
          {SLOTS[o.slot].prefix}-{String(o.queueNumber).padStart(3, "0")}
        </span>
        <div>
          <h3>{dayName(o.date)}</h3>
          <span>
            <Clock3 size={14} /> {SLOTS[o.slot].start}–{SLOTS[o.slot].end}
          </span>
        </div>
        <Badge
          tone={
            o.status === "ready"
              ? "green"
              : o.status === "cancelled"
                ? "red"
                : "neutral"
          }
        >
          {STATUS[o.status]}
        </Badge>
      </div>
      <p>{o.lines.map((l) => `${l.quantity} × ${l.name}`).join(" · ")}</p>
      <div className="order-tracker">
        {["confirmed", "preparing", "ready", "collected"].map((s, i) => (
          <span
            key={s}
            className={
              ["confirmed", "preparing", "ready", "collected"].indexOf(
                o.status,
              ) >= i
                ? "done"
                : ""
            }
          >
            <i>{i + 1}</i>
            {STATUS[s]}
          </span>
        ))}
      </div>
      <div className="order-actions">
        <strong>{money(o.totalCents)}</strong>
        <Badge tone={o.paymentStatus === "paid" ? "green" : "amber"}>
          {PAYMENT[o.paymentStatus]}
        </Badge>
        <div className="action-spacer" />
        <button className="button secondary small" onClick={onReorder}>
          Riordina
        </button>
        {o.status === "confirmed" && (
          <button className="text-button danger" onClick={onCancel}>
            Annulla
          </button>
        )}
        {o.paymentMethod === "nexi" && o.paymentStatus === "pending" && (
          <>
            <button className="button secondary small" onClick={onPay}>
              Apri pagamento
            </button>
            <button className="text-button" onClick={onReconcile}>
              Verifica esito
            </button>
          </>
        )}
        <button className="button primary small" onClick={onTicket}>
          <FileText size={16} /> Codice e PDF
        </button>
      </div>
    </article>
  );
}
function Budget({
  data,
  onSave,
}: {
  data: Snapshot;
  onSave: (c: number) => void;
}) {
  const p = data.profile!;
  const mine = data.orders.filter(
    (o) =>
      o.uid === p.uid &&
      o.date.slice(0, 7) === rome().date.slice(0, 7) &&
      o.status !== "cancelled",
  );
  const spent = mine
    .filter((o) => o.paymentStatus === "paid")
    .reduce((n, o) => n + o.totalCents, 0);
  const due = mine
    .filter((o) => o.paymentStatus === "due" || o.paymentStatus === "pending")
    .reduce((n, o) => n + o.totalCents, 0);
  const [budget, setBudget] = useState(String(p.budgetCents / 100));
  return (
    <>
      <div className="stats-grid">
        <Stat
          label="Pagato questo mese"
          value={money(spent)}
          icon={<Wallet />}
        />
        <Stat
          label="Ordini da saldare"
          value={money(due)}
          icon={<CreditCard />}
        />
        <Stat
          label="Prenotazioni del mese"
          value={String(mine.length)}
          icon={<ShoppingBag />}
        />
      </div>
      <div className="two-column">
        <section className="panel">
          <h2>Il tuo budget mensile</h2>
          <p>Un promemoria personale. Non blocca gli acquisti.</p>
          <div className="budget-track">
            <div
              style={{
                width:
                  Math.min(
                    100,
                    p.budgetCents ? (spent / p.budgetCents) * 100 : 0,
                  ) + "%",
              }}
            />
          </div>
          <p>
            <b>{money(spent)}</b> di {money(p.budgetCents)}
            {spent > p.budgetCents && p.budgetCents > 0
              ? " · Hai superato la soglia che avevi scelto."
              : ""}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSave(Math.round(Number(budget) * 100));
            }}
            className="inline-form"
          >
            <label>
              Budget in euro
              <input
                type="number"
                min="0"
                max="1000"
                step="0.5"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </label>
            <button className="button primary">Salva budget</button>
          </form>
        </section>
        <section className="panel">
          <h2>Il tuo profilo</h2>
          <dl className="detail-list">
            <div>
              <dt>Nome</dt>
              <dd>{p.name}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{p.email}</dd>
            </div>
            <div>
              <dt>Account</dt>
              <dd>{ROLE_LABELS[p.role]}</dd>
            </div>
            {p.className && (
              <div>
                <dt>Classe</dt>
                <dd>{p.className}</dd>
              </div>
            )}
            {p.staffCategory && (
              <div>
                <dt>Categoria</dt>
                <dd>{STAFF_LABELS[p.staffCategory]}</dd>
              </div>
            )}
            <div>
              <dt>Stato</dt>
              <dd>{p.approved ? "Approvato" : "In verifica"}</dd>
            </div>
          </dl>
          <p className="fineprint">
            Il tuo account non contiene carte di pagamento né un portafoglio
            ricaricabile.
          </p>
        </section>
      </div>
    </>
  );
}
function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <div className="stat">
      <span className="stat-icon">{icon}</span>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
type Run = (fn: () => Promise<unknown>, msg?: string) => Promise<boolean>;
function Bar({
  data,
  busy,
  run,
  onTicket,
}: {
  data: Snapshot;
  busy: boolean;
  run: Run;
  onTicket: (o: Order) => void;
}) {
  const [date, setDate] = useState(
      availableDates(data.settings)[0] || rome().date,
    ),
    [slot, setSlot] = useState("all"),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [collect, setCollect] = useState<Order | null>(null),
    [code, setCode] = useState(""),
    [board, setBoard] = useState(false);
  const [operational, opsError] = useOperationalOrders(data, date);
  const daily = operational.filter(
    (o) => o.date === date && (slot === "all" || o.slot === slot),
  );
  const orders = daily
    .filter(
      (o) =>
        (filter === "all" || o.status === filter) &&
        (
          o.customerName +
          " " +
          o.className +
          " " +
          o.pickupCode +
          " " +
          o.queueNumber
        )
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort(
      (a, b) => a.slot.localeCompare(b.slot) || a.queueNumber - b.queueNumber,
    );
  return (
    <>
      <PageTitle
        eyebrow="SPAZIO DEL BAR"
        title="Ogni pausa, al suo posto."
        description="Prepara per fascia oraria, verifica gli incassi e consegna con il codice riservato."
      />
      <div className="stats-grid">
        <Stat
          label="Prenotazioni attive"
          value={String(daily.filter((o) => o.status !== "cancelled").length)}
          icon={<ShoppingBag />}
        />
        <Stat
          label="Prodotti da preparare"
          value={String(
            daily
              .filter((o) => ["confirmed", "preparing"].includes(o.status))
              .reduce(
                (n, o) => n + o.lines.reduce((q, l) => q + l.quantity, 0),
                0,
              ),
          )}
          icon={<UtensilsCrossed />}
        />
        <Stat
          label="Incassi registrati"
          value={money(
            daily
              .filter((o) => o.paymentStatus === "paid")
              .reduce((n, o) => n + o.totalCents, 0),
          )}
          icon={<Wallet />}
        />
      </div>
      {opsError && (
        <div className="notice error" role="alert">
          {opsError}
        </div>
      )}
      <div className="toolbar">
        <label>
          Giorno
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          Fascia
          <select value={slot} onChange={(e) => setSlot(e.target.value)}>
            <option value="all">Entrambe le pause</option>
            <option value="prima">09:45–09:55</option>
            <option value="seconda">12:45–13:00</option>
          </select>
        </label>
        <button className="button secondary" onClick={() => setBoard(!board)}>
          <ListOrdered size={17} />
          {board ? "Torna agli ordini" : "Schermo ritiri"}
        </button>
        <button
          className="button secondary"
          onClick={() =>
            void reportPDF(
              `Riepilogo servizio del ${date}`,
              [
                "Documento gestionale, non fiscale.",
                ...daily.map(
                  (o) =>
                    `${SLOTS[o.slot].prefix}-${o.queueNumber} | ${o.className || "Personale"} | ${o.lines.map((l) => l.quantity + " x " + l.name).join(", ")} | ${money(o.totalCents)} | ${STATUS[o.status]} | ${PAYMENT[o.paymentStatus]}`,
                ),
              ],
              `Riepilogo_${date}.pdf`,
            )
          }
        >
          <ArrowDownToLine size={17} /> Report PDF
        </button>
      </div>
      {board ? (
        <div className="pickup-board">
          <span className="eyebrow">BAR LEVI · RITIRI</span>
          <h2>La tua pausa è pronta.</h2>
          <div>
            {daily
              .filter((o) => o.status === "ready")
              .map((o) => (
                <span key={o.id}>
                  {SLOTS[o.slot].prefix}-
                  {String(o.queueNumber).padStart(3, "0")}
                </span>
              ))}
          </div>
          <p>
            Avvicinati al banco nella tua fascia e mostra il codice riservato.
          </p>
        </div>
      ) : (
        <>
          <div className="preparation-summary">
            {aggregateProducts(
              daily.filter((o) =>
                ["confirmed", "preparing"].includes(o.status),
              ),
            ).map((r) => (
              <div key={r.name}>
                <b>{r.quantity}</b>
                <span>{r.name}</span>
              </div>
            ))}
          </div>
          <div className="catalog-tools">
            <div className="search-field">
              <Search size={17} />
              <input
                aria-label="Cerca prenotazione"
                placeholder="Nome, classe, numero o codice…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <select
              aria-label="Filtra stato"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">Tutti gli stati</option>
              {Object.entries(STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="bar-orders">
            {orders.length ? (
              orders.map((o) => (
                <article key={o.id} className="bar-order">
                  <div className="bar-order-top">
                    <b className="order-number">
                      {SLOTS[o.slot].prefix}-
                      {String(o.queueNumber).padStart(3, "0")}
                    </b>
                    <div>
                      <h3>{o.customerName}</h3>
                      <span>
                        {o.className || "Personale scolastico"} ·{" "}
                        {SLOTS[o.slot].start}–{SLOTS[o.slot].end}
                      </span>
                    </div>
                    <Badge tone={o.status === "ready" ? "green" : "neutral"}>
                      {STATUS[o.status]}
                    </Badge>
                  </div>
                  <ul>
                    {o.lines.map((l) => (
                      <li key={l.productId}>
                        <b>
                          {l.quantity} × {l.name}
                        </b>
                        {l.vegan && <Leaf size={14} />}
                        <small>
                          Allergeni:{" "}
                          {l.allergens.join(", ") || "nessuno dichiarato"}
                        </small>
                      </li>
                    ))}
                  </ul>
                  <div className="order-actions">
                    <strong>{money(o.totalCents)}</strong>
                    <Badge
                      tone={o.paymentStatus === "paid" ? "green" : "amber"}
                    >
                      {PAYMENT[o.paymentStatus]}
                    </Badge>
                    <div className="action-spacer" />
                    {o.paymentStatus === "due" && o.status !== "cancelled" && (
                      <button
                        className="button secondary small"
                        disabled={busy}
                        onClick={() => {
                          if (
                            confirm(
                              `Confermi di aver incassato ${money(o.totalCents)}?`,
                            )
                          )
                            void run(
                              () => service.orderAction(o.id, "paid"),
                              "Incasso registrato.",
                            );
                        }}
                      >
                        Registra incasso
                      </button>
                    )}
                    {o.paymentStatus === "refund_required" &&
                      o.paymentMethod === "counter" && (
                        <button
                          className="button secondary small"
                          onClick={() => {
                            if (
                              confirm(
                                "Confermi di aver restituito l’importo al cliente?",
                              )
                            )
                              void run(
                                () => service.orderAction(o.id, "refund"),
                                "Rimborso registrato.",
                              );
                          }}
                        >
                          Registra rimborso
                        </button>
                      )}
                    {o.paymentMethod === "nexi" && (
                      <button
                        className="button secondary small"
                        onClick={() =>
                          void run(
                            () => service.reconcile(o.id),
                            "Pagamento verificato.",
                          )
                        }
                      >
                        Verifica Nexi
                      </button>
                    )}
                    {o.status === "confirmed" && (
                      <>
                        <button
                          className="text-button danger"
                          onClick={() => {
                            if (confirm("Annullare l’ordine?"))
                              void run(
                                () => service.orderAction(o.id, "cancel"),
                                "Ordine annullato.",
                              );
                          }}
                        >
                          Annulla
                        </button>
                        <button
                          className="button primary small"
                          disabled={
                            busy ||
                            (o.paymentMethod === "nexi" &&
                              o.paymentStatus !== "paid")
                          }
                          onClick={() =>
                            void run(
                              () => service.orderAction(o.id, "prepare"),
                              "Preparazione avviata.",
                            )
                          }
                        >
                          Prepara
                        </button>
                      </>
                    )}
                    {o.status === "preparing" && (
                      <button
                        className="button primary small"
                        onClick={() =>
                          void run(
                            () => service.orderAction(o.id, "ready"),
                            "Ordine pronto.",
                          )
                        }
                      >
                        Segna pronto
                      </button>
                    )}
                    {o.status === "ready" && (
                      <button
                        className="button primary small"
                        onClick={() => {
                          setCollect(o);
                          setCode("");
                        }}
                      >
                        Consegna
                      </button>
                    )}
                    <button
                      className="icon-button"
                      aria-label="Apri ricevuta"
                      onClick={() => onTicket(o)}
                    >
                      <FileText size={18} />
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <Empty title="Nessun ordine in questa vista">
                Cambia giorno o filtri per trovare altre prenotazioni.
              </Empty>
            )}
          </div>
        </>
      )}
      {collect && (
        <Modal title="Verifica il ritiro" onClose={() => setCollect(null)}>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await service.orderAction(collect.id, "collect", code);
                setCollect(null);
              }, "Ritiro registrato.");
            }}
          >
            <p>
              Chiedi il codice riservato al cliente. Il numero in coda da solo
              non è sufficiente.
            </p>
            {IS_DEMO && (
              <div className="notice warning">
                Simulazione: nella demo puoi collaudare il ritiro fuori orario.
                Nel servizio reale il server verifica giorno e fascia.
              </div>
            )}
            <label>
              Codice di ritiro
              <input
                required
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                autoComplete="off"
              />
            </label>
            <button className="button primary" disabled={busy}>
              Conferma consegna
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
function Needs({
  data,
  onSave,
}: {
  data: Snapshot;
  onSave: (c: Catalog) => Promise<boolean>;
}) {
  const [date, setDate] = useState(
      availableDates(data.settings)[0] || rome().date,
    ),
    [editing, setEditing] = useState(false),
    [stocks, setStocks] = useState<Record<string, number>>({});
  const [operational, opsError] = useOperationalOrders(data, date);
  const rows = ingredientNeeds(
    operational.filter((o) => o.date === date),
    data.ingredients,
  );
  return (
    <>
      <PageTitle
        eyebrow="DALLE PRENOTAZIONI ALLA SPESA"
        title="Il giusto, senza sprechi."
        description="Le ricette trasformano gli ordini confermati in quantità di ingredienti. Le confezioni arrotondano gli acquisti."
      />
      {opsError && (
        <div className="notice error" role="alert">
          {opsError}
        </div>
      )}
      <div className="toolbar">
        <label>
          Data di preparazione
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <button
          className="button secondary"
          onClick={() =>
            downloadCSV(`Fabbisogno_${date}.csv`, [
              [
                "Ingrediente",
                "Unità",
                "Necessario",
                "Giacenza",
                "Mancante",
                "Acquisto confezioni",
              ],
              ...rows.map((i) => [
                i.name,
                i.unit,
                i.required,
                i.stock,
                i.missing,
                i.purchase,
              ]),
            ])
          }
        >
          <ArrowDownToLine size={17} /> Esporta per Excel
        </button>
        <button
          className="button secondary"
          onClick={() =>
            void reportPDF(
              `Lista acquisti del ${date}`,
              [
                "Quantità derivate dagli ordini non annullati. Verificare le giacenze prima dell’acquisto.",
                ...rows
                  .filter((i) => i.purchase > 0)
                  .map(
                    (i) =>
                      `${i.name}: ${i.purchase} ${i.unit} da acquistare (fabbisogno ${i.required}, giacenza ${i.stock}).`,
                  ),
              ],
              `Lista_acquisti_${date}.pdf`,
            )
          }
        >
          <FileText size={17} /> Lista PDF
        </button>
        <button
          className="button primary"
          onClick={() => {
            setStocks(
              Object.fromEntries(data.ingredients.map((i) => [i.id, i.stock])),
            );
            setEditing(true);
          }}
        >
          Aggiorna giacenze
        </button>
      </div>
      <div className="notice">
        <Package size={20} />
        <span>
          Fabbisogno lordo del giorno selezionato: include anche preparazioni
          già consegnate. Confrontalo con le giacenze iniziali del giorno. Le
          scorte non vengono scalate automaticamente; registra anche vendite al
          banco e scarti.
        </span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ingrediente</th>
              <th>Necessario</th>
              <th>Giacenza iniziale</th>
              <th>Da acquistare</th>
              <th>Stato</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id}>
                <td>
                  <b>{i.name}</b>
                  <small>
                    Confezione: {i.packSize} {i.unit}
                  </small>
                </td>
                <td>
                  {i.required} {i.unit}
                </td>
                <td>
                  {i.stock} {i.unit}
                </td>
                <td>
                  <b>
                    {i.purchase} {i.unit}
                  </b>
                </td>
                <td>
                  <Badge tone={i.missing ? "amber" : "green"}>
                    {i.missing ? "Da integrare" : "Disponibile"}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <h2>Preparazioni per prodotto</h2>
        <div className="preparation-summary">
          {aggregateProducts(operational.filter((o) => o.date === date)).map(
            (r) => (
              <div key={r.name}>
                <b>{r.quantity}</b>
                <span>{r.name}</span>
              </div>
            ),
          )}
        </div>
      </div>
      {editing && (
        <Modal
          title="Giacenze di riferimento"
          onClose={() => setEditing(false)}
        >
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void onSave({
                products: data.products,
                ingredients: data.ingredients.map((i) => ({
                  ...i,
                  stock: stocks[i.id],
                })),
                version: data.catalogVersion,
                updatedAt: new Date().toISOString(),
              }).then((ok) => {
                if (ok) setEditing(false);
              });
            }}
          >
            {data.ingredients.map((i) => (
              <label key={i.id}>
                {i.name} ({i.unit})
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  required
                  value={stocks[i.id]}
                  onChange={(e) =>
                    setStocks({ ...stocks, [i.id]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
            <button className="button primary">Salva giacenze</button>
          </form>
        </Modal>
      )}
    </>
  );
}
function CatalogAdmin({
  data,
  run,
  notify,
}: {
  data: Snapshot;
  run: Run;
  notify: (s: string) => void;
}) {
  const [preview, setPreview] = useState<Catalog | null>(null),
    [importing, setImporting] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <PageTitle
        eyebrow="IL CATALOGO DEL BAR"
        title="Un menu facile da gestire."
        description="Importa prodotti, ingredienti e ricette. Allergeni e opzione vegana vengono ricavati dagli ingredienti."
      />
      <div className="import-panel">
        <div className="import-icon">
          <FileSpreadsheet size={32} />
        </div>
        <div>
          <h2>Il tuo catalogo, da Excel.</h2>
          <p>
            Tre fogli: Prodotti, Ingredienti, Ricette. Prima controlli
            l’anteprima, poi confermi.
          </p>
          <small>
            Formato .xlsx · massimo 1 MB · 200 prodotti · formule e macro
            escluse
          </small>
        </div>
        <div className="import-actions">
          <a
            className="button secondary"
            href={`${import.meta.env.BASE_URL}modello_catalogo.xlsx`}
            download
          >
            <ArrowDownToLine size={17} /> Scarica modello
          </a>
          <button
            className="button primary"
            disabled={importing}
            onClick={() => input.current?.click()}
          >
            {importing ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <Plus size={17} />
            )}{" "}
            Importa Excel
          </button>
          <input
            ref={input}
            hidden
            type="file"
            accept=".xlsx"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setImporting(true);
              try {
                setPreview(await parseExcel(file, data.catalogVersion));
              } catch (err) {
                notify((err as Error).message);
              } finally {
                setImporting(false);
                e.target.value = "";
              }
            }}
          />
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Prodotto</th>
              <th>Prezzo</th>
              <th>Limite/giorno</th>
              <th>Allergeni</th>
              <th>Disponibilità</th>
            </tr>
          </thead>
          <tbody>
            {data.products.map((p) => (
              <tr key={p.id}>
                <td>
                  <b>{p.name}</b>
                  <small>
                    {p.category} {p.vegan ? "· Vegano" : ""}
                  </small>
                </td>
                <td>{money(p.priceCents)}</td>
                <td>{p.dailyLimit}</td>
                <td>{p.allergens.join(", ") || "Nessuno dichiarato"}</td>
                <td>
                  <button
                    className={`badge-button ${p.active ? "green" : "red"}`}
                    onClick={() =>
                      void run(
                        () =>
                          service.saveCatalog({
                            products: data.products.map((x) =>
                              x.id === p.id ? { ...x, active: !x.active } : x,
                            ),
                            ingredients: data.ingredients,
                            version: data.catalogVersion,
                            updatedAt: new Date().toISOString(),
                          }),
                        "Disponibilità aggiornata.",
                      )
                    }
                  >
                    {p.active ? "Attivo" : "Sospeso"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="notice warning">
        <AlertCircle size={20} />
        <span>
          Ogni ingrediente deve indicare tutti gli allergeni della propria
          composizione. Le possibili tracce vanno dichiarate nel foglio
          Prodotti. La classificazione automatica richiede dati corretti e
          convalida del gestore.
        </span>
      </div>
      {preview && (
        <Modal
          title="Controlla il catalogo importato"
          onClose={() => setPreview(null)}
        >
          <div className="form-stack">
            <p>
              <b>{preview.products.length} prodotti</b> e{" "}
              <b>{preview.ingredients.length} ingredienti</b>. Il catalogo
              corrente verrà sostituito; le prenotazioni già registrate
              conserveranno prezzi e ricette originali.
            </p>
            <div className="import-preview">
              {preview.products.map((p) => (
                <div key={p.id}>
                  <b>{p.name}</b>
                  <span>
                    {money(p.priceCents)} · {p.dailyLimit}/giorno
                  </span>
                  <small>
                    {p.vegan ? "Vegano · " : ""}
                    {p.allergens.join(", ") || "Nessun allergene dichiarato"}
                  </small>
                </div>
              ))}
            </div>
            <label className="check-line">
              <input type="checkbox" required id="validate-import" />
              <span>
                Ho verificato ingredienti, allergeni, ricette, prezzi e
                quantità.
              </span>
            </label>
            <button
              className="button primary"
              onClick={() => {
                if (
                  !(
                    document.getElementById(
                      "validate-import",
                    ) as HTMLInputElement
                  ).checked
                ) {
                  notify("Conferma la verifica del catalogo.");
                  return;
                }
                void run(async () => {
                  await service.saveCatalog(preview);
                  setPreview(null);
                }, "Catalogo importato.");
              }}
            >
              Conferma importazione
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function School({ data, run }: { data: Snapshot; run: Run }) {
  const [query, setQuery] = useState("");
  return (
    <>
      <PageTitle
        eyebrow="AMMINISTRAZIONE SCOLASTICA"
        title="Le persone, i giusti accessi."
        description="Approva studenti e personale. Gli account riservati di bar e amministrazione si assegnano con la procedura protetta."
      />
      <div className="stats-grid">
        <Stat
          label="Account registrati"
          value={String(data.users.length)}
          icon={<UsersRound />}
        />
        <Stat
          label="In attesa di verifica"
          value={String(data.users.filter((u) => !u.approved).length)}
          icon={<ShieldCheck />}
        />
        <Stat
          label="Personale scolastico"
          value={String(data.users.filter((u) => u.role === "staff").length)}
          icon={<GraduationCap />}
        />
      </div>
      <div className="notice">
        <LockKeyhole size={20} />
        <span>
          Questa area non mostra gli acquisti nominativi degli altri utenti.
          Categoria professionale e permessi amministrativi sono separati.
        </span>
      </div>
      <div className="search-field">
        <Search size={18} />
        <input
          aria-label="Cerca account"
          placeholder="Cerca nome, email o classe…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Utente</th>
              <th>Profilo</th>
              <th>Stato</th>
              <th>Gestione</th>
            </tr>
          </thead>
          <tbody>
            {data.users
              .filter((u) =>
                (u.name + " " + u.email + " " + u.className)
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .map((u) => (
                <tr key={u.uid}>
                  <td>
                    <b>{u.name}</b>
                    <small>{u.email}</small>
                  </td>
                  <td>
                    {ROLE_LABELS[u.role]}
                    <small>
                      {u.className ||
                        (u.staffCategory && STAFF_LABELS[u.staffCategory])}
                    </small>
                  </td>
                  <td>
                    <Badge
                      tone={u.disabled ? "red" : u.approved ? "green" : "amber"}
                    >
                      {u.disabled
                        ? "Sospeso"
                        : u.approved
                          ? "Approvato"
                          : "Da verificare"}
                    </Badge>
                  </td>
                  <td>
                    {["student", "staff"].includes(u.role) && (
                      <div className="row-actions">
                        {!u.approved && (
                          <button
                            className="button primary small"
                            onClick={() =>
                              void run(
                                () => service.userAction(u.uid, "approve"),
                                "Account approvato.",
                              )
                            }
                          >
                            Approva
                          </button>
                        )}
                        <button
                          className="button secondary small"
                          onClick={() => {
                            if (
                              confirm(
                                `${u.disabled ? "Riattivare" : "Sospendere"} questo account?`,
                              )
                            )
                              void run(
                                () =>
                                  service.userAction(
                                    u.uid,
                                    u.disabled ? "enable" : "disable",
                                  ),
                                "Stato account aggiornato.",
                              );
                          }}
                        >
                          {u.disabled ? "Riattiva" : "Sospendi"}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <section className="panel">
        <h2>Registro delle operazioni</h2>
        {data.audit.length ? (
          <div className="audit-list">
            {data.audit.slice(0, 30).map((a) => (
              <div key={a.id}>
                <span>{new Date(a.at).toLocaleString("it-IT")}</span>
                <b>{a.action}</b>
                <small>{a.actor}</small>
              </div>
            ))}
          </div>
        ) : (
          <p>Nessuna operazione ancora registrata.</p>
        )}
      </section>
    </>
  );
}
function ServiceSettings({ data, run }: { data: Snapshot; run: Run }) {
  const [s, setS] = useState<Settings>(structuredClone(data.settings)),
    [closed, setClosed] = useState(data.settings.closedDates.join(", "));
  return (
    <>
      <PageTitle
        eyebrow="REGOLE CONDIVISE"
        title="Un servizio su misura per la scuola."
        description="Le finestre di ritiro degli studenti restano 09:45–09:55 e 12:45–13:00."
      />
      <form
        className="panel form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            () =>
              service.saveSettings({
                ...s,
                closedDates: closed
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean),
              }),
            "Regole aggiornate.",
          );
        }}
      >
        <label className="check-line">
          <input
            type="checkbox"
            checked={s.accepting}
            onChange={(e) => setS({ ...s, accepting: e.target.checked })}
          />
          <span>Prenotazioni aperte</span>
        </label>
        <label>
          Giorni prenotabili in anticipo
          <input
            type="number"
            required
            min="1"
            max="14"
            value={s.bookingDays}
            onChange={(e) =>
              setS({ ...s, bookingDays: Number(e.target.value) })
            }
          />
        </label>
        <fieldset>
          <legend>Giorni di apertura</legend>
          <div className="weekdays">
            {[
              "Domenica",
              "Lunedì",
              "Martedì",
              "Mercoledì",
              "Giovedì",
              "Venerdì",
              "Sabato",
            ].map((d, i) => (
              <label className="check-line" key={d}>
                <input
                  type="checkbox"
                  checked={s.weekdays.includes(i)}
                  onChange={(e) =>
                    setS({
                      ...s,
                      weekdays: e.target.checked
                        ? [...s.weekdays, i]
                        : s.weekdays.filter((x) => x !== i),
                    })
                  }
                />
                {d}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="two-column">
          {(["prima", "seconda"] as SlotId[]).map((slot) => (
            <div className="panel inset" key={slot}>
              <h3>
                {SLOTS[slot].label} · {SLOTS[slot].start}–{SLOTS[slot].end}
              </h3>
              <label>
                Termine delle prenotazioni
                <input
                  type="time"
                  required
                  value={s.cutoff[slot]}
                  onChange={(e) =>
                    setS({
                      ...s,
                      cutoff: { ...s.cutoff, [slot]: e.target.value },
                    })
                  }
                />
              </label>
              <label>
                Capienza (numero di ordini)
                <input
                  type="number"
                  min="1"
                  max="1000"
                  required
                  value={s.capacity[slot]}
                  onChange={(e) =>
                    setS({
                      ...s,
                      capacity: {
                        ...s.capacity,
                        [slot]: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
            </div>
          ))}
        </div>
        <label>
          Date di chiusura straordinaria
          <input
            value={closed}
            onChange={(e) => setClosed(e.target.value)}
            placeholder="2026-12-08, 2026-12-25"
          />
          <small>Formato AAAA-MM-GG, separate da virgola.</small>
        </label>
        <label>
          Avviso per gli utenti
          <textarea
            rows={3}
            maxLength={300}
            value={s.notice}
            onChange={(e) => setS({ ...s, notice: e.target.value })}
          />
        </label>
        <button className="button primary align-start">Salva regole</button>
      </form>
    </>
  );
}
function Documents({
  data,
  notify,
  reset,
}: {
  data: Snapshot;
  notify: (s: string) => void;
  reset: () => void;
}) {
  const docs = [
    {
      title: "Come prenotare e ritirare",
      text: `Scegli il giorno e una delle due pause. Le prenotazioni possono essere inserite in anticipo fino a ${data.settings.bookingDays} giorni, nei giorni di servizio. Per il giorno stesso i termini sono ${data.settings.cutoff.prima} e ${data.settings.cutoff.seconda}. Il ritiro avviene esclusivamente 09:45–09:55 oppure 12:45–13:00. Porta il codice anche su carta e rispetta le disposizioni della scuola sull’uso del telefono.`,
    },
    {
      title: "Annullamenti e pagamenti",
      text: "Puoi annullare un ordine confermato prima dell’avvio della preparazione e del termine delle prenotazioni. Per richieste successive rivolgiti al bar. Lo stato “Pagato” deriva dall’incasso registrato dall’operatore o dalla verifica del provider. Eventuali rimborsi sono indicati separatamente. Il documento PDF è una conferma dell’ordine, non un documento fiscale.",
    },
    {
      title: "Ingredienti, allergeni e ricette vegane",
      text: "Le schede mostrano gli allergeni derivati dagli ingredienti e le possibili tracce dichiarate dal gestore. Una ricetta vegana può contenere allergeni. Non vengono raccolte dichiarazioni personali di patologie o allergie. Nella demo i dati sono esemplificativi e non vanno utilizzati per decisioni alimentari reali.",
    },
    {
      title: "Privacy e account",
      text: IS_DEMO
        ? "Questa demo salva dati fittizi esclusivamente nel browser e non li invia al database Firebase. Usa email e password inventate. Gli account di esempio sono pubblici. I profili locali non rappresentano una protezione adatta a dati reali. Puoi eliminare i dati della demo con il pulsante in fondo alla pagina."
        : "Gli account utilizzano Firebase Authentication. Il servizio tratta i dati necessari alla gestione di account e prenotazioni. L’informativa definitiva, con titolare, contatti, basi giuridiche, conservazione e diritti, deve essere pubblicata e approvata prima dell’apertura del servizio. Contatta la scuola e il gestore per richieste sui tuoi dati.",
    },
    {
      title: "Accessi riservati",
      text: "Studenti e personale possono registrarsi. La categoria dichiarata non concede accesso all’amministrazione. Il bar e l’amministrazione scolastica hanno account separati, assegnati con procedura riservata. Nel servizio Firebase devono usare anche il codice dell’autenticatore. Lo storico degli acquisti è personale; la scuola non riceve il dettaglio nominativo delle consumazioni.",
    },
  ];
  return (
    <>
      <PageTitle
        eyebrow="INFORMAZIONI UTILI"
        title="Tutto chiaro, prima della pausa."
        description="Regole del servizio, gestione dei dati e materiali per gli operatori."
      />
      {IS_DEMO && (
        <div className="notice warning">
          <AlertCircle size={20} />
          <span>
            Versione dimostrativa. Le condizioni definitive, i dati
            dell’esercente e l’informativa devono essere completati prima
            dell’uso con persone e pagamenti reali.
          </span>
        </div>
      )}
      <div className="document-grid">
        {docs.map((d) => (
          <article className="panel" key={d.title}>
            <BookOpen className="document-icon" size={23} />
            <h2>{d.title}</h2>
            <p>{d.text}</p>
            <button
              className="text-button"
              onClick={() =>
                void reportPDF(
                  d.title,
                  [
                    d.text,
                    IS_DEMO
                      ? "Bozza dimostrativa da verificare e completare."
                      : "Versione informativa del servizio.",
                  ],
                  "Bar_Levi_" + d.title.replaceAll(" ", "_") + ".pdf",
                )
              }
            >
              <ArrowDownToLine size={15} /> Scarica scheda
            </button>
          </article>
        ))}
      </div>
      {(data.profile?.role === "bar" ||
        data.profile?.role === "school_admin") && (
        <section className="panel">
          <h2>Documentazione di gestione</h2>
          <p>
            Le guide di attivazione, le regole Firebase e il modello di collaudo
            sono nel repository. I verbali devono riportare verifiche
            effettivamente svolte.
          </p>
          <div className="row-actions">
            <a
              href="https://github.com/giuseppeborzumati-cmyk/Prenotazioni_Bar_Levi/tree/main/docs"
              target="_blank"
              rel="noreferrer"
              className="button secondary"
            >
              Apri le guide <ArrowUpRight size={17} />
            </a>
            <button
              className="button secondary"
              onClick={() =>
                void reportPDF(
                  "Scheda di collaudo da compilare",
                  [
                    "Data: __________________",
                    "Responsabile della verifica: __________________",
                    "Versione verificata: __________________",
                    "Accesso studente e personale: esito __________________",
                    "Separazione ruoli bar/scuola: esito __________________",
                    "Ordinazioni concorrenti e disponibilità: esito __________________",
                    "Controllo orari e fuso Europe/Rome: esito __________________",
                    "Importazione Excel e allergeni: esito __________________",
                    "Pagamento, doppia notifica e rimborso: esito __________________",
                    "Backup e ripristino: esito __________________",
                    "Prova carico: utenti ______; durata ______; errori ______",
                    "Anomalie riscontrate: __________________",
                    "Interventi e responsabili: __________________",
                    "Firma: __________________",
                    "Questo modello non attesta prove non eseguite.",
                  ],
                  "Modello_collaudo_Bar_Levi.pdf",
                )
              }
            >
              <FileText size={17} /> Modello di collaudo
            </button>
          </div>
        </section>
      )}
      {IS_DEMO && (
        <section className="panel demo-reset">
          <div>
            <h2>Ricomincia la prova</h2>
            <p>
              Ripristina account, catalogo e prenotazioni fittizie in questo
              browser.
            </p>
          </div>
          <button
            className="button secondary"
            onClick={() => {
              if (
                confirm(
                  "Eliminare tutti i dati locali della demo e ripristinare gli esempi?",
                )
              )
                reset();
            }}
          >
            <RefreshCw size={16} /> Reimposta demo
          </button>
        </section>
      )}
    </>
  );
}

function useOperationalOrders(data: Snapshot, date: string): [Order[], string] {
  const [orders, setOrders] = useState<Order[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setOrders([]);
    service
      .barOrders(date)
      .then((rows) => {
        if (active) {
          setOrders(rows);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [date, data.orders]);
  return [orders, error];
}
