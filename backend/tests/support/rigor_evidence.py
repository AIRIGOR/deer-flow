"""Fictional checkpoint-ledger fixtures; never live delegation proof."""

PULSE_AGENTS = ["rigor-product-ops", "rigor-engineering", "rigor-qa-security", "rigor-market-intel", "rigor-partnerships-capital", "rigor-chief-of-staff"]


def checkpoint(thread_id, agents):
    return {
        "thread_id": thread_id,
        "checkpoints": [
            {
                "checkpoint_id": "synthetic-checkpoint",
                "values": {
                    "delegations": [
                        {"id": f"task-{index}", "run_id": "synthetic-run", "subagent_type": agent, "status": "completed", "result_sha256": "a" * 64, "result_ref": f"result-{index}", "result_brief": "private fixture detail"}
                        for index, agent in enumerate(agents, 1)
                    ]
                },
            }
        ],
    }
