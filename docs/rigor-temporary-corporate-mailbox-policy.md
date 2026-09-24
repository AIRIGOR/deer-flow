# RIGOR Temporary Corporate Mailbox Policy

## Current mode

RIGOR may use the Founder-authorized Outlook mailbox configured at runtime as
the temporary corporate sender identity until a branded company-domain mailbox
is provisioned.

The mailbox address is stored in deployment configuration under
`RIGOR_CORP_FROM_EMAIL`, not in source control.

## Permitted business use

The temporary corporate mailbox may be used for:
- accelerator and grant applications;
- investor and strategic-partner correspondence;
- customer and pilot follow-up;
- vendor and production-industry outreach;
- support and onboarding communication;
- diligence and scheduling correspondence.

## Authority boundary

RIGOR may autonomously research, prepare, and draft correspondence.

Actual external email sending remains a Founder-approved action. No agent may
bypass the EMAIL_SEND approval gate by disguising a send as a draft or internal
task.

## Migration to branded mail

When a branded mailbox becomes available, update `RIGOR_CORP_FROM_EMAIL` and
the authorized mail connector. No company-agent prompt or workflow should need
to be rewritten.

## Operational intent

This is a temporary bridge so corporate work can proceed now without coupling
RIGOR's operating system to a personal email address permanently.
