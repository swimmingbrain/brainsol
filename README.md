<p align="center">
  <img src="static/brainsol-logo-readme.svg" alt="brainsol logo" width="80" />
</p>

<h1 align="center">brainSOL</h1>

<p align="center">
  A dual axis solar tracker and its digital twin, live in your browser.<br/>
  Watch it follow the light, or run the simulation right on the page.
</p>

<p align="center">
  <a href="https://sol.swimmingbrain.dev"><strong>Try it now &rarr; sol.swimmingbrain.dev</strong></a>
</p>

brainSOL is the web side of a small solar tracker built for a seminar talk: a panel on two servos that turns towards the brightest light it can see, four light sensors behind shade walls on the moving head, and a Raspberry Pi as the brain. This page shows the tracker live, with a 3D twin, the sensor balance and charts of the last minutes. Without a tracker it runs the same tracking loop as a simulation in the browser, so it always has something to show.

## Features

- A live cockpit: the twin, the pose, the light, the power estimate and the gain over a fixed panel
- The four sensors and the two errors the tracking loop works with
- Charts of the last ten minutes, filled from the tracker's history when it connects
- A built in simulation with a light you can move, the same physics and control loop as the tracker
- Admin tools behind a lock: modes, tuning, calibration, a sky scan and experiments
- Presentation mode for a projector, English and German, a dark and a light theme

## Connecting a tracker

The page reads the tracker address from `config.json`, from `?pi=` in the page address, or from an address saved in the connection panel. Without one, or while the tracker does not answer, the simulation runs and the status bar says so.

- `?pi=abc.trycloudflare.com` on the https site connects to `wss://abc.trycloudflare.com/ws`, the way through a tunnel.
- On the page the Pi serves itself, `http://brainsol.local:8080`, an address without a scheme becomes `ws://` and gets port 8080.
- `?pi=self` means the server of the page, `?pi=sim` asks for the simulation.
- A plain `ws://` address on the https site is blocked by the browser. The page says so and names the two ways out.

## Running locally

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5173`. `pnpm test` runs the tests, `pnpm check` the type checks and `pnpm build` writes the static site to `build/`. See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) if you want to help.

## How it works

- The tracker sends a state frame 20 times a second over a WebSocket, the simulation sends the very same frames from inside the tab.
- The loop commands axis speeds instead of positions, with an acceleration limit, so the head moves smoothly.
- Each axis starts above one error and stops below a smaller one, so it does not hunt around the light.
- The sensor readings are made linear in light before they are compared, the photoresistors would squeeze small errors flat.
- Past the zenith the head looks backwards over the top, so 180 degrees of pan reach the whole sky.
- The newest frame is kept outside Svelte for the 3D scene, the numbers on the page change at most 10 times a second.

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
