import json
from types import SimpleNamespace

import pytest

from agent import tool_executor


class _AllowAllGuardrails:
    def before_call(self, _name, _args):
        return SimpleNamespace(allows_execution=True)


class _Agent:
    session_id = "session-1"
    _current_turn_id = "turn-1"
    _current_api_request_id = "request-1"
    _tool_guardrails = _AllowAllGuardrails()

    def __init__(self, mode: str):
        self._current_execution_mode = mode

    def _touch_activity(self, _message):
        pass

    def _guardrail_block_result(self, decision):
        return json.dumps({"error": decision.message})


@pytest.fixture(autouse=True)
def _direct_tool_pipeline(monkeypatch):
    monkeypatch.setattr(
        "agent.relay_tools.execute",
        lambda _name, args, execute, **_kwargs: (execute(args), args),
    )
    monkeypatch.setattr(
        "hermes_cli.middleware.apply_tool_request_middleware",
        lambda _name, args, **_kwargs: SimpleNamespace(payload=args, trace=[]),
    )
    monkeypatch.setattr(
        "hermes_cli.middleware.run_tool_execution_middleware",
        lambda _name, args, execute, **_kwargs: execute(args),
    )
    monkeypatch.setattr(
        "hermes_cli.plugins._dispatch_pre_tool_call_hooks",
        lambda *_args, **_kwargs: (None, None),
    )
    monkeypatch.setattr(tool_executor, "_emit_terminal_post_tool_call", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(tool_executor, "_begin_tool_execution", lambda *_args, **_kwargs: None)


def _run(mode: str, name: str, args: dict):
    executed = []
    managed = tool_executor._run_agent_tool_execution_middleware(
        _Agent(mode),
        function_name=name,
        function_args=args,
        effective_task_id="task-1",
        tool_call_id="call-1",
        execute=lambda final_args: executed.append(final_args) or "executed",
    )
    return managed, executed


def test_plan_mode_hard_blocks_shell_execution_before_dispatch():
    managed, executed = _run("plan", "terminal", {"command": "true"})

    assert managed.blocked is True
    assert executed == []
    assert "Plan Mode" in json.loads(managed.result)["error"]


def test_plan_mode_hard_blocks_unknown_tools_before_dispatch():
    managed, executed = _run("plan", "future_mutator", {})

    assert managed.blocked is True
    assert executed == []


def test_plan_mode_block_runs_before_relay_and_plugin_middleware(monkeypatch):
    reached = []
    monkeypatch.setattr(
        "agent.relay_tools.execute",
        lambda *_args, **_kwargs: reached.append("relay"),
    )
    monkeypatch.setattr(
        "hermes_cli.middleware.apply_tool_request_middleware",
        lambda *_args, **_kwargs: reached.append("request"),
    )
    monkeypatch.setattr(
        "hermes_cli.middleware.run_tool_execution_middleware",
        lambda *_args, **_kwargs: reached.append("execution"),
    )

    managed, executed = _run("plan", "terminal", {"command": "true"})

    assert managed.blocked is True
    assert executed == []
    assert reached == []


@pytest.mark.parametrize(
    "tool_name",
    [
        "browser_exec",
        "delegate_task",
        "execute_code",
        "honcho_profile",
        "memory",
        "process",
        "skill_view",
        "skills_list",
        "terminal",
        "todo",
        "tool_call",
        "write_file",
    ],
)
def test_plan_mode_blocks_mutation_execution_delegation_and_mixed_tools(tool_name):
    managed, executed = _run("plan", tool_name, {})

    assert managed.blocked is True
    assert executed == []


def test_plan_mode_allows_explicit_read_only_tools():
    managed, executed = _run("plan", "read_file", {"path": "README.md"})

    assert managed.blocked is False
    assert managed.result == "executed"
    assert executed == [{"path": "README.md"}]


def test_normal_mode_does_not_add_a_core_tool_block():
    managed, executed = _run("normal", "terminal", {"command": "true"})

    assert managed.blocked is False
    assert managed.result == "executed"
    assert executed == [{"command": "true"}]


def test_every_turn_gets_an_explicit_authoritative_execution_mode_note():
    from agent.execution_mode import execution_mode_turn_note

    plan_note = execution_mode_turn_note("plan")
    normal_note = execution_mode_turn_note("normal")

    assert plan_note.startswith("[PLAN MODE — READ ONLY]")
    assert "only to this turn" in plan_note
    assert normal_note.startswith("[EXECUTION MODE — NORMAL]")
    assert "Historical execution-mode notes apply only" in normal_note
    assert "Plan Mode restrictions do not apply to this turn" in normal_note


def test_agent_snapshots_execution_mode_for_exactly_one_turn(monkeypatch):
    from run_agent import AIAgent

    agent = AIAgent.__new__(AIAgent)
    observed = []

    def run_conversation(parent, *_args, **_kwargs):
        observed.append(parent._current_execution_mode)
        return {"final_response": "ok"}

    monkeypatch.setattr("agent.conversation_loop.run_conversation", run_conversation)

    assert agent.run_conversation("discuss", execution_mode="plan") == {
        "final_response": "ok"
    }
    assert observed == ["plan"]
    assert agent._current_execution_mode == "normal"


def test_plan_mode_refuses_codex_app_server_runtime():
    from agent.execution_mode import plan_mode_runtime_block_message

    assert plan_mode_runtime_block_message("plan", "codex_app_server")
    assert plan_mode_runtime_block_message("normal", "codex_app_server") is None
