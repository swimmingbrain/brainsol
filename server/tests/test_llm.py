import json
import httpx
import pytest
import respx

from brain.llm import Llm, LlmError, Settings, first_object, system_prompt

BASE = "http://gpu.test/v1"

GOOD = {
    "plant": "Basilikum",
    "avoid_sun": [{"from": "11:00", "to": "15:00"}],
    "power_first": [{"from": "17:00", "to": "21:00"}],
}


def reply(content: str) -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "content": content}}]})


def llm(**over) -> Llm:
    return Llm(Settings(base_url=BASE, model="test-model", **over))


@pytest.mark.anyio
@respx.mock
async def test_a_good_reply_becomes_an_extraction():
    route = respx.post(f"{BASE}/chat/completions").mock(return_value=reply(json.dumps(GOOD)))
    said = await llm(api_key="hf_secret").extract("Basilikum, ab 17 Uhr Strom", "de")
    assert said.plant == "Basilikum"
    assert said.power_first[0].start == "17:00"
    assert route.call_count == 1
    sent = json.loads(route.calls[0].request.content)
    assert sent["model"] == "test-model"
    assert sent["response_format"]["type"] == "json_schema"
    assert "German" in sent["messages"][0]["content"]
    assert sent["messages"][-1]["content"] == "Basilikum, ab 17 Uhr Strom"
    assert route.calls[0].request.headers["authorization"] == "Bearer hf_secret"


@pytest.mark.anyio
@respx.mock
async def test_without_guided_decoding_the_schema_is_in_the_prompt_and_prose_is_skipped():
    wrapped = "Here you go:\n```json\n" + json.dumps(GOOD) + "\n```"
    route = respx.post(f"{BASE}/chat/completions").mock(return_value=reply(wrapped))
    said = await llm(json_schema=False).extract("basil", "en")
    assert said.avoid_sun[0].end == "15:00"
    sent = json.loads(route.calls[0].request.content)
    assert "response_format" not in sent
    assert "schema" in sent["messages"][0]["content"]
    assert "authorization" not in route.calls[0].request.headers


@pytest.mark.anyio
@respx.mock
async def test_one_bad_reply_is_asked_again_with_the_problem():
    bad = {**GOOD, "power_first": [{"from": "21:00", "to": "17:00"}]}
    route = respx.post(f"{BASE}/chat/completions").mock(
        side_effect=[reply(json.dumps(bad)), reply(json.dumps(GOOD))]
    )
    said = await llm().extract("basil", "en")
    assert said.power_first[0].start == "17:00"
    assert route.call_count == 2
    second = json.loads(route.calls[1].request.content)["messages"]
    assert second[-1]["role"] == "user"
    assert "power_first" in second[-1]["content"]


@pytest.mark.anyio
@respx.mock
async def test_two_bad_replies_give_up_cleanly():
    respx.post(f"{BASE}/chat/completions").mock(return_value=reply("I cannot help with that."))
    with pytest.raises(LlmError) as info:
        await llm().extract("basil", "en")
    assert info.value.code == "llm"
    assert info.value.detail


@pytest.mark.anyio
@respx.mock
async def test_server_errors_and_timeouts_are_named():
    respx.post(f"{BASE}/chat/completions").mock(return_value=httpx.Response(503, text="loading"))
    with pytest.raises(LlmError) as info:
        await llm().extract("basil", "en")
    assert info.value.code == "llm"
    respx.post(f"{BASE}/chat/completions").mock(side_effect=httpx.ReadTimeout("slow"))
    with pytest.raises(LlmError) as info:
        await llm().extract("basil", "en")
    assert info.value.code == "timeout"


@pytest.mark.anyio
async def test_without_configuration_nothing_is_sent():
    with pytest.raises(LlmError):
        await Llm(Settings()).extract("basil", "en")


def test_first_object_skips_braces_inside_strings():
    assert first_object('x {"a": "}{", "b": {"c": 1}} y') == '{"a": "}{", "b": {"c": 1}}'
    with pytest.raises(ValueError):
        first_object("no json here")


def test_the_prompt_names_the_language_and_forbids_plant_numbers():
    text = system_prompt("en", False)
    assert "English" in text and "Never invent" in text


def test_the_examples_come_before_the_words_and_fit_the_schema():
    from brain.llm import EXAMPLES, example_turns
    from brain.recipe import Spoken

    for _, answer in EXAMPLES:
        Spoken.model_validate(answer).resolve()
    turns = example_turns()
    assert [t["role"] for t in turns[:2]] == ["user", "assistant"]
    assert len(turns) == 2 * len(EXAMPLES)


@pytest.mark.anyio
@respx.mock
async def test_the_farmers_words_are_the_last_message():
    route = respx.post(f"{BASE}/chat/completions").mock(return_value=reply(json.dumps(GOOD)))
    await llm().extract("Basilikum", "de")
    sent = json.loads(route.calls[0].request.content)["messages"]
    assert sent[0]["role"] == "system"
    assert sent[-1] == {"role": "user", "content": "Basilikum"}


@pytest.mark.anyio
@respx.mock
async def test_numbers_the_model_adds_anyway_are_dropped():
    respx.post(f"{BASE}/chat/completions").mock(return_value=reply(json.dumps({**GOOD, "light_target": 99})))
    said = await llm().extract("basil", "en")
    assert "light_target" not in said.model_dump()


@pytest.mark.anyio
@respx.mock
async def test_named_parts_of_the_day_and_open_ends_get_their_hours_in_code():
    spoken = {
        "plant": "Tomatoes",
        "avoid_sun": [{"period": "midday", "from": "11:00", "to": "17:00"}],
        "power_first": [{"from": "17:00", "to": None}],
    }
    respx.post(f"{BASE}/chat/completions").mock(return_value=reply(json.dumps(spoken)))
    said = await llm().extract("Tomatoes, no harsh midday sun please. I need power from 5 pm.", "en")
    assert [(w.start, w.end) for w in said.avoid_sun] == [("11:00", "15:00")]
    assert [(w.start, w.end) for w in said.power_first] == [("17:00", "21:00")]


@pytest.mark.anyio
@respx.mock
async def test_a_window_without_period_or_start_is_asked_again():
    empty = {**GOOD, "avoid_sun": [{"to": "15:00"}]}
    route = respx.post(f"{BASE}/chat/completions").mock(side_effect=[reply(json.dumps(empty)), reply(json.dumps(GOOD))])
    said = await llm().extract("basil", "en")
    assert said.avoid_sun[0].end == "15:00"
    assert route.call_count == 2
