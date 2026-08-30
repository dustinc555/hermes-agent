import threading
from types import SimpleNamespace

import pytest

from tui_gateway import server


@pytest.fixture
def busy_session():
    session = {
        "agent": SimpleNamespace(),
        "session_key": "stored-session-1",
        "history": [],
        "history_lock": threading.Lock(),
        "history_version": 0,
        "running": True,
        "transport": None,
        "attached_images": [],
    }
    server._sessions["runtime-session-1"] = session
    try:
        yield session
    finally:
        server._sessions.pop("runtime-session-1", None)


def test_prompt_submit_preserves_plan_mode_in_server_queue(busy_session):
    response = server._methods["prompt.submit"](
        "request-1",
        {
            "session_id": "runtime-session-1",
            "text": "discuss this",
            "execution_mode": "plan",
            "queued": True,
        },
    )

    assert response["result"]["status"] == "queued"
    assert busy_session["queued_prompt"]["execution_mode"] == "plan"


def test_busy_plan_submit_cannot_steer_a_running_normal_turn(monkeypatch, busy_session):
    steered = []
    busy_session["agent"] = SimpleNamespace(
        _current_execution_mode="normal",
        steer=lambda text: steered.append(text) or True,
    )
    monkeypatch.setattr(server, "_load_busy_input_mode", lambda: "steer")

    response = server._handle_busy_submit(
        "request-plan",
        "runtime-session-1",
        busy_session,
        "keep this read only",
        None,
        execution_mode="plan",
    )

    assert response["result"]["status"] == "queued"
    assert steered == []
    assert busy_session["queued_prompt"]["execution_mode"] == "plan"


def test_server_queue_drain_uses_the_queued_turn_mode(monkeypatch, busy_session):
    captured = {}
    busy_session["running"] = False
    busy_session["queued_prompt"] = {
        "text": "discuss this later",
        "transport": None,
        "execution_mode": "plan",
    }
    monkeypatch.setattr(server, "_session_uses_compute_host", lambda _session: False)
    monkeypatch.setattr(
        server,
        "_run_prompt_submit",
        lambda _rid, _sid, _session, _text, **kwargs: captured.update(kwargs),
    )

    assert server._drain_queued_prompt(
        "request-1", "runtime-session-1", busy_session
    ) is True
    assert captured["execution_mode"] == "plan"


def test_prompt_submit_normalizes_unknown_execution_mode(busy_session):
    server._methods["prompt.submit"](
        "request-1",
        {
            "session_id": "runtime-session-1",
            "text": "do this",
            "execution_mode": "future-mode",
            "queued": True,
        },
    )

    assert busy_session["queued_prompt"].get("execution_mode", "normal") == "normal"


def test_prompt_submit_passes_plan_mode_to_turn_runner(monkeypatch, busy_session):
    captured = {}

    class ImmediateThread:
        def __init__(self, target, **_kwargs):
            self.target = target

        def start(self):
            self.target()

        def is_alive(self):
            return False

    busy_session["running"] = False
    monkeypatch.setattr(server.threading, "Thread", ImmediateThread)
    monkeypatch.setattr(
        server,
        "_run_prompt_submit",
        lambda _rid, _sid, _session, _text, **kwargs: captured.update(kwargs),
    )

    server._methods["prompt.submit"](
        "request-1",
        {
            "session_id": "runtime-session-1",
            "text": "discuss this",
            "execution_mode": "plan",
        },
    )

    assert captured["execution_mode"] == "plan"


def test_turn_runner_forwards_plan_mode_to_agent(monkeypatch):
    captured = {}

    class Agent:
        session_id = "stored-session-1"
        _cached_system_prompt = ""

        def clear_interrupt(self):
            pass

        def run_conversation(self, prompt, **kwargs):
            captured.update(kwargs)
            return {
                "final_response": "discussed",
                "messages": [
                    {"role": "user", "content": prompt},
                    {"role": "assistant", "content": "discussed"},
                ],
            }

    class ImmediateThread:
        def __init__(self, target=None, **_kwargs):
            self.target = target

        def start(self):
            self.target()

        def is_alive(self):
            return False

    session = {
        "agent": Agent(),
        "session_key": "stored-session-1",
        "history": [],
        "history_lock": threading.Lock(),
        "history_version": 0,
        "running": True,
        "transport": None,
        "attached_images": [],
        "cols": 80,
        "pending_title": None,
    }
    monkeypatch.setattr(server.threading, "Thread", ImmediateThread)
    monkeypatch.setattr(server, "_emit", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(server, "make_stream_renderer", lambda _cols: None)
    monkeypatch.setattr(server, "render_message", lambda *_args, **_kwargs: "")
    monkeypatch.setattr(
        server,
        "_sync_session_key_after_compress",
        lambda *_args, **_kwargs: None,
    )

    server._run_prompt_submit(
        "request-1",
        "runtime-session-1",
        session,
        "discuss this",
        execution_mode="plan",
    )

    assert captured["execution_mode"] == "plan"


def test_compute_host_turn_frame_carries_plan_mode():
    session = {
        "session_key": "stored-session-1",
        "history": [],
        "history_lock": threading.Lock(),
        "history_version": 0,
        "attached_images": [],
        "cols": 80,
    }

    frame = server._compute_host_turn_frame(
        "request-1",
        "runtime-session-1",
        session,
        "discuss this",
        execution_mode="plan",
    )

    assert frame["execution_mode"] == "plan"
