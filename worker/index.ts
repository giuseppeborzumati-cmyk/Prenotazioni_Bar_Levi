import type {
  Audit,
  Catalog,
  DayLedger,
  Order,
  Profile,
  Settings,
  Snapshot,
} from "../shared/types";
import {
  addDays,
  availableDates,
  blankLedger,
  ensure,
  inPickupWindow,
  release,
  reserve,
  rome,
  validateCatalog,
  validateDate,
  validateSettings,
} from "../shared/domain";
import { Store, type Env, type Write } from "./store";
import {
  appCheck,
  demand,
  HttpError,
  identity,
  privileged,
  rateLimit,
  staffSession,
} from "./security";
import {
  nexiEnabled,
  reconcilePayment,
  startPayment,
  webhook,
} from "./payments";
function audit(
  store: Store,
  writes: Write[],
  p: Profile,
  action: string,
  target: string,
) {
  const id = crypto.randomUUID();
  writes.push(
    store.write("audit/" + id, {
      id,
      at: new Date().toISOString(),
      actor: p.uid,
      action,
      target,
    }),
  );
}
function orderId(value: string) {
  demand(/^[a-f0-9]{18}$/.test(value), "Identificativo non valido.", 400);
  return value;
}
async function jsonBody(request: Request) {
  demand(
    request.headers.get("Content-Type")?.startsWith("application/json"),
    "Formato richiesta non valido.",
    415,
  );
  demand(
    Number(request.headers.get("Content-Length") || 0) <= 700000,
    "Richiesta troppo grande.",
    413,
  );
  const reader = request.body?.getReader();
  demand(reader, "Corpo richiesta mancante.", 400);
  let length = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 700000) {
      await reader.cancel();
      throw new HttpError(413, "Richiesta troppo grande.");
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(length);
  let offset = 0;
  for (const c of chunks) {
    buffer.set(c, offset);
    offset += c.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(buffer));
  } catch {
    throw new HttpError(400, "JSON non valido.");
  }
}
export async function createOrder(
  body: any,
  p: Profile,
  env: Env,
  store: Store,
) {
  demand(p.approved, "Attendi l’approvazione della scuola.");
  const id = orderId(body.id || "");
  demand(
    ["counter", "nexi"].includes(body.paymentMethod),
    "Metodo di pagamento non valido.",
    400,
  );
  demand(
    body.paymentMethod !== "nexi" || nexiEnabled(env),
    "Nexi non attivo.",
    409,
  );
  return store.transaction(async (tx, writes) => {
    const [existing, catalog, settings, profile] = await Promise.all([
      store.get<Order>("orders/" + id, tx),
      store.get<Catalog>("config/catalog", tx),
      store.get<Settings>("config/service", tx),
      store.get<Profile>("users/" + p.uid, tx),
    ]);
    demand(profile?.approved && !profile.disabled);
    if (existing) {
      demand(existing.uid === p.uid, "Identificativo già utilizzato.", 409);
      return existing;
    }
    demand(catalog && settings, "Catalogo da configurare.", 503);
    validateDate(body.date, body.slot, settings);
    ensure(
      body.catalogVersion === catalog.version,
      "Il menu è cambiato. Aggiorna la pagina e controlla il carrello.",
    );
    ensure(
      body.termsVersion === settings.termsVersion,
      "Le condizioni sono cambiate. Rileggile prima di confermare.",
    );
    const limitPath = "dailyUsers/" + body.date + "_" + p.uid;
    const [ledger, quota] = await Promise.all([
      store.get<DayLedger>("days/" + body.date, tx),
      store.get<{ created: number }>(limitPath, tx),
    ]);
    demand(
      (quota?.created || 0) < 6,
      "Massimo sei prenotazioni create per giorno di ritiro. Contatta il bar per assistenza.",
      429,
    );
    const result = reserve(
      body.cart,
      catalog,
      ledger || blankLedger(),
      body.slot,
      settings,
    );
    const at = new Date().toISOString();
    const order: Order = {
      id,
      uid: p.uid,
      customerName: profile.name,
      className: profile.className,
      customerRole: profile.role,
      date: body.date,
      slot: body.slot,
      queueNumber: result.queueNumber,
      pickupCode: crypto
        .randomUUID()
        .replaceAll("-", "")
        .slice(0, 12)
        .toUpperCase(),
      lines: result.lines,
      totalCents: result.totalCents,
      status: "confirmed",
      paymentMethod: body.paymentMethod,
      paymentStatus: body.paymentMethod === "nexi" ? "pending" : "due",
      createdAt: at,
      updatedAt: at,
      catalogVersion: catalog.version,
      termsVersion: settings.termsVersion,
    };
    writes.push(
      store.write("orders/" + id, order, true),
      store.write("days/" + body.date, result.ledger),
      store.write(limitPath, { created: (quota?.created || 0) + 1 }),
    );
    audit(store, writes, p, "order_created", id);
    return order;
  });
}
export async function actOnOrder(
  id: string,
  body: any,
  p: Profile,
  store: Store,
) {
  return store.transaction(async (tx, writes) => {
    const order = await store.get<Order>("orders/" + id, tx);
    demand(
      order && (p.role === "bar" || order.uid === p.uid),
      "Prenotazione non trovata.",
      404,
    );
    const action = body.action;
    if (action === "cancel") {
      if (order.status === "cancelled") return order;
      demand(
        order.status === "confirmed" ||
          (p.role === "bar" && ["preparing", "ready"].includes(order.status)),
        "Annullamento non disponibile.",
        409,
      );
      if (p.role !== "bar") {
        const settings = await store.get<Settings>("config/service", tx);
        demand(settings, "Servizio non configurato.", 503);
        validateDate(order.date, order.slot, { ...settings, accepting: true });
      }
      const ledger = await store.get<DayLedger>("days/" + order.date, tx);
      demand(ledger, "Disponibilità da verificare.", 409);
      writes.push(store.write("days/" + order.date, release(order, ledger)));
      order.status = "cancelled";
      if (order.paymentStatus === "paid")
        order.paymentStatus = "refund_required";
    } else {
      demand(p.role === "bar");
      if (action === "paid") {
        demand(
          order.paymentMethod === "counter" &&
            order.paymentStatus === "due" &&
            order.status !== "cancelled",
          "Incasso non registrabile.",
          409,
        );
        order.paymentStatus = "paid";
      } else if (action === "refund") {
        demand(
          order.paymentMethod === "counter" &&
            order.paymentStatus === "refund_required",
          "Per Nexi effettua il rimborso dal portale e verifica l’esito.",
          409,
        );
        order.paymentStatus = "refunded";
      } else if (action === "prepare") {
        demand(
          order.status === "confirmed" &&
            (order.paymentMethod === "counter" ||
              order.paymentStatus === "paid"),
          "Ordine non preparabile: verifica stato e pagamento.",
          409,
        );
        order.status = "preparing";
      } else if (action === "ready") {
        demand(
          order.status === "preparing",
          "Avvia prima la preparazione.",
          409,
        );
        order.status = "ready";
      } else if (action === "collect") {
        demand(
          order.status === "ready" && order.paymentStatus === "paid",
          "Ordine non pronto oppure non saldato.",
          409,
        );
        demand(
          typeof body.code === "string" &&
            body.code.toUpperCase() === order.pickupCode,
          "Codice di ritiro non corretto.",
          400,
        );
        demand(
          inPickupWindow(order.date, order.slot),
          "Ritiro consentito solo nel giorno e nella fascia prenotata.",
          409,
        );
        order.status = "collected";
      } else throw new HttpError(400, "Operazione sconosciuta.");
    }
    order.updatedAt = new Date().toISOString();
    writes.push(store.write("orders/" + id, order));
    audit(store, writes, p, "order_" + action, id);
    return order;
  });
}
async function handle(request: Request, env: Env, store: Store) {
  const url = new URL(request.url),
    path = url.pathname,
    method = request.method;
  if (path === "/webhooks/nexi" && method === "POST")
    return webhook(await jsonBody(request), env, store);
  await appCheck(request, env);
  const p = await identity(request, env, store, true);
  if (path === "/profile" && method === "GET") {
    demand(p, "Accedi per continuare.", 401);
    return p;
  }
  if (path === "/staff/session" && method === "POST") {
    demand(p, "Accedi per continuare.", 401);
    return staffSession(p, (await jsonBody(request)).code, env, store);
  }
  if (p && ["bar", "school_admin"].includes(p.role))
    await privileged(request, env, p);
  if (path === "/bootstrap" && method === "GET") {
    const [catalog, settings] = await Promise.all([
      store.get<Catalog>("config/catalog"),
      store.get<Settings>("config/service"),
    ]);
    demand(
      catalog && settings,
      "Catalogo e servizio devono essere inizializzati.",
      503,
    );
    const bar = p?.role === "bar",
      school = p?.role === "school_admin";
    const today = rome().date;
    const [orders, users, logs] = await Promise.all([
      p
        ? store.query<Order>(
            "orders",
            bar
              ? [
                  {
                    field: "date",
                    op: "EQUAL",
                    value: availableDates(settings)[0] || today,
                  },
                ]
              : [{ field: "uid", op: "EQUAL", value: p.uid }],
          )
        : [],
      school ? store.query<Profile>("users", [], 2000) : [],
      bar || school
        ? store.query<Audit>("audit", [], 100, {
            orderBy: "at",
            truncate: true,
          })
        : [],
    ]);
    const snap: Snapshot = {
      profile: p,
      products: catalog.products,
      ingredients: bar ? catalog.ingredients : [],
      catalogVersion: catalog.version,
      settings,
      orders: orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      users,
      audit: logs,
      nexiEnabled: nexiEnabled(env),
    };
    return snap;
  }
  if (path === "/bar/orders" && method === "GET") {
    demand(p, "Accedi.", 401);
    await privileged(request, env, p, "bar");
    const date = url.searchParams.get("date") || "";
    demand(/^\d{4}-\d{2}-\d{2}$/.test(date), "Data non valida.", 400);
    return store.query<Order>(
      "orders",
      [{ field: "date", op: "EQUAL", value: date }],
      2500,
    );
  }
  if (path === "/availability" && method === "GET") {
    const date = url.searchParams.get("date") || "";
    demand(/^\d{4}-\d{2}-\d{2}$/.test(date), "Data non valida.", 400);
    return (await store.get<DayLedger>("days/" + date)) || blankLedger();
  }
  demand(p, "Accedi per continuare.", 401);
  demand(
    p.approved || path === "/budget",
    "Account in attesa di approvazione.",
  );
  await privileged(request, env, p);
  demand(["POST", "PUT"].includes(method), "Risorsa non trovata.", 404);
  await rateLimit(p.uid, store);
  const body = await jsonBody(request);
  if (path === "/orders" && method === "POST")
    return createOrder(body, p, env, store);
  const orderRoute = path.match(
    /^\/orders\/([a-f0-9]{18})\/(action|payment|reconcile)$/,
  );
  if (orderRoute && method === "POST") {
    const [, id, action] = orderRoute;
    if (action === "action") return actOnOrder(id, body, p, store);
    const order = await store.get<Order>("orders/" + id);
    demand(
      order && (order.uid === p.uid || p.role === "bar"),
      "Ordine non trovato.",
      404,
    );
    return action === "payment"
      ? startPayment(id, p, env, store)
      : reconcilePayment(id, env, store);
  }
  if (path === "/catalog" && method === "PUT") {
    await privileged(request, env, p, "bar");
    const c = validateCatalog(body as Catalog);
    return store.transaction(async (tx, writes) => {
      const previous = await store.get<Catalog>("config/catalog", tx);
      ensure(
        previous?.version === c.version,
        "Il catalogo è cambiato. Aggiorna prima di salvare.",
      );
      for (const old of previous.ingredients)
        ensure(
          c.ingredients.some((i) => i.id === old.id && i.unit === old.unit),
          "Conserva codici e unità degli ingredienti esistenti: servono per lo storico e il fabbisogno.",
        );
      const next = {
        products: c.products,
        ingredients: c.ingredients,
        version: c.version + 1,
        updatedAt: new Date().toISOString(),
      };
      writes.push(store.write("config/catalog", next));
      audit(store, writes, p, "catalog_updated", String(next.version));
      return { version: next.version };
    });
  }
  if (path === "/settings" && method === "PUT") {
    await privileged(request, env, p, "school_admin");
    const old = await store.get<Settings>("config/service");
    demand(old, "Servizio non configurato.", 503);
    const next = validateSettings({
      bookingDays: body.bookingDays,
      weekdays: body.weekdays,
      closedDates: body.closedDates,
      capacity: body.capacity,
      cutoff: body.cutoff,
      accepting: body.accepting,
      notice: body.notice,
      schoolName: old.schoolName,
      termsVersion: old.termsVersion,
    });
    await store.transaction(async (_tx, writes) => {
      writes.push(store.write("config/service", next));
      audit(store, writes, p, "service_updated", "config/service");
    });
    return { ok: true };
  }
  const userRoute = path.match(/^\/users\/([A-Za-z0-9_-]{1,128})\/action$/);
  if (userRoute && method === "POST") {
    await privileged(request, env, p, "school_admin");
    demand(
      ["approve", "disable", "enable"].includes(body.action),
      "Azione non valida.",
      400,
    );
    return store.transaction(async (tx, writes) => {
      const target = await store.get<Profile>("users/" + userRoute[1], tx);
      demand(
        target && ["student", "staff"].includes(target.role),
        "Gestione consentita solo per studenti e personale.",
      );
      if (body.action === "approve") target.approved = true;
      else target.disabled = body.action === "disable";
      writes.push(store.write("users/" + target.uid, target));
      audit(store, writes, p, "account_" + body.action, target.uid);
      return { ok: true };
    });
  }
  if (path === "/budget" && method === "PUT") {
    ensure(
      Number.isInteger(body.budgetCents) &&
        body.budgetCents >= 0 &&
        body.budgetCents <= 100000,
      "Budget non valido.",
    );
    await store.transaction(async (tx, writes) => {
      const profile = await store.get<Profile>("users/" + p.uid, tx);
      demand(profile);
      writes.push(
        store.write("users/" + p.uid, {
          ...profile,
          budgetCents: body.budgetCents,
        }),
      );
    });
    return { ok: true };
  }
  throw new HttpError(404, "Risorsa non trovata.");
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    const headers: Record<string, string> = {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      Vary: "Origin",
    };
    if (origin === env.ALLOWED_ORIGIN) {
      headers["Access-Control-Allow-Origin"] = origin;
      headers["Access-Control-Allow-Headers"] =
        "Authorization, Content-Type, X-Firebase-AppCheck, X-Staff-Session";
      headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, OPTIONS";
    }
    try {
      if (new URL(request.url).pathname !== "/webhooks/nexi")
        demand(origin === env.ALLOWED_ORIGIN, "Origine non consentita.");
      if (request.method === "OPTIONS")
        return new Response(null, { status: 204, headers });
      const data = await handle(request, env, new Store(env));
      return new Response(JSON.stringify(data), { status: 200, headers });
    } catch (e) {
      const expected = e instanceof HttpError;
      const validation =
        e instanceof Error &&
        !["StoreError", "TypeError", "SyntaxError"].includes(
          e.constructor.name,
        ) &&
        !expected;
      const status = expected ? e.status : validation ? 400 : 503;
      const message =
        expected || validation
          ? (e as Error).message
          : "Servizio temporaneamente non disponibile. Riprova senza duplicare la prenotazione.";
      return new Response(JSON.stringify({ error: message }), {
        status,
        headers,
      });
    }
  },
};
