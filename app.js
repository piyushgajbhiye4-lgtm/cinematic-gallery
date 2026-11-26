// Cinematic Gallery - Photos + Videos from the same private Google Drive folder.

const GOOGLE_CLIENT_ID = "281417858143-vc2tcg31eopda5umdb24bjpjqn2pgm38.apps.googleusercontent.com";
const API_BASE = "https://cinematic-gallery-api.piyushgajbhiye4.workers.dev";

const $ = (id) => document.getElementById(id);

let idToken = null;
let objectUrls = [];
let activeTab = "photos";
let refreshHandle = null;


// -------------------- LOGIN / GALLERY --------------------

function showLogin(message) {
  $("galleryView").classList.add("hidden");
  $("loginView").classList.remove("hidden");

  if (message) {
    $("loginMessage").textContent = message;
  }
}

function showGallery(user) {
  $("loginView").classList.add("hidden");
  $("galleryView").classList.remove("hidden");

  $("rolePill").textContent = String(user.role || "viewer").toUpperCase();
  $("userEmail").textContent = user.email || "";
}


// -------------------- API --------------------

async function api(path, options = {}) {
  const response = await fetch(API_BASE + path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: "Bearer " + idToken
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Request failed (" + response.status + ")");
  }

  return data;
}


async function authorizedMediaBlob(file) {
  const response = await fetch(
    API_BASE + "/media-file?id=" + encodeURIComponent(file.id),
    {
      headers: {
        Authorization: "Bearer " + idToken
      }
    }
  );

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Media could not be loaded.");
  }

  return response.blob();
}


// -------------------- MEDIA URL MANAGEMENT --------------------

function revokeMediaUrls() {
  objectUrls.forEach(url => URL.revokeObjectURL(url));
  objectUrls = [];
}


// -------------------- TAB SWITCHING --------------------

function setTab(tab) {
  activeTab = tab;

  document.querySelectorAll(".media-tab").forEach(button => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });

  $("photoGrid").classList.toggle("hidden", tab !== "photos");
  $("videoGrid").classList.toggle("hidden", tab !== "videos");

  const count = tab === "photos"
    ? $("photoTabCount").textContent
    : $("videoTabCount").textContent;

  $("galleryMessage").textContent = Number(count)
    ? ""
    : (
        tab === "photos"
          ? "No photos found in the connected Drive folder yet."
          : "No videos found in the connected Drive folder yet."
      );
}


// -------------------- VIDEO PLAYER --------------------

async function openVideo(file) {
  $("galleryMessage").textContent = "Loading video…";

  try {
    const blob = await authorizedMediaBlob(file);

    const url = URL.createObjectURL(blob);
    objectUrls.push(url);

    $("galleryVideo").src = url;
    $("videoCaption").textContent = file.name || "Gallery video";

    $("videoLightbox").classList.remove("hidden");
    $("galleryMessage").textContent = "";

    $("galleryVideo").play().catch(() => {});

  } catch (error) {
    console.error("Video loading failed:", error);

    $("galleryMessage").textContent =
      error.message || "Video could not be opened.";
  }
}


function closeVideo() {
  $("galleryVideo").pause();
  $("galleryVideo").removeAttribute("src");
  $("galleryVideo").load();

  $("videoLightbox").classList.add("hidden");

  revokeMediaUrls();
}


// -------------------- VIDEO CARDS --------------------

function createVideoCards(videos) {
  $("videoGrid").replaceChildren();

  for (const file of videos) {
    const figure = document.createElement("figure");

    figure.className = "video-card";
    figure.tabIndex = 0;

    figure.setAttribute("role", "button");
    figure.setAttribute(
      "aria-label",
      "Play " + (file.name || "video")
    );

    const art = document.createElement("div");
    art.className = "video-art";
    art.textContent = "▶";

    const play = document.createElement("span");
    play.className = "play-button";
    play.textContent = "▶";

    const caption = document.createElement("figcaption");
    caption.textContent = file.name || "Untitled video";

    figure.append(art, play, caption);

    figure.addEventListener("click", () => {
      openVideo(file);
    });

    figure.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openVideo(file);
      }
    });

    $("videoGrid").append(figure);
  }
}


// -------------------- PHOTO LOADING --------------------

async function loadPhotoCards(photos) {
  $("photoGrid").replaceChildren();

  for (const file of photos) {
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
      const blob = await authorizedMediaBlob(file);

      const objectUrl = URL.createObjectURL(blob);
      objectUrls.push(objectUrl);

      img.src = objectUrl;

      figure.addEventListener("click", () => {
        $("lightboxImage").src = objectUrl;
        $("lightboxCaption").textContent = file.name || "";
        $("lightbox").classList.remove("hidden");
      });

    } catch (error) {
      console.error("Photo loading failed:", file.name, error);
      figure.remove();
    }
  }
}


// -------------------- LOAD ALL MEDIA --------------------

async function loadMedia() {
  if (!idToken) return;

  try {
    const result = await api("/media");

    const files = Array.isArray(result.files)
      ? result.files
      : [];

    const photos = files.filter(file =>
      (file.mimeType || "").startsWith("image/")
    );

    const videos = files.filter(file =>
      (file.mimeType || "").startsWith("video/")
    );

    // Update counts.
    $("photoCount").textContent =
      photos.length + " PHOTOS · " + videos.length + " VIDEOS";

    $("photoTabCount").textContent = photos.length;
    $("videoTabCount").textContent = videos.length;

    $("galleryMessage").textContent = "";

    // IMPORTANT: Display all video cards FIRST.
    // Do not wait for photo downloads.

    createVideoCards(videos);

    // Then load photos.
    await loadPhotoCards(photos);

    if (activeTab === "photos" && !photos.length) {
      $("galleryMessage").textContent =
        "No photos found in the connected Drive folder yet.";
    }

    if (activeTab === "videos" && !videos.length) {
      $("galleryMessage").textContent =
        "No videos found in the connected Drive folder yet.";
    }

  } catch (error) {
    console.error("Gallery loading error:", error);

    $("galleryMessage").textContent =
      error.message || "Could not load your collection.";
  }
}


// -------------------- GOOGLE SIGN-IN --------------------

function initializeGoogle() {
  if (!window.google || !google.accounts || !google.accounts.id) {
    $("loginMessage").textContent =
      "Google sign-in is loading. Refresh this page in a moment.";

    return;
  }

  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: onGoogleCredential,
    auto_select: false
  });

  google.accounts.id.renderButton($("googleButton"), {
    theme: "filled_black",
    size: "large",
    shape: "rectangular",
    text: "continue_with",
    width: 260
  });
}


async function onGoogleCredential(response) {
  idToken = response.credential;

  $("loginMessage").textContent = "Verifying your invitation…";

  try {
    const user = await api("/login", {
      method: "POST"
    });

    showGallery(user);

    await loadMedia();

    if (refreshHandle) {
      clearInterval(refreshHandle);
    }

    refreshHandle = setInterval(loadMedia, 60000);

  } catch (error) {
    idToken = null;

    showLogin(
      error.message || "Access could not be verified."
    );
  }
}


// -------------------- EVENT LISTENERS --------------------

// Photos / Videos tabs.
document.querySelectorAll(".media-tab").forEach(button => {
  button.addEventListener("click", () => {
    setTab(button.dataset.tab);
  });
});


// Logout.
$("logoutButton").addEventListener("click", () => {
  idToken = null;

  if (refreshHandle) {
    clearInterval(refreshHandle);
    refreshHandle = null;
  }

  closeVideo();
  revokeMediaUrls();

  $("photoGrid").replaceChildren();
  $("videoGrid").replaceChildren();

  if (window.google && google.accounts && google.accounts.id) {
    google.accounts.id.disableAutoSelect();
  }

  showLogin("You have signed out.");
});


// Photo lightbox close.
$("closeLightbox").addEventListener("click", () => {
  $("lightbox").classList.add("hidden");
});

$("lightbox").addEventListener("click", event => {
  if (event.target === $("lightbox")) {
    $("lightbox").classList.add("hidden");
  }
});


// Video lightbox close.
$("closeVideo").addEventListener("click", closeVideo);

$("videoLightbox").addEventListener("click", event => {
  if (event.target === $("videoLightbox")) {
    closeVideo();
  }
});


// Escape key.
document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    $("lightbox").classList.add("hidden");

    if (!$("videoLightbox").classList.contains("hidden")) {
      closeVideo();
    }
  }
});


// Start Google sign-in.
window.addEventListener("load", () => {
  setTimeout(initializeGoogle, 500);
});
      
