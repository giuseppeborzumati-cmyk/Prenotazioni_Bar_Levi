import type { Order, Profile } from "../shared/types";
import { demand, equal } from "./security";
import { Store, type Env } from "./store";
interface Payment {
  state: "starting" | "ready";
  url?: string;
  securityToken?: string;
  createdAt: string;
  checkedAt?: string;
}
export function nexiEnabled(env: Env) {
  return (
    env.NEXI_ENABLED === "true" && !!env.NEXI_API_KEY && !!env.PUBLIC_API_URL
  );
}
async function nexi(env: Env, path: string, body?: unknown) {
  demand(nexiEnabled(env), "Pagamenti online non attivi.", 503);
  const host =
    env.NEXI_ENV === "production"
      ? "xpay.nexigroup.com"
      : "xpaysandbox.nexigroup.com";
  const r = await fetch(`https://${host}/api/phoenix-0.0/psp/api/v1${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "X-Api-Key": env.NEXI_API_KEY!,
      "Correlation-Id": crypto.randomUUID(),
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  demand(
    r.ok,
    "Esito Nexi non disponibile. Non ripetere un addebito: usa “Verifica pagamento” o contatta il bar.",
    502,
  );
  return r.json() as Promise<any>;
}
export function trustedPaymentUrl(value: string) {
  const u = new URL(value);
  demand(
    u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      ["xpay.nexigroup.com", "xpaysandbox.nexigroup.com"].includes(u.hostname),
    "Pagina Nexi non riconosciuta: verifica la configurazione.",
    502,
  );
  return u.href;
}
export async function startPayment(
  id: string,
  p: Profile,
  env: Env,
  store: Store,
) {
  demand(nexiEnabled(env), "Pagamenti online non attivi.", 503);
  const result = await store.transaction(async (tx, writes) => {
    const order = await store.get<Order>("orders/" + id, tx);
    demand(order && order.uid === p.uid, "Prenotazione non trovata.", 404);
    demand(
      order.paymentMethod === "nexi" &&
        order.paymentStatus === "pending" &&
        order.status === "confirmed",
      "Questa prenotazione non può essere pagata online.",
      409,
    );
    const payment = await store.get<Payment>("payments/" + id, tx);
    if (payment?.url) return { order, url: trustedPaymentUrl(payment.url) };
    demand(
      !payment,
      "Richiesta di pagamento già avviata. Verifica l’esito prima di riprovare.",
      409,
    );
    writes.push(
      store.write(
        "payments/" + id,
        { state: "starting", createdAt: new Date().toISOString() },
        true,
      ),
    );
    return { order, url: "" };
  });
  if (result.url) return { url: result.url };
  const origin = new URL(env.ALLOWED_ORIGIN);
  demand(
    origin.protocol === "https:" &&
      new URL(env.PUBLIC_API_URL!).protocol === "https:",
    "URL HTTPS da configurare.",
    503,
  );
  // A network timeout leaves the attempt locked. Never start an ambiguous second charge.
  const answer = await nexi(env, "/orders/hpp", {
    order: {
      orderId: id,
      amount: String(result.order.totalCents),
      currency: "EUR",
      description: "Prenotazione Bar Levi",
    },
    paymentSession: {
      actionType: "PAY",
      amount: String(result.order.totalCents),
      language: "ita",
      captureType: "IMPLICIT",
      recurrence: { action: "NO_RECURRING" },
      resultUrl: origin.origin + "/payment-return?order=" + id,
      cancelUrl: origin.origin + "/payment-cancel?order=" + id,
      notificationUrl:
        env.PUBLIC_API_URL!.replace(/\/$/, "") + "/webhooks/nexi",
    },
  });
  const url = trustedPaymentUrl(answer.hostedPage);
  demand(
    typeof answer.securityToken === "string" &&
      answer.securityToken.length >= 16,
    "Token Nexi mancante.",
    502,
  );
  await store.put("payments/" + id, {
    state: "ready",
    url,
    securityToken: answer.securityToken,
    createdAt: new Date().toISOString(),
  });
  return { url };
}
export function providerStatus(
  answer: any,
  order: Order,
): Order["paymentStatus"] | null {
  const status = answer?.orderStatus,
    details = status?.order;
  demand(
    details?.orderId === order.id &&
      details.currency === "EUR" &&
      details.amount === String(order.totalCents),
    "Dati del pagamento non corrispondenti alla prenotazione.",
    409,
  );
  const captured = String(status.capturedAmount ?? "");
  demand(
    /^\d+$/.test(captured),
    "Esito di contabilizzazione non disponibile.",
    502,
  );
  const ops = Array.isArray(answer.operations) ? answer.operations : [];
  const reverted = new Set(
    ops
      .filter(
        (x: any) =>
          x.operationType === "CANCEL" && x.operationResult === "EXECUTED",
      )
      .map((x: any) => x.cancelledOperationId),
  );
  const refunded = ops
    .filter(
      (x: any) =>
        x.orderId === order.id &&
        x.operationType === "REFUND" &&
        ["REFUNDED", "EXECUTED"].includes(x.operationResult) &&
        x.operationCurrency === "EUR" &&
        !reverted.has(x.operationId),
    )
    .reduce((n: number, x: any) => n + (Number(x.operationAmount) || 0), 0);
  if (refunded === order.totalCents) return "refunded";
  if (
    refunded === 0 &&
    Number(captured) === order.totalCents &&
    status.lastOperationType !== "REFUND"
  )
    return order.status === "cancelled" ? "refund_required" : "paid";
  if (refunded > 0 || Number(captured) > 0) return "refund_required"; // Operator must resolve partial or inconsistent amounts.
  return null; // A redirect, an authorization or an unknown status is never proof of collection.
}
export async function reconcilePayment(id: string, env: Env, store: Store) {
  const previous = await store.get<Order>("orders/" + id);
  demand(
    previous?.paymentMethod === "nexi",
    "Pagamento Nexi non presente.",
    404,
  );
  const answer = await nexi(env, "/orders/" + encodeURIComponent(id));
  return store.transaction(async (tx, writes) => {
    const order = await store.get<Order>("orders/" + id, tx);
    demand(order, "Prenotazione non trovata.", 404);
    const status = providerStatus(answer, order);
    if (status && status !== order.paymentStatus) {
      order.paymentStatus = status;
      order.updatedAt = new Date().toISOString();
      writes.push(store.write("orders/" + id, order));
      const auditId = crypto.randomUUID();
      writes.push(
        store.write("audit/" + auditId, {
          id: auditId,
          at: order.updatedAt,
          actor: "Nexi · verifica server",
          action: "payment_" + status,
          target: id,
        }),
      );
    }
    return { paymentStatus: order.paymentStatus };
  });
}
export async function webhook(body: any, env: Env, store: Store) {
  const id = body?.operation?.orderId;
  demand(
    typeof id === "string" && /^[a-f0-9]{18}$/.test(id),
    "Notifica non valida.",
    400,
  );
  const payment = await store.get<Payment>("payments/" + id);
  demand(
    payment?.securityToken && equal(payment.securityToken, body.securityToken),
    "Notifica non autorizzata.",
    401,
  );
  return reconcilePayment(id, env, store);
}
