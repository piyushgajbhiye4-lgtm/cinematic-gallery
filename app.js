// Google OAuth and access-control integration will be connected next.
// Do not put service-account keys, Telegram tokens, or admin secrets here.

const loginButton = document.getElementById("googleLogin");
const loginMessage = document.getElementById("loginMessage");

loginButton.addEventListener("click", () => {
  loginMessage.textContent =
    "Google sign-in is being configured. Please check back soon.";
});
