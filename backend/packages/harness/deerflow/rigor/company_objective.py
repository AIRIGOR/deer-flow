"""Select the actual company command rather than injected memory/reminders."""


def company_objective(messages) -> str:
    for message in messages:
        metadata = getattr(message, "additional_kwargs", {})
        if getattr(message, "type", None) == "human" and not metadata.get("dynamic_context_reminder") and not metadata.get("hide_from_ui"):
            content = message.content
            if isinstance(content, str) and content.strip():
                return content
    raise ValueError("Delegation requires an actual company command")
