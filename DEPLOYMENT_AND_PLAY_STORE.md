# MediStock — Supabase Setup, Deployment, Android Packaging & Play Store Guide

## 1. Connect Your Existing Supabase Project

1. **Run the Database Migration**:
   - Open your Supabase Dashboard → **SQL Editor**.
   - Paste and run the full contents of `supabase/migrations/001_medistock_schema.sql`.
   - This creates all 9 MediStock tables (`users`, `sessions`, `family_members`, `medicines`, `purchase_transactions`, `stock_adjustments`, `reminder_cycles`, `push_subscriptions`, `notifications`), indexes, unique daily reminder deduplication constraint, and enables Row Level Security (RLS) on every table.

2. **Add Your Supabase Credentials**:
   - In Supabase Dashboard → **Project Settings → API**, copy:
     - **Project URL** → `SUPABASE_URL`
     - **service_role secret key** → `SUPABASE_SERVICE_ROLE_KEY` (kept strictly server-side; never exposed to the browser)
   - Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to your AI Studio **Secrets** panel (or local `.env` file).

3. **Optional Web Push Keys**:
   - Generate persistent VAPID keys once with `npx web-push generate-vapid-keys` and set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` in Secrets / `.env`.

4. **Run Locally & Test**:
   ```bash
   npm install
   npm test
   npm run dev
   ```
   Build and run production mode:
   ```bash
   npm run build
   npm start
   ```

---

## 2. Production Web & PWA Deployment

MediStock ships as a full-stack Node.js + Express + Vite PWA connected directly to your Supabase PostgreSQL database:
- **HTTPS Required for Web Push & PWA Install**: Browsers require HTTPS (except `localhost`) for Service Worker registration and PushManager subscriptions.
- **Zero Local Database State**: All user profiles, sessions, family members, medicine stock ledgers, purchase history, reminder cycles, notifications, and push subscriptions persist in your Supabase project.
- **Background Reminder Scheduler**: Runs automatically on server startup and every 15 minutes inside `server.ts` whenever `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured.

---

## 3. Packaging as an Android Application (Capacitor / TWA)

### Option A: Trusted Web Activity (TWA via Bubblewrap) — Recommended for Live Hosted URL
1. Deploy MediStock to your HTTPS production domain.
2. Verify `/manifest.webmanifest` and `/sw.js` pass Lighthouse PWA checks.
3. Package with `@bubblewrap/cli`:
   ```bash
   npm i -g @bubblewrap/cli
   bubblewrap init --manifest https://your-domain.com/manifest.webmanifest
   bubblewrap build
   ```
4. Upload the generated `.aab` to Google Play Console and host `assetlinks.json` at `/.well-known/assetlinks.json`.

### Option B: Capacitor Native Android Shell
1. Build web assets: `npm run build`.
2. Initialize Capacitor:
   ```bash
   npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/push-notifications
   npx cap init MediStock com.medistock.app --web-dir dist
   npx cap add android
   ```
3. Configure Android assets & notifications:
   - **App Icon**: Use `public/pwa-512x512.png` and `public/pwa-maskable-512x512.png` to generate adaptive launcher icons (`ic_launcher`, `ic_launcher_foreground`, `ic_launcher_background` `#EAF2FD`) in Android Studio Image Asset Studio.
   - **Notification Channel**: Create a high-importance channel (`medistock_refill_reminders`) for refill alerts and request `POST_NOTIFICATIONS` on Android 13+ (API 33+) only after showing MediStock's in-app pre-permission explainer.
   - **Splash Screen**: Configure `SplashScreen` theme with `#F6F8FB` background and MediStock pill icon.
4. Build signed App Bundle (`.aab`) in Android Studio for Google Play release.

---

## 4. Google Play Store Listing Assets

### Short Description (68 chars)
`Manage family medicines, track tablet stock, and get timely refill reminders.`

### Full Description
```
MediStock makes managing your family's medicine stock easier.

Keep track of medicines for yourself and your loved ones, monitor available tablets, estimate when stock may run out, and receive helpful refill reminders.

FEATURES

• Family Medicine Management — Organize medicines for different family members.
• Stock Tracking — Track purchased quantities and daily tablet usage.
• Stock Predictions — View estimated remaining days and stock-end dates.
• Refill Reminders — Receive reminders before medicines are expected to run out.
• Purchase History — Keep a record of actual medicine purchases.
• Purchase Calendar — View confirmed purchases and upcoming estimated purchase dates.
• Family Overview — Understand your family's medicine requirements in one place.

MediStock helps you stay organized and keep your family's medicine inventory under control.

Note: Stock estimates are based on information entered by users. MediStock does not provide medical advice or recommend medicine dosages.
```

### App Icon & Feature Graphic Concept
- **App Icon**: Blue (`#245DB5`) and teal (`#16866B`) diagonal pill capsule centered on a soft sky-blue (`#EAF2FD`) rounded container (`public/pwa-512x512.png` & `public/pwa-maskable-512x512.png`).
- **Feature Graphic (1024x500)**: Soft `#EAF2FD` gradient canvas with MediStock pill wordmark, tagline `"Never run out of medicines."`, and a clean showcase of the family dashboard & purchase calendar.
- **Permission Disclosure**: MediStock requests only `POST_NOTIFICATIONS` (Android 13+) solely to deliver medicine refill alerts. No location, contacts, camera, or microphone permissions are requested.
