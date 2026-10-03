import { randomBytes } from "node:crypto";
const label = process.argv[2];
if (!label)
  throw new Error("Uso: node scripts/generate-totp.mjs email-del-titolare");
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
let value = 0,
  bits = 0,
  secret = "";
for (const byte of randomBytes(20)) {
  value = (value << 8) | byte;
  bits += 8;
  while (bits >= 5) {
    bits -= 5;
    secret += alphabet[(value >>> bits) & 31];
  }
}
console.log(
  "RISERVATO — eseguire solo sul computer del responsabile, non in Actions né in chat pubbliche.",
);
console.log(
  "Segreto da inserire nell’app autenticatore e nel secret Worker STAFF_TOTP_SECRETS:",
);
console.log(secret);
console.log("URI di importazione locale:");
console.log(
  "otpauth://totp/" +
    encodeURIComponent("Bar Levi:" + label) +
    "?secret=" +
    secret +
    "&issuer=Bar%20Levi&algorithm=SHA1&digits=6&period=30",
);
