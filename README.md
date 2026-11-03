<p align="center">
  <img src="static/brainsol-logo-readme.svg" alt="brainsol logo" width="80" />
</p>

<h1 align="center">brainSOL</h1>

<p align="center">
  A dual axis solar tracker and its digital twin, live in your browser.<br/>
  Watch it follow the light, or run the simulation right on the page.<br/>
  Made for a seminar at FHV as part of my MSc in Sustainable Energy Systems.
</p>

<p align="center">
  <img src="docs/screenshot.png" alt="brainSOL in the browser, the 3D twin of the real tracker turning its panel towards the lamp, with the key numbers, the light balance and the charts beside it" width="800" />
</p>

<p align="center">
  <a href="https://sol.swimmingbrain.dev"><strong>Try it now &rarr; sol.swimmingbrain.dev</strong></a>
</p>

brainSOL is the web side of a small solar tracker built for a seminar talk at FHV (Sustainable Energy Systems MSc): a panel on two servos that turns towards the brightest light it can see, four light sensors behind shade walls on the moving head, and a Raspberry Pi as the brain. This page is the live dashboard of that tracker. It shows a 3D twin that moves with the real head, the light on the four sensors, the key numbers and charts of the last minutes.

Without a tracker the page runs the same physics and the same tracking loop as a simulation in the browser, so it always has something to show. The lamp then wanders slowly across the sky, and every visitor may grab it and drag it around to watch the panel follow.

## Features

- A live view: the twin, where the panel faces, the light, the power estimate and the gain over a fixed panel
- The four sensors and the two errors the tracking loop works with
- Charts of the last ten minutes, filled from the tracker's history when it connects
- How it works in four steps, with sketches that move with the tracker
- A day simulator that compares a fixed panel with a single axis and a dual axis tracker for any place and day
- The results of three experiments for the seminar paper, with a figure and a CSV for each
- A built in simulation with a lamp anyone can drag, the same physics and control loop as the tracker
- Admin tools behind a lock: modes, a joystick, tuning, calibration, a sky scan, experiments, recording and the system values
- Presentation mode for a projector, English and German, a dark and a light theme

## Connecting a tracker

Without a tracker address the page runs the simulation. To show a real tracker, give the page its address in one of three ways, the first one found wins:

1. `?pi=` in the page address, for example `https://sol.swimmingbrain.dev/?pi=abc.trycloudflare.com`
2. an address saved in the connection tab of the admin tools
3. `"pi"` in `static/config.json`, the default for everyone who opens the page, empty means the simulation

While the tracker does not answer the simulation runs, the status bar says why, and the page switches to the tracker as soon as it answers.

- `?pi=abc.trycloudflare.com` on the https site connects to `wss://abc.trycloudflare.com/ws`, the way through a tunnel.
- On the page the Pi serves itself, `http://brainsol.local:8080`, an address without a scheme becomes `ws://` and gets port 8080.
- `?pi=self` means the server of the page, `?pi=sim` asks for the simulation.
- A plain `ws://` address on the https site is blocked by the browser. The page says so and names the two ways out.

## Running locally

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5173`. The simulation runs right away, add `?pi=` and an address to watch a tracker, for example the Python service of brainsolpi started with `brainsolpi run --driver sim` on the same machine: `http://localhost:5173/?pi=ws://localhost:8080`.

`pnpm test` runs the tests, `pnpm check` the type checks and `pnpm build` writes the static site to `build/`. See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) if you want to help.

## The page on the Pi

The Pi can serve the page itself. Copy the contents of `build/` into a folder called `web` next to the brainsolpi service, or point `brainsolpi run --web` at it. The service then answers `/config.json` with `{"pi": "self"}`, so the page connects to the Pi it came from, and every other path falls back to the page. Every deploy also puts the built site as `site.zip` at the site root, and `deploy/web.sh` in the brainsolpi repo fetches it from there, so the Pi serves the same page as `sol.swimmingbrain.dev`.

## The 3D model

The twin draws the real tracker from the CAD export of brainsolpi in `static/models/`: `assembly.json` with the parts, the two joints and where the sensors sit, and one GLB file per part, about 0.9 MB together. They load after the page is up. The export puts all printed parts of a group into one mesh with one colour, so the twin finds the small solids again and gives the copper caps and the dark feet their own colour back. Without the files, or on any problem with them, the twin builds a stand in from simple shapes with the same joints. After a new export, copy the five files from `hardware/export/web/` of brainsolpi into `static/models/`.

## How it works

- The tracker sends a state frame 20 times a second over a WebSocket, the simulation sends the very same frames from inside the tab.
- The loop commands axis speeds instead of positions, with an acceleration limit, so the head moves smoothly.
- Each axis starts above one error and stops below a smaller one, so it does not hunt around the light.
- The sensor readings are made linear in light before they are compared, the photoresistors would squeeze small errors flat.
- Past the zenith the head looks backwards over the top, so 180 degrees of pan reach the whole sky.
- The newest frame is kept outside Svelte for the 3D scene, the numbers on the page change at most 10 times a second, and the 3D view only draws while something moves.
- The admin tools load only after someone unlocks them, a visitor never downloads them.

## Tech stack

| Part | Library |
|------|---------|
| Framework | Svelte 5 + SvelteKit (static adapter) |
| 3D | three.js |
| Charts | uPlot |
| Sun position | SunCalc |
| QR codes | uqr |
| Fonts | Inter, JetBrains Mono, Instrument Serif through fontsource |
| Language | TypeScript |

## License

MIT, see [LICENSE](LICENSE). The libraries keep their own licenses, [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES) lists them.
