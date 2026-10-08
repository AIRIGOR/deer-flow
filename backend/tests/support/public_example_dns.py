"""Deterministic DNS for explicitly selected unit tests with mocked web clients.

Runtime URL validation remains enabled. Private-IP, failed-DNS and rebinding
regressions keep their own resolvers and are never selected by this fixture.
"""

from __future__ import annotations

import socket

import pytest

_MOCKED_PUBLIC_CLIENT_TESTS = {
    "test_navigate_returns_snapshot",
    "test_navigate_emits_screenshot_artifact_and_browser_view",
    "test_navigate_screenshot_failure_does_not_break_action",
    "test_validate_browser_url_rejects_private_and_non_http",
    "test_web_fetch_tool_success",
    "test_web_fetch_tool_warns_on_target_error_status",
    "test_web_fetch_tool_no_warning_for_normal_target_status",
    "test_web_fetch_and_web_capture_tools_agree_on_target_error_warning",
    "test_web_fetch_tool_truncates_to_4096",
    "test_web_fetch_tool_passes_configured_filter",
    "test_web_fetch_tool_invalid_filter_falls_back_to_fit",
    "test_fetch_uses_web_fetch_config",
    "test_fetch_returns_error_when_no_content",
    "test_fetch_returns_error_string_on_exception",
}


@pytest.fixture(autouse=True)
def public_example_dns(monkeypatch, request):
    if request.node.name not in _MOCKED_PUBLIC_CLIENT_TESTS:
        return
    original = socket.getaddrinfo

    def resolve(host, port, *args, **kwargs):
        if host in {"example.com", "github.com"}:
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", port or 0))]
        return original(host, port, *args, **kwargs)

    monkeypatch.setattr(socket, "getaddrinfo", resolve)
