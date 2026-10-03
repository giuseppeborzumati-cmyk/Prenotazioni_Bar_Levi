import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
const [email, role] = process.argv.slice(2);
if (!email || !["bar", "school_admin", "student", "staff"].includes(role))
  throw new Error(
    "Uso: npm run roles -- email@dominio.it bar|school_admin|student|staff",
  );
initializeApp({
  credential: applicationDefault(),
  projectId: "bar-prenotazione-levi",
});
const auth = getAuth(),
  db = getFirestore();
const user = await auth.getUserByEmail(email);
if (!user.emailVerified)
  throw new Error(
    "Verificare prima l’email del titolare. Non usare email condivise o inventate.",
  );
const ref = db.doc("users/" + user.uid);
const old = (await ref.get()).data();
if (!old)
  throw new Error(
    "Il titolare deve prima registrarsi nel sito per creare il profilo.",
  );
// A profile/claim mismatch is denied by the API while this operation is in progress.
await ref.update({ role, approved: true, disabled: false });
await auth.setCustomUserClaims(user.uid, { ...user.customClaims, role });
await auth.revokeRefreshTokens(user.uid);
await db.collection("audit").add({
  at: new Date().toISOString(),
  actor: "trusted-admin-script",
  action: "role_" + role,
  target: user.uid,
});
console.log(
  `Ruolo ${role} assegnato a UID ${user.uid}. Il titolare deve uscire e accedere nuovamente. Per ruoli riservati configurare anche TOTP.`,
);
