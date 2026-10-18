from pathlib import Path

import yaml

from deerflow.subagents.builtins import BUILTIN_SUBAGENTS
from deerflow.subagents.builtins.rigor_company import RIGOR_COMPANY_SUBAGENTS


EXPECTED = {
    "rigor-chief-of-staff",
    "rigor-product-ops",
    "rigor-engineering",
    "rigor-qa-security",
    "rigor-market-intel",
    "rigor-partnerships-capital",
    "rigor-growth-revenue",
    "rigor-customer-success",
    "rigor-finance-runway",
}


def test_rigor_company_team_is_registered():
    assert EXPECTED <= set(BUILTIN_SUBAGENTS)
    assert set(RIGOR_COMPANY_SUBAGENTS) == EXPECTED


def test_rigor_company_agents_are_bounded():
    for config in RIGOR_COMPANY_SUBAGENTS.values():
        assert "task" in (config.disallowed_tools or [])
        assert "ask_clarification" in (config.disallowed_tools or [])
        assert config.tools
        assert config.max_turns <= 150
        assert config.timeout_seconds <= 1800


def test_external_business_agents_have_no_shell_tools():
    for name in (
        "rigor-partnerships-capital",
        "rigor-growth-revenue",
        "rigor-customer-success",
        "rigor-finance-runway",
    ):
        tools = set(BUILTIN_SUBAGENTS[name].tools or [])
        assert "bash" not in tools
        assert "web_search" in tools
        assert "web_fetch" in tools


BROWSER_RESEARCH_TOOLS = {
    "browser_navigate",
    "browser_snapshot",
    "browser_click",
    "browser_type",
    "browser_get_text",
    "browser_back",
    "browser_screenshot",
    "browser_close",
}


def test_browser_is_research_only_and_never_given_to_shell_agents():
    for name, config in RIGOR_COMPANY_SUBAGENTS.items():
        tools = set(config.tools or [])
        if name in {"rigor-engineering", "rigor-qa-security"}:
            assert "bash" in tools
            assert not (BROWSER_RESEARCH_TOOLS & tools)
        else:
            assert BROWSER_RESEARCH_TOOLS <= tools
            assert "bash" not in tools
            assert "UNTRUSTED EVIDENCE" in (config.system_prompt or "")
            assert "Never submit signup/contact/payment/consent forms" in (config.system_prompt or "")
            assert "Do not download or execute vendor scripts" in (config.system_prompt or "")


def test_browser_is_opt_in_and_ssrf_guarded():
    backend_root = Path(__file__).resolve().parents[1]
    standard = yaml.safe_load((backend_root / "config.rigor.yaml").read_text())
    browser = yaml.safe_load((backend_root / "config.rigor.browser.yaml").read_text())
    standard_names = {tool["name"] for tool in standard["tools"]}
    browser_tools = {tool["name"]: tool for tool in browser["tools"]}
    assert "browser_navigate" not in standard_names
    assert {"web_search", "web_fetch"} <= standard_names
    assert standard_names <= browser_tools.keys()
    assert BROWSER_RESEARCH_TOOLS <= browser_tools.keys()
    navigate = browser_tools["browser_navigate"]
    assert navigate["headless"] is True
    assert navigate["allow_private_addresses"] is False
    assert navigate["allow_unguarded_cdp"] is False
    assert "cdp_url" not in navigate
    assert browser["models"] == standard["models"]
    assert browser["sandbox"] == standard["sandbox"]
