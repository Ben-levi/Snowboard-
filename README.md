# 🏔️ Snow Crew

A light, fun gear tracker for a group ski/snowboard trip. The UI is in **Hebrew** (right-to-left); all strings live in [`src/i18n/he.js`](src/i18n/he.js).

- **Home (בית)**: the trip card (resort, dates with a countdown, flights, lodging, meeting point, emergency contact), messages from the admin, and **my details** (ski pass dates, insurance, rental, instructor and lessons, my group). A big button leads on to the gear page.
- **My gear (הציוד שלי)**: a 3D rider on a dark studio stage (React Three Fiber). Drag to spin it, and tap a body part to open that section's gear dropdown. Snowboarders and skiers get their own model. Browsers without WebGL (or `?flat=1`) get a lightweight 2.5D SVG rider. Below it, **my to-do**: what's left to buy or borrow, and which friends can lend each item.
- **Crew (החבר׳ה)**: three views:
  - **people**: everyone's progress, plus a "who has…?" search
  - **groups**: sub-groups (apartment, car, family), each with a shared list of things to bring or buy, and "I'll bring it"
  - **leaderboard**: ranked by items owned, with a podium and badges
- **Requests (בקשות)**: ask to borrow, and the owner lends or declines. Accepted items show as "borrowed from X" and "lent to Y".
- **Admin (ניהול)**: behind the trip's admin password. Edit trip details, post and pin messages, set each person's instructor, lessons, group and other details, manage groups, and change the password.

Join with a **trip code** (for example `ALPS26`). A new code asks for a trip name and an **admin password**, and the creator is logged in as admin. Others unlock admin mode from the profile menu. Share the invite link (`?trip=ALPS26`) from the profile menu.

**About the admin password:** only a SHA-256 hash of `CODE:password` is stored on the trip, and it is checked in the browser. That keeps friends out of the admin panel by accident, but it is not real security: anyone with the trip code can still write to the trip through Firestore. Trips created before passwords existed let the first person who opens the admin dialog set one.

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests for ranking/badges/status logic
```

Without Firebase config the app runs in **demo mode**. Data stays in your browser, and new trips come with 4 sample friends, trip details, two groups and a welcome message so you can try everything (use "אני מישהו אחר" in the profile menu to switch people). The join screen also offers a ready-made **demo trip** (code `DEMO`) whose admin password is **`1234`**.

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
src/i18n/he.js              every UI string (Hebrew)
src/data/gearCatalog.js     gear sections + items (ski / snowboard aware)
src/data/infoFields.js      trip details + personal details form fields
src/lib/admin.js            admin password hashing + session check
src/lib/groups.js           group lists: progress, who brings what
src/lib/tripInfo.js         trip dates, countdown, message order
src/lib/stats.js            owned count, readiness, badges, ranking
src/lib/store/              Firestore adapter + localStorage demo adapter (same interface)
src/components/RiderModel   the Blender-built rider (glTF) on a dark studio stage
src/components/Rider3D      fallback 3D rider made from primitives
src/components/RiderSpline  rider designed in Spline (optional, via VITE_SPLINE_SCENE)
src/components/RiderStage   picks Spline → rider model → built-in 3D → SVG, with fallbacks
tools/blender/              scripts that build the rider models
src/components/RiderFigure  the 2.5D parallax SVG rider (fallback + crew mini cards)
src/ride/                   the snowboard simulation (ride.html): terrain, physics, lifts, runs, HUD
tools/resort/               bakes real terrain + OpenStreetMap data for the simulation
src/components/…            HomeView, GearView, GearSection, ShoppingList, CrewView, GroupsView,
                            Leaderboard, RequestsInbox, AdminPanel, JoinScreen
```

## Ride: snowboard simulation of Pas de la Casa

`ride.html` (live at `…/Snowboard-/ride.html`) is a 3D snowboard simulation on the **real terrain of Pas de la Casa** (Grandvalira, Andorra). It's a separate page that shares only the rider model with the gear app.

- **The popular runs only**, curated from riders' guides (`src/ride/runs.js`):
  - **Green:** Pista Escola
  - **Blue:** Isards, Tubs, Camí de Pessons, Pastora
  - **Red:** Pista Llarga, Directa I, Montmalús, Moreto
  - **Black:** Mirador, Jordi Angles, Granota
  - **Boardercross:** the Boardercross Tubs course
  - Every other OSM piste stays as background groomed snow.
- **Made like the real thing** (`src/ride/grooming.js`, `PisteFurniture.jsx`, `Npcs.jsx`):
  - **Groomed and graded runs:** small bumps are smoothed out and the cross-slope is graded (cat-tracks like Pastora are cut level into the hillside). The boardercross gets rollers and banked berms.
  - **Piste furniture:** orange safety nets where the snow drops away, padded lift towers, start signs and snow guns.
  - **Other riders:** bot-driven riders out on the runs.
- **Medals and ghost:**
  - **Target times:** a bot rides each run with the real physics. Its time is gold; silver is +12% and bronze +30%.
  - **Stars and unlocks:** medals give 1–3 stars. Reds unlock at 3 stars, blacks at 9 and the boardercross at 5.
  - **Ghost:** your best run is saved as a ghost (the gold bot run until you have one), with split times at every gate.
  - **Finish screen:** time, medal, stats, retry and next run.
- **Controls:**
  - **Desktop:** A/D or ←/→ to turn, W to tuck, S to brake, hold and release Space to ollie, R to restart, C to switch camera, M or Esc for the menu. A gamepad works too.
  - **Phone (default):** hold the left or right side of the screen to turn, swipe up to jump, swipe down to brake, two fingers to tuck. Tilt or a thumb stick can be picked in ⚙️ settings.
  - **Smoothing:** steering eases in and out through a critically damped spring, and rendering interpolates between physics steps.
  - **Camera:** rides on springs over smoothed ground.
  - **Steering assist:** on by default on phones, and toggleable in settings.
- **Physics** (`src/ride/physics.js`, unit tested):
  - gravity along the slope, snow friction and air drag
  - carving on the sidecut, and edge grip strong enough to hold a traverse
  - side-slip, skid braking
  - ollies, take-offs and landings
  - collisions with trees, towers, nets and buildings
  - steering is relative to the direction of travel, so riding switch still turns the way you press
- `?autopilot=1` lets the bot ride timed runs for you (debugging), and `?q=low|medium|high` forces a graphics preset.

### The resort data

`tools/resort/bake.mjs` bakes a resort (configured in `tools/resort/resorts/<id>.json`) into `public/resort/<id>/`:

| File | What | Source |
| --- | --- | --- |
| `height.bin`, `meta.json` | 1024×960 height grid, 7.2 m cells (7.4 × 6.9 km), lightly smoothed | [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Terrarium, z14) |
| `far.bin` | 30 km horizon grid | same, z11 |
| `features.json` | pistes (name, difficulty), lifts, buildings, roads, peaks | [OpenStreetMap](https://www.openstreetmap.org/copyright) via Overpass, © OpenStreetMap contributors (ODbL) |

```bash
npm run bake:resort                                        # terrain + OSM
node tools/resort/bake.mjs pas-de-la-casa --skip-osm       # terrain only
```

The **Bake resort** GitHub workflow (Actions → Bake resort → Run workflow) runs the same bake on GitHub's runners and commits the result. That's useful where Overpass isn't reachable.

Trees are placed procedurally, because OSM has no forest mapped here: below a ~2,250 m treeline, and off pistes, roads, buildings and lift lines. Peaks come out ~50 m lower than their mapped heights because the source elevation data is ~30 m resolution.

## The rider models

`public/models/rider-{snowboard,ski}.glb` (plus `-thumb.png` for the Crew cards) are generated in Blender from a CC0 base character. See [tools/blender/source/CREDITS.md](tools/blender/source/CREDITS.md). To tweak colors, pose or gear and rebuild:

```bash
python3 -m venv tools/blender/.venv && tools/blender/.venv/bin/pip install "bpy==4.5.*"
tools/blender/.venv/bin/python tools/blender/dress_rider.py --thumbs          # export models + thumbnails
tools/blender/.venv/bin/python tools/blender/dress_rider.py --render /tmp/r   # optional preview renders
```

Colors live in the `DARK` palette in `tools/blender/build_rider.py`. Parts are named after gear sections (`head-…`, `upper-…`, `hands-…`, `lower-…`, `feet-…`, `equipment-…`, `extras-…`), which is how taps map to the dropdowns.

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
