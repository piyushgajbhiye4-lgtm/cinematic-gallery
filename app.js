// Paste your Google OAuth Client ID below. Never put a Client Secret here.
const GOOGLE_CLIENT_ID = "281417858143-vc2tcg31eopda5umdb24bjpjqn2pgm38.apps.googleusercontent.com";
const API_BASE = "https://cinematic-gallery-api.piyushgajbhiye4.workers.dev";

const $ = (id) => document.getElementById(id);
let idToken = null;
let objectUrls = [];

function showLogin(message) {
  $("galleryView").classList.add("hidden");
  $("loginView").classList.remove("hidden");
  if (message) $("loginMessage").textContent = message;
}

function showGallery(user) {
  $("loginView").classList.add("hidden");
  $("galleryView").classList.remove("hidden");
  $("rolePill").textContent = String(user.role || "viewer").toUpperCase();
  $("userEmail").textContent = user.email || "";
}

async function api(path, options = {}) {
  const response = await fetch(API_BASE + path, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: "Bearer " + idToken }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed (" + response.status + ")");
  return data;
}

async function onGoogleCredential(response) {
  idToken = response.credential;
  $("loginMessage").textContent = "Verifying your invitation…";
  try {
    const user = await api("/login", { method: "POST" });
    showGallery(user);
    await loadPhotos();
  } catch (error) {
    idToken = null;
    showLogin(error.message || "Access could not be verified.");
  }
}

async function loadPhotos() {
  $("galleryMessage").textContent = "Loading your collection…";
  $("photoGrid").replaceChildren();
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
  objectUrls = [];

  try {
    const result = await api("/photos");
    const files = result.files || [];
    $("photoCount").textContent = files.length + " PHOTOS";
    if (!files.length) {
      $("galleryMessage").textContent = "No photos found in the connected Drive folder yet.";
      return;
    }
    $("galleryMessage").textContent = "";

    for (const file of files) {
      const figure = document.createElement("figure");
      figure.className = "photo-card";
      const img = document.createElement("img");
      img.alt = file.name || "Gallery photo";
      img.loading = "lazy";
      const caption = document.createElement("figcaption");
      caption.textContent = file.name || "Untitled memory";
      figure.append(img, caption);
      $("photoGrid").append(figure);

      try {
        const response = await fetch(API_BASE + "/photo?id=" + encodeURIComponent(file.id), {
          headers: { Authorization: "Bearer " + idToken }
        });
        if (!response.ok) throw new Error("Image unavailable");
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        objectUrls.push(objectUrl);
        img.src = objectUrl;
        figure.addEventListener("click", () => {
          $("lightboxImage").src = objectUrl;
          $("lightboxCaption").textContent = file.name || "";
          $("lightbox").classList.remove("hidden");
        });
      } catch {
        figure.remove();
      }
    }
    if (!$("photoGrid").children.length) {
      $("galleryMessage").textContent = "Photos could not be loaded. Refresh and try again.";
    }
  } catch (error) {
    $("galleryMessage").textContent = error.message || "Could not load photos.";
  }
}

function initializeGoogle() {
  if (GOOGLE_CLIENT_ID === "PASTE_GOOGLE_CLIENT_ID_HERE") {
    $("loginMessage").textContent = "Setup needed: add your Google Client ID in app.js.";
    return;
  }
  if (!window.google || !google.accounts || !google.accounts.id) {
    $("loginMessage").textContent = "Google sign-in is loading. Refresh this page in a moment.";
    return;
  }
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: onGoogleCredential,
    auto_select: false
  });
  google.accounts.id.renderButton($("googleButton"), {
    theme: "filled_black", size: "large", shape: "rectangular",
    text: "continue_with", width: 260
  });
}

$("logoutButton").addEventListener("click", () => {
  idToken = null;
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
  objectUrls = [];
  $("photoGrid").replaceChildren();
  if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
  showLogin("You have signed out.");
});
$("closeLightbox").addEventListener("click", () => $("lightbox").classList.add("hidden"));
$("lightbox").addEventListener("click", (event) => {
  if (event.target === $("lightbox")) $("lightbox").classList.add("hidden");
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") $("lightbox").classList.add("hidden");
});
window.addEventListener("load", () => setTimeout(initializeGoogle, 500));
