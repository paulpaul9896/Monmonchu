# AGENTS.md

## Cursor Cloud specific instructions

This is a React SPA (Vite + TypeScript + TailwindCSS) with Firebase backend services (Auth + Firestore). There is no local backend server.

### Quick reference

| Action | Command |
|--------|---------|
| Install deps | `npm install` |
| Dev server | `npm run dev` (Vite on port 3000, binds 0.0.0.0) |
| Lint / type-check | `npm run lint` (`tsc --noEmit`) |
| Build | `npm run build` (outputs to `dist/`) |
| Clean | `npm run clean` |

### Notes

- **No test framework** is configured in this repo; `npm run lint` (TypeScript type-check) is the only automated verification available.
- **Firebase Auth** uses Google OAuth only. Running locally on `localhost:3000` will trigger `auth/unauthorized-domain` because the Firebase project's authorized domains do not include `localhost`. This is expected and does not indicate a code problem.
- **Firebase config** is hardcoded in `firebase-applet-config.json`; no local emulator setup exists.
- **GEMINI_API_KEY** is referenced in `.env.example` but not actively consumed by current source code. The app runs fine without it.
- The app is a purely client-side SPA that talks directly to Firebase and external APIs (exchange rates from `open.er-api.com`).
