# 🏔️ Snow Crew

A light, fun gear tracker for a group ski/snowboard trip.

- **My Gear**: a 2.5D rider figure. Tap a body part (head, upper body, hands, legs, feet, board/skis, backpack) to open that section's gear dropdown. Mark each item **Own**, **Buy**, **Borrow** or **Skip**, add notes (brand/size), and flag what you're **happy to lend**. The figure tints by status.
- **My to-do**: what you still need to buy or borrow, and which friends can lend each item, with one-tap requests.
- **Crew**: everyone's figure and progress, plus a **"Who has…?"** search.
- **Leaderboard**: ranked by number of items owned, with a podium and badges (🏆 Fully Geared, 🤝 Generous, 🛒 Shopper).
- **Requests**: ask to borrow, and the owner taps **Lend it** or **Decline**. Accepted items show up as "borrowed from X" and "lent to Y".

Join with a **trip code** (for example `ALPS26`) and pick your name. There are no passwords. Share the invite link (`?trip=ALPS26`) from the profile menu.

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests for ranking/badges/status logic
```

Without Firebase config the app runs in **demo mode**. Data stays in your browser, and 4 sample friends are pre-loaded so you can try everything (use "I'm someone else" in the profile menu to switch people).

## Connect Firebase (so the crew shares one live list)

1. Create a project at <https://console.firebase.google.com> (the free Spark plan is plenty).
2. **Build → Authentication → Sign-in method** → enable **Anonymous**.
3. **Build → Firestore Database** → create a database (production mode).
4. **Firestore → Rules** → paste the contents of [`firestore.rules`](firestore.rules) → Publish.
5. **Project settings → Your apps → Web app (`</>`)** → register an app and copy its config values.
6. Locally: copy `.env.example` to `.env.local` and fill in the values.

## Deploy to GitHub Pages

1. Repo **Settings → Secrets and variables → Actions** → add the six `VITE_FIREBASE_*` values as repository secrets.
2. Repo **Settings → Pages** → Source: **GitHub Actions**.
3. Push to `main` (or run the "Deploy to GitHub Pages" workflow manually).
4. In Firebase **Authentication → Settings → Authorized domains**, add `<your-user>.github.io`.

The Firebase web config isn't secret (it ships to every browser). Access is controlled by `firestore.rules`.

## Project layout

```
src/data/gearCatalog.js     gear sections + items (ski / snowboard aware)
src/lib/stats.js            owned count, readiness, badges, ranking
src/lib/store/              Firestore adapter + localStorage demo adapter (same interface)
src/components/RiderFigure  the 2.5D parallax SVG rider
src/components/…            GearView, GearSection, ShoppingList, CrewView, Leaderboard, RequestsInbox
```
