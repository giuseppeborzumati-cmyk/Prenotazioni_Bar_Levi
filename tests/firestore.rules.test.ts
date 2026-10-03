import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-levi",
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: await readFile(
        new URL("../firestore.rules", import.meta.url),
        "utf8",
      ),
    },
  });
});
beforeEach(() => env.clearFirestore());
afterAll(() => env.cleanup());
const client = (
  uid = "alice",
  provider: "password" | "anonymous" = "password",
  role?: string,
) =>
  env
    .authenticatedContext(uid, {
      email: uid + "@example.test",
      email_verified: true,
      firebase: { sign_in_provider: provider },
      ...(role ? { role } : {}),
    })
    .firestore();
const profile = () => ({
  uid: "alice",
  email: "alice@example.test",
  name: "Alice Esempio",
  role: "student",
  requestedRole: "student",
  className: "3L",
  staffCategory: "",
  approved: false,
  disabled: false,
  budgetCents: 2000,
  createdAt: serverTimestamp(),
});
it("consente solo la creazione del proprio profilo non approvato", async () => {
  const db = client();
  await assertSucceeds(setDoc(doc(db, "users/alice"), profile()));
  expect((await assertSucceeds(getDoc(doc(db, "users/alice")))).exists()).toBe(
    true,
  );
  await assertFails(updateDoc(doc(db, "users/alice"), { approved: true }));
});
it("nega escalation, categorie incoerenti e campi nascosti", async () => {
  const db = client();
  for (const patch of [
    { role: "bar", requestedRole: "bar" },
    { approved: true },
    { staffCategory: "dirigente" },
    { admin: true },
    { createdAt: new Date(0) },
  ])
    await assertFails(
      setDoc(doc(db, "users/alice"), { ...profile(), ...patch }),
    );
});
it("nega registrazione anonima e profili altrui", async () => {
  await assertFails(
    setDoc(doc(client("alice", "anonymous"), "users/alice"), profile()),
  );
  await assertFails(setDoc(doc(client(), "users/bob"), profile()));
  await assertFails(
    getDoc(doc(env.unauthenticatedContext().firestore(), "users/alice")),
  );
});
it("nega elenco utenti e ogni accesso diretto a ordini, pagamenti, ruoli e catalogo anche ai claim bar", async () => {
  for (const db of [
    client(),
    client("bar", "password", "bar"),
    client("school", "password", "school_admin"),
  ]) {
    await assertFails(getDocs(collection(db, "users")));
    for (const path of [
      "orders/one",
      "payments/one",
      "config/catalog",
      "days/2026-10-05",
      "audit/one",
      "staffSecurity/bar",
    ]) {
      await assertFails(getDoc(doc(db, path)));
      await assertFails(setDoc(doc(db, path), { test: true }));
    }
  }
});
