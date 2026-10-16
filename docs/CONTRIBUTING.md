# Contributing

There is no formal process. Fork the repo, make your change, open a pull request. Small and focused beats big and sweeping, so if you plan something larger, open an issue first and we can talk it through before you spend time on it.

## Running locally

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5173`. Without a tracker the page runs the simulation in the browser, so everything works without hardware. To watch a real tracker, add `?pi=` and its address, for example `http://localhost:5173/?pi=brainsol.local`.

`pnpm check` runs the type checker and has to come back with no errors and no warnings, `pnpm test` runs the unit tests, and `pnpm build` writes the static site to `build/`. `pnpm preview` serves that build on port 4173.

## Where things live

- `src/lib/link` is the wire: the protocol types, the address rules, the socket to a tracker and the simulation behind the same transport interface.
- `src/lib/sim` is the simulated tracker: kinematics, the light and sensor model, the tracking loop and the engine that speaks the protocol. Plain TypeScript, no Svelte in it.
- `src/lib/stores` holds the state: the connection, the telemetry, the chart history, preferences, toasts and page state.
- `src/lib/i18n` is `t()` with the English and German words. Each part of the page has its own pair of files.
- `src/lib/ui` is the shared kit, one Svelte component per file.
- `src/lib/twin` is the 3D scene, `src/lib/panels` the viewer panels and sections, `src/lib/admin` the admin tools.

## Style

There is no linter and no formatter, so keep the style of the file you are in: two spaces, single quotes, semicolons, and lowercase comments that explain why rather than what. Telemetry frames never go into Svelte state as a whole, the stores hand out the newest frame as a plain field and single values as runes.

Every text on the page goes through `t()`, with the English and the German version side by side. Write short plain sentences in sentence case, and no dashes as punctuation.

Commit messages are short and lowercase with a type prefix, like `fix: the pan axis stops at the soft limit` or `feat: the status bar shows the loop rate`. The types in use are `feat`, `fix`, `perf`, `docs`, `test`, `refactor` and `chore`.

## License

By contributing you agree that your work is released under the MIT license, like the rest of the project.
