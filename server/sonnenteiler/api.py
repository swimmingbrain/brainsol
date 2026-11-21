"""the planner's routes and page inside the fastapi app of the chatbot, under /plan

the core of the planner is numpy only, fastapi lives here alone. every answer has the json shape the
planner always had, errors are {"ok": false, "error": "German sentence"}. the page under /plan/ asks with
relative paths, so it works under any prefix a proxy puts in front"""
from __future__ import annotations

import json
import os

from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

from . import recipe as rc
from .boot import Host
from .schema import Problem, dumps

WEB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")
MAX_BODY = 2 * 1024 * 1024
# a recipe or the farmer's words may come as plain text
TEXT_ROUTES = ("recipe", "whatif", "ask")
NO_PLANNER = "Hier läuft kein Planer, der Dienst wurde ohne SONNENTEILER_DATA gestartet und antwortet nur als Chatbot"
ASK_ERRORS = {
    "bad": (400, "Der Chatbot hat die Anfrage abgelehnt"),
    "off": (400, "Kein Sprachmodell eingestellt, es fehlen LLM_BASE_URL und LLM_MODEL"),
    "llm": (502, "Das Sprachmodell hat keine brauchbare Antwort gegeben"),
    "timeout": (504, "Das Sprachmodell hat nicht rechtzeitig geantwortet, nach einer Pause lädt es bis zu einer Minute"),
}


def answer(status: int, obj) -> Response:
    return Response(dumps(obj).encode("utf-8"), status_code=status, media_type="application/json; charset=utf-8",
                    headers={"Cache-Control": "no-store"})


def error(status: int, text: str, **more) -> Response:
    return answer(status, {"ok": False, "error": text, **more})


async def read_body(request: Request, route: str):
    raw = await request.body()
    if len(raw) > MAX_BODY:
        raise Problem("die Anfrage ist zu groß")
    text = raw.decode("utf-8", "replace").strip()
    if not text:
        return {}
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        if route in TEXT_ROUTES and text[0] not in "{[\"":
            return text
        raise Problem("der Inhalt der Anfrage ist kein gültiges JSON") from None


def attach(app: FastAPI, host: Host | None, ask=None, prefix: str = "/plan") -> None:
    """the routes of the planner under prefix/api and its page under prefix/. ask(prompt, lang, plant) is the
    chatbot's way from words to a recipe, it gives ("recipe", recipe), ("ask", question) or ("error", why)"""

    @app.get(prefix, include_in_schema=False)
    async def to_page() -> Response:
        # relative, so a prefix of a proxy in front stays
        return RedirectResponse(prefix.rsplit("/", 1)[-1] + "/", status_code=307)

    if host is None:
        @app.api_route(prefix + "/{rest:path}", methods=["GET", "POST"], include_in_schema=False)
        async def no_planner(rest: str) -> Response:
            return error(503, NO_PLANNER)
        return

    def runner():
        if not host.ready:
            raise Unavailable(host.unavailable())
        return host.runner

    async def call(fn, *args) -> Response:
        try:
            return answer(200, await run_in_threadpool(fn, *args))
        except Unavailable as e:
            return error(503, str(e))
        except (Problem, rc.NotARecipe) as e:
            return error(400, str(e))
        except Exception as e:  # say it in a sentence, never a bare trace
            return error(500, f"interner Fehler: {e}")

    api = prefix + "/api"

    @app.get(api + "/state", include_in_schema=False)
    async def state() -> Response:
        return await call(lambda: runner().state())

    @app.get(api + "/plan", include_in_schema=False)
    async def plan() -> Response:
        return await call(lambda: _locked(runner(), lambda r: r.plan))

    @app.get(api + "/recipe", include_in_schema=False)
    async def get_recipe() -> Response:
        return await call(lambda: _locked(runner(), lambda r: r.recipe))

    @app.get(api + "/recipe/schema", include_in_schema=False)
    async def recipe_schema() -> Response:
        return await call(lambda: _locked(runner(), lambda r: rc.schema(r.ctx.book(r.run.day.d))))

    @app.get(api + "/days", include_in_schema=False)
    async def days() -> Response:
        return await call(lambda: _locked(runner(), lambda r: r.day_list()))

    def healthy() -> dict:
        runner()
        return {"ok": True}

    @app.get(api + "/health", include_in_schema=False)
    async def health() -> Response:
        return await call(healthy)

    posts = {
        "recipe": lambda r, b: r.set_recipe(b),
        "whatif": lambda r, b: r.whatif(b),
        "day": lambda r, b: r.jump(b),
        "cloud": lambda r, b: r.cloud(b),
        "speed": lambda r, b: r.set_speed(b),
        "reset": lambda r, b: r.reset_day(),
        "measure": lambda r, b: r.measure(b),
        "feed": lambda r, b: r.feed(b),
    }

    @app.post(api + "/ask", include_in_schema=False)
    async def ask_route(request: Request) -> Response:
        try:
            r = runner()
            body = await read_body(request, "ask")
        except Unavailable as e:
            return error(503, str(e))
        except Problem as e:
            return error(400, str(e), code="bad")
        if isinstance(body, str):
            body = {"prompt": body}
        if not isinstance(body, dict) or not isinstance(body.get("prompt"), str) or not body["prompt"].strip():
            return error(400, "prompt fehlt, zum Beispiel {\"prompt\": \"Tomaten, ab 17 Uhr brauche ich Strom\"}",
                         code="bad")
        if ask is None:
            code = "off"
            return error(ASK_ERRORS[code][0], ASK_ERRORS[code][1], code=code)
        lang = body.get("lang") if body.get("lang") in ("de", "en") else "de"
        plant = body.get("plant") if isinstance(body.get("plant"), str) and body["plant"].strip() else None
        kind, got = await ask(body["prompt"].strip()[:1000], lang, plant)
        if kind == "ask":
            return answer(200, {"ok": True, "ask": got})
        if kind == "error":
            status, text = ASK_ERRORS.get(got.get("code"), ASK_ERRORS["llm"])
            msg = got.get("msg")
            return error(status, f"{text} ({msg})" if msg and got.get("code") != "off" else text,
                         code=got.get("code") if got.get("code") in ASK_ERRORS else "llm")
        return await call(lambda: r.take_recipe(got, "ask"))

    def post_route(name: str, fn):
        async def route(request: Request) -> Response:
            try:
                r = runner()
                body = await read_body(request, name)
            except Unavailable as e:
                return error(503, str(e))
            except Problem as e:
                return error(400, str(e))
            if name in ("recipe", "whatif") and not isinstance(body, (dict, list, str)):
                return error(400, "das Rezept muss ein JSON Objekt, eine Liste oder ein Text sein")
            return await call(lambda: fn(r, body))
        app.post(api + "/" + name, include_in_schema=False)(route)

    for name, fn in posts.items():
        post_route(name, fn)

    @app.api_route(api + "/{rest:path}", methods=["GET", "POST"], include_in_schema=False)
    async def unknown(rest: str) -> Response:
        return error(404, f"die Route {api}/{rest} gibt es nicht")

    app.mount(prefix, StaticFiles(directory=WEB, html=True), name="plan-page")


class Unavailable(Exception):
    pass


def _locked(runner, fn):
    with runner.lock:
        return fn(runner)
