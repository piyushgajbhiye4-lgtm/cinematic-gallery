CINEMATIC GALLERY - SETUP

A) FRONTEND
1. Open app.js and replace PASTE_GOOGLE_CLIENT_ID_HERE with your Google OAuth Client ID.
2. Upload index.html, style.css and app.js to the ROOT of your GitHub repository, replacing the existing files.

B) CLOUDFLARE WORKER
1. Open Worker cinematic-gallery-api.
2. Replace its code with worker.js and Deploy.
3. Keep these exact variables/secrets:
   GOOGLE_CLIENT_ID (Text) - your OAuth Client ID
   ADMIN_EMAIL (Text) - piyushgajbhiye491@gmail.com
   VIEWER_EMAILS (Text) - ankitatotade908@gmail.com,piyushgajbhiye4@gmail.com
   GOOGLE_FOLDER_ID (Text)
   GOOGLE_SERVICE_ACCOUNT_JSON (Secret)
   TELEGRAM_BOT_TOKEN (Secret)
   TELEGRAM_CHAT_ID (Secret)
4. Existing ADMIN_TEST_KEY is not used by this version; it can be left there for now.

C) GOOGLE OAUTH
- Authorized JavaScript origin: https://piyushgajbhiye4-lgtm.github.io
- No redirect URI is needed for Google Identity Services popup/button flow.
- Keep the three invited emails as OAuth Test users while the app is in Testing.

SECURITY
- Never upload service-account JSON, Telegram bot token, Client Secret, or admin test key to GitHub.
- The Worker verifies Google's signed ID token and enforces the email allowlist.
- Drive photos remain private; image bytes are streamed through the Worker after authentication.
- This version lists up to 100 image files directly in the selected Drive folder; it does not traverse subfolders or paginate beyond 100.
- Telegram notification is sent when an invited account successfully signs in.
