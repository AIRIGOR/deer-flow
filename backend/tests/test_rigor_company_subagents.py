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
