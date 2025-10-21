import crypto from "crypto";

export function verifyTelegramAuth(
  data: Record<string, any>,
  botToken: string,
  maxAgeSeconds = 24 * 60 * 60
) {
  const hash = String(data.hash ?? "");
  if (!hash) return false;

  const payload: Record<string, string> = {};
  Object.keys(data).forEach((k) => {
    if (k === "hash") return;
    const v = data[k];
    payload[k] = Array.isArray(v) ? v.join(",") : String(v ?? "");
  });

  const keys = Object.keys(payload).sort();
  const dataCheckString = keys.map((k) => `${k}=${payload[k]}`).join("\n");

  const secretKey = crypto.createHash("sha256").update(botToken).digest();
  const hmac = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const hmacBuf = Buffer.from(hmac, "hex");
  const hashBuf = Buffer.from(hash, "hex");
  if (hmacBuf.length !== hashBuf.length) return false;
  if (!crypto.timingSafeEqual(hmacBuf, hashBuf)) return false;

  // freshness
  const authDate = parseInt(String(payload.auth_date || "0"), 10);
  const now = Math.floor(Date.now() / 1000);
  if (!authDate || Math.abs(now - authDate) > maxAgeSeconds) return false;

  return true;
}
