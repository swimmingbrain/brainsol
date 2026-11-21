"""the http face of the brain server: the recipe chatbot, and the planner when one is set up.

the page posts the farmer's words to /recipe. the language model extracts the
plant's name and the hours, the plant table adds the numbers. a known plant
gives {"recipe": ...}, kept in DATA_DIR/recipe.json for reloads and for the
planner of a later step. an unknown or missing plant gives {"ask": ...}: the
page asks the farmer back instead of guessing, and may send the same words
again with the plant's table name. errors look like the tracker's acks:
{"err": "bad" | "llm" | "timeout", "msg": ...}.

with SONNENTEILER_DATA set, the planner (the sonnenteiler package) starts in
the background of the same process. a recipe from /recipe goes straight to it
and the answer carries the plan in short under "plan". its own page and api
live under /plan/. without SONNENTEILER_DATA the chatbot runs alone as before.
"""

from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ValidationError
from starlette.concurrency import run_in_threadpool

from .llm import Llm, LlmError, Settings
from .plants import Table, table as default_table
from .recipe import Recipe

PROMPT_MAX = 1000
DEFAULT_ORIGINS = "https://sol.swimmingbrain.dev,http://localhost:5173,http://127.0.0.1:5173"


class RecipeRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=PROMPT_MAX)
    lang: Literal["en", "de"] = "en"
    # the table name the farmer picked after a follow up question, wins over the name in the words
    plant: str | None = Field(default=None, max_length=60)


class Refused(Exception):
    def __init__(self, status: int, code: str, msg: str, detail: list[str] | None = None):
        super().__init__(msg)
        self.status, self.code, self.msg, self.detail = status, code, msg, detail


def error(status: int, code: str, msg: str, detail: list[str] | None = None) -> JSONResponse:
    body: dict = {"err": code, "msg": msg}
    if detail:
        body["detail"] = detail
    return JSONResponse(body, status_code=status)


def create_app(
    llm: Llm | None = None,
    data_dir: Path | None = None,
    origins: list[str] | None = None,
    plants: Table | None = None,
    planner=None,
) -> FastAPI:
    """planner: a sonnenteiler Host, False for none, None to set it up from SONNENTEILER_DATA"""
    llm = llm or Llm(Settings.from_env())
    plants = plants or default_table()
    data_dir = data_dir or Path(os.environ.get("DATA_DIR", "data"))
    if origins is None:
        origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", DEFAULT_ORIGINS).split(",") if o.strip()]
    store = data_dir / "recipe.json"
    host = None
    if planner is None and os.environ.get("SONNENTEILER_DATA"):
        from sonnenteiler.boot import Host

        host = Host.from_env()
    elif planner:
        host = planner
    if host is not None:
        host.link.on, host.link.ok, host.link.model = True, llm.ready, llm.settings.model or None

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        # the planner starts in its own thread, the app answers at once
        if host is not None:
            host.start()
        yield
        if host is not None:
            host.stop()

    app = FastAPI(title="brainSOL brain server", version="0.2.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

    @app.exception_handler(RequestValidationError)
    async def bad_request(_: Request, exc: RequestValidationError) -> JSONResponse:
        detail = [f"{'.'.join(str(p) for p in e['loc'][1:]) or 'body'}: {e['msg']}" for e in exc.errors()]
        return error(400, "bad", "the request does not fit", detail)

    async def make(prompt: str, lang: str, pick: str | None) -> tuple[str, dict]:
        # the farmer's words to ("recipe", recipe) or ("ask", question), else Refused. the recipe is kept
        prompt = prompt.strip()
        if not prompt:
            raise Refused(400, "bad", "the prompt is empty")
        chosen = None
        if pick is not None:
            chosen = plants.pick(pick)
            if chosen is None:
                raise Refused(400, "bad", f"{pick!r} is not in the plant table")
        try:
            said = await llm.extract(prompt, lang)
        except LlmError as e:
            raise Refused(504 if e.code == "timeout" else 502, e.code, e.msg, e.detail) from e
        plant = chosen or plants.find(said.plant)
        if plant is None:
            # not in the table: ask back, a guess would put made up numbers into the plan
            return "ask", {"plant": said.plant, "known": plants.known()}
        recipe = Recipe(
            plant=plant.name,
            names=plant.names,
            light_target=plant.light_target,
            max_temp=plant.max_temp,
            avoid_sun=said.avoid_sun,
            power_first=said.power_first,
            source=plant.source,
        )
        wire = recipe.wire()
        data_dir.mkdir(parents=True, exist_ok=True)
        tmp = store.with_suffix(".tmp")
        tmp.write_text(json.dumps({**wire, "prompt": prompt}, ensure_ascii=False, indent=2), "utf-8")
        tmp.replace(store)
        return "recipe", wire

    async def with_plan(body: dict, recipe: dict | None = None) -> dict:
        # the plan in short next to the recipe, null while the planner starts, missing without a planner
        if host is None:
            return body
        if not host.ready:
            return {**body, "plan": None}
        runner = host.runner
        if recipe is not None:
            await run_in_threadpool(runner.take_recipe, recipe, "tab")
        return {**body, "plan": await run_in_threadpool(runner.summary)}

    @app.get("/health")
    async def health() -> dict:
        return {"ok": llm.ready, "model": llm.settings.model or None}

    @app.get("/plants")
    async def all_plants() -> dict:
        return {"plants": [p.model_dump() for p in plants.plants]}

    @app.get("/recipe", response_model=None)
    async def last_recipe() -> dict | JSONResponse:
        try:
            recipe = Recipe.model_validate(json.loads(store.read_text("utf-8")))
        except (OSError, ValueError, ValidationError):
            return error(404, "none", "no recipe yet")
        return await with_plan({"recipe": recipe.wire()})

    @app.post("/recipe", response_model=None)
    async def make_recipe(body: RecipeRequest) -> dict | JSONResponse:
        try:
            kind, got = await make(body.prompt, body.lang, body.plant)
        except Refused as e:
            return error(e.status, e.code, e.msg, e.detail)
        if kind == "ask":
            return {"ask": got}
        return await with_plan({"recipe": got}, got)

    if planner is not False:
        from sonnenteiler.api import attach

        async def ask(prompt: str, lang: str, pick: str | None) -> tuple[str, dict]:
            # the field on the planner's page goes the same way as POST /recipe
            if not llm.ready:
                return "error", {"code": "off"}
            try:
                return await make(prompt, lang, pick)
            except Refused as e:
                return "error", {"code": e.code, "msg": e.msg}

        attach(app, host, ask)

    return app


def __getattr__(name: str):
    # uvicorn brain.app:app builds the app from the environment on first use,
    # so importing the module in tests does not read the env
    if name == "app":
        globals()["app"] = create_app()
        return globals()["app"]
    raise AttributeError(name)
