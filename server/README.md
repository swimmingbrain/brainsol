# brainSOL brain server

One process, one port, two parts:

- **The recipe chatbot** (`brain/`). A farmer writes a few words, for example "Tomaten, vertragen keine pralle Mittagssonne. Ab 17 Uhr brauche ich Strom.", and gets a recipe: the plant, its light target, its highest temperature, and the hours without full sun and the hours where power comes first.
- **The planner** (`sonnenteiler/`). It forecasts the sky for the rest of the day, plans every 3 hours how the panel turns in the next 3 hour block, replays days of a real dataset as a simulation and shows it on its own page. A recipe from the chatbot goes straight to it.

The chatbot runs alone when no dataset is set up for the planner.

## The chatbot

The work is split in two:

- **The language model only understands the words.** It extracts the plant as the farmer named it and the hours: `avoid_sun` (no full sun for the plant) and `power_first` (power wins). It never writes numbers about the plant and never drives the motors.
- **The plant table supplies the facts.** `brain/plants.json` holds `light_target` (daily light integral, mol/m²/day) and `max_temp` (°C) for 10 vegetables, with German and English names, plural forms and other words (Melanzani, Erdäpfel, Pfefferoni). The lookup is exact, without fuzzy matching.

The ten plants are `Okra`, `Tomato`, `Onion`, `Potato`, `Aubergine`, `Garlic`, `Peas`, `Fenugreek`, `Green chilli` and `Elephant foot yam`.
Five of them had other names before (`Bhindi (Ladies finger)`, `Brinjal`, `Methi`, `Green Chilli`, `Elephant Yam (Suran)`). They are kept under `former` in the table: they are still found in the farmer's words and still accepted as a pick, a recipe always carries the new name.

A known plant gives the recipe:

```json
{
  "v": 3,
  "plant": "Tomato",
  "names": { "en": "Tomato", "de": "Tomate" },
  "light_target": 25,
  "max_temp": 32,
  "avoid_sun": [{ "from": "11:00", "to": "15:00" }],
  "power_first": [{ "from": "17:00", "to": "21:00" }],
  "source": "unchecked, from memory: ..."
}
```

An unknown plant, or no plant at all, is **asked back instead of guessed**: `{"ask": {"plant": "Basilikum", "known": [{"name": "Tomato", "names": {...}}, ...]}}`. The page shows the known plants as chips. A picked chip sends the same words again with `"plant": "<name>"`.

**The table values are not checked yet.** They are typical figures recalled from memory, and every row says so in `source`. Check them against a horticulture source (for example a published DLI table for greenhouse crops) and update `source` once a row is checked.

Times are local wall clock. For a named part of the day the model writes only the name (`{"period": "midday"}`), and `PERIODS` in `brain/recipe.py` fixes the hours: morning 06:00 to 10:00, midday 11:00 to 15:00, afternoon 12:00 to 18:00, evening 17:00 to 21:00. An open end ("ab 17 Uhr") lasts until `DAY_END`, 21:00. A small model mixes up those hours when it has to work them out itself. The shapes live in `brain/recipe.py` (`Spoken` as the model writes it, `Extraction`, `Recipe`), and the page mirrors the recipe in `src/lib/farm/recipe.ts`.

## The planner

### How it reads a recipe

The planner reads every recipe through one tolerant function, `intake` in `sonnenteiler/recipe.py`. If the recipe of the chatbot changes, that file is the one place to change. A recipe is never refused because it looks different, unknown keys come back under `extra`, and every answer carries a `report` that says what was understood, what was filled in and what was ignored.

| chatbot | becomes |
|---|---|
| `plant` | `crop` and `name` |
| `light_target` | `dli_target` in mol/m²/day |
| `max_temp` | `tmax_c`, `null` keeps the value of the crop |
| `power_first` | `power_hours` |
| `avoid_sun` | `shade_hours` |
| `names`, `source`, `v` | kept under `extra` |

`max_ppfd` (the light above which the plant is stressed) is not in the chatbot's recipe. It comes from the dataset recipe of the same crop where there is one (tomato, potato, onion and chilli, matched by name), else from the general default.

### The six rules of a plan

For every hour of the day (a hold block, the panel keeps one action that long), in this order:

1. **Power hour** of the recipe: the action with the most power. The farmer needs electricity.
2. **Shade hour** of the recipe: the action with the least light on the plant. That is usually the one that follows the sun, because a panel facing the sun casts the biggest shadow.
3. **Protection:** only actions that do not stress the plant (light above `max_ppfd`, a leaf warmer than `tmax_c`), or the one with the least light when every action stresses.
4. **Light duty:** over the day the plant gets its light target. Of all plans that reach it, the one with the most electricity revenue is taken: the light is given in the hours where a mol costs the least revenue. Hours with a price below zero come first, there turning away even earns money.
5. **Everything else is electricity:** once the target is covered, the panel takes the action with the most revenue, facing the sun at a positive price, turned away at a negative one.
6. **A day that cannot reach the target:** the plant comes first all day, every hour takes the allowed action with the most light.

The plant's light is a duty, not a priced good. Money is only the electricity sold at the day ahead price.

The forecast is a small neural network in plain numpy. It predicts direct and diffuse light (as quantiles) and the temperature for every later step of the day, from the weather service forecast and how far the service has been off today. The plan uses the middle sky for the revenue and a careful one (quantile 0.35, `planner.light_quantile`) for the plant's light, so the duty is met as often as it can be.

The planner compares itself in the same weather with `tracking` (always facing the sun, the most electricity, the plant does not count), `blind` (the light target with the most energy, everything known in advance, without looking at the price) and `best` (the six rules with everything known in advance). Two numbers tell the story: what the plant's light costs (tracking minus planner) and what looking at the price brings (planner minus blind).

### The dataset

The planner learns from and replays a dataset written by `generate.py` of the data teammate's repository [brainsolsynth](https://github.com/NeYoNmoos/brainsolsynth): real weather and day ahead weather forecasts from Open Meteo, real sun positions, Austrian day ahead electricity prices from Energy Charts and the brainSOL model of the panel and the light under it. The big dataset for Dornbirn (245 days from March to October 2025, every 5 minutes) was made like this:

```bash
python generate.py --start 2025-03-01 --end 2025-10-31 --lat 47.41 --lon 9.74 --out <folder>
```

The first start reads it, keeps a compact copy, trains the forecast, runs the evaluation on the test days and checks its formulas against `alternatives.csv`. On a laptop that takes about half a minute, later starts take about a second. All of it lands in the work folder (`SONNENTEILER_WORK`).

## Run

```bash
cd server
uv sync
```

The chatbot alone:

```bash
LLM_BASE_URL=... LLM_MODEL=... uv run uvicorn brain.app:app --port 8000
```

With the planner, the same command with the dataset folder:

```bash
SONNENTEILER_DATA=/path/to/dataset SONNENTEILER_WORK=/path/to/work \
LLM_BASE_URL=... LLM_MODEL=... uv run uvicorn brain.app:app --port 8000
```

or through the planner's command line, which starts the same app:

```bash
uv run python -m sonnenteiler serve --data /path/to/dataset --work /path/to/work --port 8000
```

The app answers at once. The planner starts in the background and is ready after the first training, until then its routes answer 503 with a sentence. Its page is at http://localhost:8000/plan/.

The planner's other commands work without the server:

```bash
uv run python -m sonnenteiler check --data /path/to/dataset       # what the dataset has
uv run python -m sonnenteiler train --data ... --work ...         # train, compare the light quantiles, evaluate
uv run python -m sonnenteiler evaluate --data ... --work ...      # the tables again
uv run python -m sonnenteiler sim --date 2025-06-01 --days 3 --data ... --work ...
uv run python -m sonnenteiler plan --date 2025-06-04 --time 09:00 --data ... --work ...
```

Then open the tracker's page with `?brain=http://localhost:8000` (or set `"brain"` in `static/config.json`), unlock the tools and open the Plant tab.

### Language model

Any OpenAI compatible `/chat/completions` endpoint works.

**Ollama on a laptop, for testing**

```bash
docker run -d --name ollama --device /dev/dri -e OLLAMA_IGPU_ENABLE=1 \
  -p 11434:11434 -v ollama:/root/.ollama ollama/ollama
docker exec ollama ollama pull gemma3:4b
export LLM_BASE_URL=http://localhost:11434/v1 LLM_MODEL=gemma3:4b
```

`--device /dev/dri` and `OLLAMA_IGPU_ENABLE=1` let Ollama use an integrated AMD GPU through Vulkan; without them it runs on the CPU only. `docker exec ollama ollama ps` shows which one it uses.

**vLLM on the GPU server**

```bash
vllm serve Qwen/Qwen2.5-7B-Instruct --port 8001
export LLM_BASE_URL=http://gpu:8001/v1 LLM_MODEL=Qwen/Qwen2.5-7B-Instruct
```

**Hugging Face, when the GPU server is not available**

```bash
export LLM_BASE_URL=https://router.huggingface.co/v1
export LLM_API_KEY=hf_...            # token with the Inference Providers permission
export LLM_MODEL=Qwen/Qwen2.5-72B-Instruct
export LLM_JSON_SCHEMA=0             # if the provider refuses response_format
```

The token stays on this server. The page never talks to the language model directly.

| variable | default | meaning |
| --- | --- | --- |
| `LLM_BASE_URL` | (none) | base address ending in `/v1` |
| `LLM_MODEL` | (none) | model name as the endpoint knows it |
| `LLM_API_KEY` | (none) | sent as a bearer token when set |
| `LLM_JSON_SCHEMA` | `1` | `1` uses guided decoding, `0` puts the schema into the prompt |
| `LLM_TIMEOUT` | `60` | seconds per request to the model |
| `DATA_DIR` | `data` | where the last recipe is kept (`recipe.json`) |
| `ALLOWED_ORIGINS` | `https://sol.swimmingbrain.dev,http://localhost:5173,http://127.0.0.1:5173` | pages that may call this server |
| `SONNENTEILER_DATA` | (none) | the dataset folder, turns the planner on |
| `SONNENTEILER_WORK` | the folder `sonnenteiler` in the temp folder | the planner's cache, model and evaluation |
| `SONNENTEILER_CONFIG` | (none) | a json file with settings of the planner, see `sonnenteiler/config.example.json` |

The public page is served over https, so the browser only reaches this server over https too. Put a reverse proxy or a tunnel in front of it.

## API

The chatbot:

- `POST /recipe` with `{"prompt": "...", "lang": "en" | "de", "plant"?: "<table name>"}` returns `{"recipe": {...}}` and keeps it, or `{"ask": {...}}` when the plant is not in the table.
- `GET /recipe` returns the last recipe, or 404 `{"err": "none"}`.
- `GET /plants` returns the plant table.
- `GET /health` returns `{"ok": true, "model": "..."}`.

Errors are `{"err": "bad" | "llm" | "timeout", "msg": "...", "detail": [...]}`. If the model's answer does not fit the extraction, the server asks once more with the problems before it gives up.

With the planner, `POST /recipe` hands the recipe to the planner, and both `POST /recipe` and `GET /recipe` carry the plan in short next to the recipe. `plan` is null while the planner starts and missing without a planner.

```json
{"recipe": {"v": 3, "plant": "Tomato", "...": "..."},
 "plan": {"date": "2025-06-04", "now": "09:20", "reachable": true,
          "light": {"dli": 4.1, "dli_target": 25.0, "dli_end": [22.0, 25.4, 28.1]},
          "revenue": {"elec_end_eur_ha": [180.0, 210.0, 240.0], "plant_cost_eur_ha": 12.0, "plant_cost_share": 0.05},
          "hours": [{"from": "09:00", "to": "10:00", "offset": 0, "why": "sun", "price": 87.3},
                    {"from": "10:00", "to": "11:00", "offset": 60, "why": "light", "price": 12.0}],
          "block": {"from": "09:00", "to": "12:00"}}}
```

`hours` covers the rest of the day, one entry per hour with the sun up, local time. `offset` is the angle away from the sun in degrees (0 faces the sun, 90 is edge on). `why` is `sun`, `light` (turned away for the plant's light), `price` (turned away because the price is below zero), `stress`, `shade` or `power_hour`. `block` is the binding 3 hours. `elec_end_eur_ha` is the electricity revenue of the day for a poor, a middle and a good sky in € per hectare, `plant_cost_eur_ha` what the plant's light costs today.

The planner, under `/plan`:

- `GET /plan/` is the planner's page (in German). All its requests are relative, so it works under any prefix a proxy puts in front.
- `/plan/api/state`, `plan`, `recipe`, `recipe/schema`, `days`, `health` (GET) and `recipe`, `whatif`, `ask`, `day`, `cloud`, `speed`, `reset` (POST) are the routes of the planner. Errors are `{"ok": false, "error": "German sentence"}`.
- `POST /plan/api/ask` takes the farmer's words like `POST /recipe` (`{"prompt": "...", "lang"?: "de", "plant"?: "..."}`, German by default) and goes the same way. It answers `{"ok": true, "recipe", "report", "plan", "chatbot"}`, or `{"ok": true, "ask": {...}}`, or `{"ok": false, "error", "code"}` with `code` `bad` or `off` (400, `off` when no language model is set), `llm` (502) or `timeout` (504).
- `state.chatbot` says `on`, `ok` (a language model is set), `model`, and the last recipe that came from the chatbot (`last` with `t`, `plant` and `via`: `ask` for the field on the planner's page, `tab` for `POST /recipe`).
- While the planner starts every `/plan/api/...` route answers 503 with a sentence. Without `SONNENTEILER_DATA` every `/plan/...` path answers 503 and says that no planner is set up.

## Test

```bash
uv run pytest
```

## Compare models

`eval/cases.json` holds 19 test sentences with the table's vegetables with the expected plant and hours, including traps (an unknown plant, no plant, a negation, an instruction hidden in the words). `brain/evaluate.py` sends them to whatever model the environment points to and scores plant, `avoid_sun` and `power_first` per sentence. A report lands in `eval/results/`, which git ignores.

```bash
LLM_BASE_URL=http://localhost:11434/v1 LLM_MODEL=gemma3:4b uv run python -m brain.evaluate --repeat 3
```

| model | where | right | per request |
| --- | --- | --- | --- |
| `gemma3:4b` | Framework 16, Radeon 780M through Vulkan | 54/57 | 1.8 s |

Its only miss is `okra_noon_clock`: in "Shade from noon to 3pm" it reads "noon" as the midday period and adds a made up 15:00 to 17:00 window, in all three runs. When it still had to write the hours itself, it got that sentence right but stretched "no harsh midday sun ... power from 5 pm" (the example on the page) to 11:00 to 18:00; naming the period fixed that. 19 sentences are not enough to call a model reliable. The worked examples in `brain/llm.py` (`EXAMPLES`) are kept unlike the test sentences, so the score is not tuned to them.
