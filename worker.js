const ALLOWED_ORIGIN = "https://piyushgajbhiye4-lgtm.github.io";
const GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Vary": "Origin"
    }
  });
}

function decodeBase64Url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

function decodeJwtPart(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

async function verifyGoogleIdToken(token, env) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid Google credential.");
  const header = decodeJwtPart(parts[0]);
  const claims = decodeJwtPart(parts[1]);

  if (header.alg !== "RS256" || !header.kid) throw new Error("Unsupported Google credential.");
  if (!["https://accounts.google.com", "accounts.google.com"].includes(claims.iss)) {
    throw new Error("Credential issuer is invalid.");
  }
  if (claims.aud !== env.GOOGLE_CLIENT_ID) throw new Error("Credential audience does not match this website.");
  if (!claims.exp || claims.exp * 1000 < Date.now()) throw new Error("Google sign-in expired. Please sign in again.");
  if (!claims.email || claims.email_verified !== true) throw new Error("Google email is not verified.");

  const certResponse = await fetch(GOOGLE_CERTS_URL);
  if (!certResponse.ok) throw new Error("Could not retrieve Google's signing keys.");
  const certData = await certResponse.json();
  const jwk = (certData.keys || []).find(key => key.kid === header.kid);
  if (!jwk) throw new Error("Google signing key was not found.");

  const publicKey = await crypto.subtle.importKey(
    "jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]
  );
  const signedData = new TextEncoder().encode(parts[0] + "." + parts[1]);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5", publicKey, decodeBase64Url(parts[2]), signedData
  );
  if (!valid) throw new Error("Google credential signature is invalid.");

  const email = String(claims.email).trim().toLowerCase();
  const adminEmail = String(env.ADMIN_EMAIL || "").trim().toLowerCase();
  const viewerEmails = String(env.VIEWER_EMAILS || "")
    .split(",").map(item => item.trim().toLowerCase()).filter(Boolean);

  if (email === adminEmail && adminEmail) return { email, role: "admin" };
  if (viewerEmails.includes(email)) return { email, role: "viewer" };
  throw new Error("This Google account is not on the invited list.");
}

async function requireUser(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new Error("Please sign in with Google first.");
  return verifyGoogleIdToken(match[1], env);
}

function pemToArrayBuffer(pem) {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "").replace(/\s/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function getGoogleDriveToken(env) {
  const service = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const now = Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();
  const jwtHeader = toBase64Url(encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const jwtClaims = toBase64Url(encoder.encode(JSON.stringify({
    iss: service.client_email,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  })));
  const unsignedJwt = jwtHeader + "." + jwtClaims;
  const privateKey = await crypto.subtle.importKey(
    "pkcs8", pemToArrayBuffer(service.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, encoder.encode(unsignedJwt));
  const assertion = unsignedJwt + "." + toBase64Url(signature);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error_description || result.error || "Google Drive authorization failed.");
  return result.access_token;
}

async function listDrivePhotos(env) {
  const accessToken = await getGoogleDriveToken(env);
  const params = new URLSearchParams({
    q: "'" + env.GOOGLE_FOLDER_ID + "' in parents and trashed = false",
    pageSize: "100",
    orderBy: "name",
    fields: "files(id,name,mimeType,createdTime),nextPageToken"
  });
  const response = await fetch("https://www.googleapis.com/drive/v3/files?" + params.toString(), {
    headers: { Authorization: "Bearer " + accessToken }
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error && result.error.message ? result.error.message : "Could not list Google Drive photos.");
  return (result.files || []).filter(file => file.mimeType && file.mimeType.startsWith("image/"));
}

async function getDrivePhoto(env, fileId) {
  const accessToken = await getGoogleDriveToken(env);
  const response = await fetch(
    "https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(fileId) + "?alt=media",
    { headers: { Authorization: "Bearer " + accessToken } }
  );
  if (!response.ok) throw new Error("Could not retrieve this photo from Google Drive.");
  return new Response(response.body, {
    status: 200,
    headers: {
      "Content-Type": response.headers.get("Content-Type") || "application/octet-stream",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Vary": "Origin"
    }
  });
}

async function notifyTelegram(env, user) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  const message = "🔐 Cinematic Gallery visit\nAccount: " + user.email +
    "\nRole: " + user.role + "\nTime: " + new Date().toISOString();
  const url = "https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/sendMessage";
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: message })
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (origin && origin !== ALLOWED_ORIGIN) return json({ error: "Origin not allowed." }, 403);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
          "Access-Control-Max-Age": "86400",
          "Vary": "Origin"
        }
      });
    }

    const url = new URL(request.url);
    try {
      if (url.pathname === "/health" && request.method === "GET") {
        return json({ success: true, service: "cinematic-gallery-api" });
      }

      if (url.pathname === "/login" && request.method === "POST") {
        const user = await requireUser(request, env);
        await notifyTelegram(env, user);
        return json({ success: true, email: user.email, role: user.role });
      }

      if (url.pathname === "/photos" && request.method === "GET") {
        const user = await requireUser(request, env);
        const files = await listDrivePhotos(env);
        return json({ success: true, role: user.role, files });
      }

      if (url.pathname === "/photo" && request.method === "GET") {
        await requireUser(request, env);
        const fileId = url.searchParams.get("id") || "";
        if (!/^[a-zA-Z0-9_-]+$/.test(fileId)) return json({ error: "Invalid photo ID." }, 400);
        return await getDrivePhoto(env, fileId);
      }

      return json({ error: "Not found." }, 404);
    } catch (error) {
      const message = error && error.message ? error.message : "Unexpected server error.";
      const status = message.includes("not on the invited list") ? 403 : 401;
      return json({ error: message }, status);
    }
  }
};
