<p align="center">
  <img src="static/brainsol-logo-readme.svg" alt="brainsol logo" width="80" />
</p>

<h1 align="center">brainSOL</h1>

<p align="center">
  The web page of a small dual axis solar tracker: a live 3D twin, the numbers and the charts.<br/>
  Without a tracker it runs the same tracking loop as a simulation in the browser.<br/>
  Live at <a href="https://sol.swimmingbrain.dev">sol.swimmingbrain.dev</a>
</p>

<p align="center">
  <img src="docs/screenshot.png" alt="brainSOL in the browser, the 3D twin turning its panel towards the lamp, with the numbers and the charts beside it" width="800" />
</p>

## Run it locally

You need Node 20 or newer and pnpm.

```bash
pnpm install
pnpm dev
```

Then open http://localhost:5173.

## Connect a tracker

The Pi side is [brainsolpi](https://github.com/swimmingbrain/brainsolpi). Give the page its address in `static/config.json`, the default for everyone, empty means the simulation:

```json
{ "pi": "wss://brainsol.<tailnet>.ts.net" }
```

Or for one visit with `?pi=` in the page address, which wins over the file: `https://sol.swimmingbrain.dev/?pi=brainsol.<tailnet>.ts.net`.

A page loaded over https can only reach a `wss` address, so a plain `ws://` Pi on the local network works only from http, like `http://localhost:5173/?pi=brainsol.local`.

## Admin tools

Click the lock icon in the top bar. The simulation needs no PIN, a real tracker asks for the one you set on the Pi with `brainsolpi setpin`.

## Plant recipe

The Plant tab in the admin tools turns a farmer's words into a recipe for the tracker, for example "Tomaten, vertragen keine pralle Mittagssonne. Ab 17 Uhr brauche ich Strom." A language model only reads the words: which plant, when it should get no full sun, when power comes first. The plant's light target and highest temperature come from a table of ten vegetables in the server. A plant that is not in the table is asked back, never guessed. When the planner runs next to it, the tab also shows its plan for the rest of the day: whether the plant gets its light, what that light costs in revenue, how far the panel turns away from the sun in each hour and why, the binding block, and a link to the full plan page. The tab itself moves nothing, the Plan mode does.

The language model runs behind a small recipe server in [`server/`](server/README.md). To try it on a laptop:

1. Start a local model with Ollama:

   ```bash
   docker run -d --name ollama --device /dev/dri -e OLLAMA_IGPU_ENABLE=1 \
     -p 11434:11434 -v ollama:/root/.ollama ollama/ollama
   docker exec ollama ollama pull gemma3:4b
   ```

   After a reboot `docker start ollama` brings it back.

2. Start the recipe server:

   ```bash
   cd server
   uv sync
   LLM_BASE_URL=http://localhost:11434/v1 LLM_MODEL=gemma3:4b uv run uvicorn brain.app:app --port 8000
   ```

3. Start the page and tell it where the recipe server is:

   ```bash
   pnpm dev
   ```

   Open http://localhost:5173/?brain=http://localhost:8000, unlock the admin tools and open the Plant tab.

`?brain=` works like `?pi=`. For everyone, put the address into `static/config.json` as `"brain"`. When both are empty the tab asks the Pi it is connected to: a Pi that knows a brain server (`brainsolpi setbrain`, its `/api/info` says `"brain": true`) passes everything under `/brain/` on to it, then the tab talks only to the Pi and sends the admin token with its posts. Without any of the three the tab says there is no recipe server. The public page is served over https, so it only reaches a recipe server over https, the way through the Pi works wherever the Pi does.

On such a Pi the mode switch in the Control tab also offers Plan: the tracker then does what the simulation of the planner does, with the simulated day and time shown under the switch.

The same server also talks to vLLM on a GPU server or to Hugging Face, only `LLM_BASE_URL` and `LLM_MODEL` change. [`server/README.md`](server/README.md) has those setups, the API, the plant table and how to compare models with the test sentences.

How the planner, the chatbot, the Pi and the page fit together is explained in German in [docs/sonnenteiler/ueberblick.md](docs/sonnenteiler/ueberblick.md).

## Deploy

Push to `main`, `.github/workflows/deploy.yml` checks, tests and builds the page and puts it on GitHub Pages. The custom domain is in `static/CNAME`.

## Check, test, build

```bash
pnpm check   # type checks, 0 errors
pnpm test    # unit tests
pnpm build   # static site in build/
```

The recipe server has its own tests:

```bash
cd server
uv run pytest
```

## License

MIT, see [LICENSE](LICENSE). The libraries and the font keep their own licenses, listed in [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES).
