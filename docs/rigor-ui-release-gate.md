# RIGOR UI Flow Redesign + Pre-LIVE Release Gate

## Design intent

RIGOR should feel calm, guided, and continuous: **river, not cockpit**.

The production intelligence can remain deep underneath, but the operator-facing experience should minimize cognitive noise and make the next action immediately obvious.

Core interaction model:

**NOW → DECIDE → RESOLVE → NEXT**

## Required interface changes

- Remove **"Working Private Beta"** from the main operational workspace before commercial/live presentation.
- Do not present DeerFlow/engine connection status as a prominent user-facing badge. RIGOR should simply work.
- Replace dashboard-style information overload with a guided workflow.
- Give each primary screen one dominant next action. Secondary actions must be visually subordinate.
- Use progressive disclosure:
  1. **Surface / NOW** — readiness, blockers, next action.
  2. **WORK** — current requirement, conflict, checkpoint, or decision with only relevant controls.
  3. **EVIDENCE** — source PDF/page/provenance/comparisons available on demand without competing in the primary visual field.
- Reduce simultaneous cards, badges, metrics, filters, and controls.
- Simplify production switching so the production-card grid does not dominate the active workspace.
- Keep the three-stage mental model: **Intake → Advance → Show Day**, but render it as a quiet progress path rather than three competing dashboard cards.
- Use color semantically:
  - Mostly neutral interface.
  - Green = resolved / complete / current RIGOR action.
  - Amber = attention required.
  - Red = true production blocker.
  - Avoid decorative status color.
- Increase whitespace and strengthen visual hierarchy, alignment, typography, and component spacing.
- Keep source evidence easy to access but visually subordinate until requested.
- Preserve current core functionality: uploads, requirement review, conflicts, ownership, readiness, checkpoints, incidents, and report/PDF export.

## Pre-LIVE release gate

RIGOR must not be published LIVE until all checks below pass.

### Visual

- [ ] Desktop hierarchy reviewed at common laptop widths.
- [ ] Mobile layout reviewed at iPhone-size widths.
- [ ] No screen presents multiple equally dominant CTAs.
- [ ] No unnecessary beta, development, or engine language appears in the operational workspace.
- [ ] Color is used semantically rather than decoratively.
- [ ] Spacing, typography, alignment, button sizing, card density, and hierarchy are consistent.
- [ ] Empty, loading, success, warning, blocked, and error states look intentional.

### Workflow

- [ ] A first-time evaluator can identify the next action within seconds.
- [ ] Upload → review → resolve → readiness → show day → report feels continuous.
- [ ] Completing an action clearly advances the user toward the next task.
- [ ] Evidence/provenance is available without interrupting the main task flow.
- [ ] Production switching is clear without overwhelming the active-show workspace.

### Interaction

- [ ] Buttons, forms, dialogs, filters, uploads, session transitions, and report actions are tested.
- [ ] Keyboard/focus behavior is checked for dialogs and core controls.
- [ ] Mobile tap targets and overflow are checked.
- [ ] No clipped text, horizontal scrolling, overlapping controls, or unreadable states.

## Final triple-check before LIVE

1. Review the deploy preview visually on desktop and mobile.
2. Run the complete RIGOR workflow end-to-end on that preview.
3. Perform one final visual-aesthetic and cognitive-load pass before publishing the production alias.

**Do not make the redesigned interface LIVE until all three final checks pass.**
