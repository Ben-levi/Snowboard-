# 🏔️ Snow Crew

A light, fun gear tracker for a group ski/snowboard trip.

- **My Gear**: a real 3D rider (React Three Fiber). Drag to spin it, and tap a body part (head, upper body, hands, legs, feet, board/skis, backpack) to open that section's gear dropdown. The 3D code loads lazily. Browsers without WebGL (or `?flat=1`) get the lightweight 2.5D SVG rider instead. Mark each item **Own**, **Buy**, **Borrow** or **Skip**, add notes (brand/size), and flag what you're **happy to lend**. The figure tints by status.
- **My to-do**: what you still need to buy or borrow, and which friends can lend each item, with one-tap requests.
- **Crew**: everyone's figure and progress, plus a **"Who has…?"** search.
- **Leaderboard**: ranked by number of items owned, with an animated podium, rows that slide when ranks change, and badges (🏆 Fully Geared, 🤝 Generous, 🛒 Shopper). You get confetti when you become Fully Geared or lend something.
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
src/components/Rider3D      the 3D rider (R3F + drei), one clickable group per gear section
src/components/RiderSpline  rider designed in Spline (optional, via VITE_SPLINE_SCENE)
src/components/RiderStage   picks Spline → built-in 3D → SVG rider, with fallbacks
src/components/RiderFigure  the 2.5D parallax SVG rider (fallback + crew mini cards)
src/components/…            GearView, GearSection, ShoppingList, CrewView, Leaderboard, RequestsInbox
```

## Design the rider in Spline

The app can show a rider designed in [Spline](https://spline.design) (a browser 3D design tool) instead of the built-in one. If the scene fails to load, the app falls back to the built-in rider automatically.

1. **Make the rider in Spline.** Remix a character from the [Spline Community](https://community.spline.design/), generate one with Spline's AI, or build your own. Give it a helmet, goggles, jacket, gloves, pants, boots, a board (or skis and poles) and a backpack.
2. **Name the parts** (objects or groups) after the gear sections, so taps open the right dropdown:

   | Name | Section |
   |---|---|
   | `head` | helmet, goggles, beanie, gaiter |
   | `upper` | jacket, layers |
   | `hands` | gloves |
   | `lower` | pants |
   | `feet` | boots, socks |
   | `equipment` | board / skis / poles |
   | `extras` | backpack |

   Child objects can use a prefix, like `head-helmet` or `equipment_board`. Give each part a **Mouse Down** event (a small bounce is nice) so Spline reports the click, and optionally a **Mouse Hover** event.
3. **Optional: show gear status in the scene.**
   - **Number variables** `head_status`, `upper_status`, `hands_status`, `lower_status`, `feet_status`, `equipment_status`, `extras_status`. The app sets them to 0 = not set, 1 = in progress, 2 = borrow, 3 = buy, 4 = sorted. Use Spline's *Variable Change* events to switch each part's material state.
   - **Or** name an object `head-tint` (etc.) and the app recolors it to the status color.
   - **Number variable `rider`:** 0 = snowboard, 1 = ski. Use it to show the board or the skis.
   - **String variable `name`:** the person's name, for a name tag.
4. **Export:** Export → Code → download the `.splinecode` file and put it in `public/rider.splinecode` (self-hosting avoids CORS issues). You can also copy the `https://prod.spline.design/…/scene.splinecode` URL instead.
5. **Point the app at it:**
   - Locally: set `VITE_SPLINE_SCENE=./rider.splinecode` (or the URL) in `.env.local`.
   - For GitHub Pages: add a repository **variable** (not a secret) called `VITE_SPLINE_SCENE`.

Under the figure, a row of section chips always shows each section's status, whether or not the scene uses the status variables.

## Design & 3D resources

Useful if you want to take the look further:

- **3D tooling (MCP servers for AI coding tools):** [threejs-devtools-mcp](https://github.com/DmitriyGolub/threejs-devtools-mcp) (inspect and tweak a live scene), [basementstudio/mcp-three](https://github.com/basementstudio/mcp-three) (turn `.glb` files into R3F JSX), [blender-mcp](https://github.com/ahujasid/blender-mcp) (drive Blender to model custom gear).
- **Free CC0 characters:** [Quaternius Ultimate Modular Men](https://quaternius.com/packs/ultimatemodularcharacters.html) and [Kenney Modular Characters](https://kenney.nl/assets/modular-characters), if you ever want a rigged, animated character instead of the hand-built one. (Ready Player Me shut down on Jan 31, 2026.)
- **Pro 3D design:** [Spline](https://spline.design) (see above). For AI-generated models: [Meshy](https://www.meshy.ai), [Tripo](https://www.tripo3d.ai), [Hyper3D Rodin](https://hyper3d.ai). Pro model marketplaces: Sketchfab, Fab, CGTrader.
- **UI components:** [21st.dev Magic MCP](https://github.com/21st-dev/magic-mcp) and a [shadcn/ui MCP](https://github.com/Jpisnice/shadcn-ui-mcp-server), for a Tailwind + shadcn redesign.
