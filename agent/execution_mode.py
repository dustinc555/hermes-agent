from __future__ import annotations

from typing import Any

NORMAL_EXECUTION_MODE = "normal"
PLAN_EXECUTION_MODE = "plan"
VALID_EXECUTION_MODES = frozenset({NORMAL_EXECUTION_MODE, PLAN_EXECUTION_MODE})

PLAN_MODE_TURN_NOTE = """[PLAN MODE — READ ONLY]
This turn is in Plan Mode. Discuss, inspect, and reason qualitatively with the
user. Do not execute commands, write or modify state, delegate work, or take
external actions. Read-only tools remain available. The core dispatcher will
hard-block anything else. This note applies only to this turn."""

NORMAL_MODE_TURN_NOTE = """[EXECUTION MODE — NORMAL]
This turn is in Normal Mode. Historical execution-mode notes apply only to their
own turns; Plan Mode restrictions do not apply to this turn. Follow the normal
tool and approval policy."""

# Plan Mode is fail-closed: only tools whose complete contract is observational
# are listed. Shell/code execution, delegation, external actions, multiplexed
# tools, and unknown future tools are intentionally absent.
PLAN_READ_ONLY_TOOLS = frozenset(
    {
        "honcho_context",
        "honcho_reasoning",
        "honcho_search",
        "project_list",
        "read_file",
        "read_preview",
        "read_terminal",
        "read_window_below",
        "search_files",
        "session_search",
        "tool_describe",
        "tool_search",
        "vision_analyze",
        "web_extract",
        "web_search",
    }
)


def normalize_execution_mode(value: Any) -> str:
    """Return a supported turn mode; malformed or missing input is Normal."""
    return PLAN_EXECUTION_MODE if value == PLAN_EXECUTION_MODE else NORMAL_EXECUTION_MODE


def execution_mode_turn_note(value: Any) -> str:
    """Return an explicit current-turn note so old Plan notes cannot stay active."""
    if normalize_execution_mode(value) == PLAN_EXECUTION_MODE:
        return PLAN_MODE_TURN_NOTE
    return NORMAL_MODE_TURN_NOTE


def plan_mode_block_message(mode: Any, tool_name: str) -> str | None:
    """Return a hard-block reason for a disallowed Plan-turn tool."""
    if normalize_execution_mode(mode) != PLAN_EXECUTION_MODE:
        return None
    if tool_name in PLAN_READ_ONLY_TOOLS:
        return None
    return (
        f"Plan Mode is read-only: tool '{tool_name}' is not permitted for this turn. "
        "Turn Plan Mode off with Tab and submit a new turn to allow execution."
    )


def plan_mode_runtime_block_message(mode: Any, api_mode: str) -> str | None:
    """Fail closed when an alternate runtime bypasses Hermes tool policy."""
    if (
        normalize_execution_mode(mode) == PLAN_EXECUTION_MODE
        and api_mode == "codex_app_server"
    ):
        return (
            "Plan Mode cannot run through codex_app_server because that runtime "
            "executes tools outside Hermes' read-only dispatcher. Switch to a "
            "standard Hermes runtime or turn Plan Mode off."
        )
    return None
