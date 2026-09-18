from __future__ import annotations

import hashlib
import hmac
import io
import json
import re
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .database import Database
from .seed import CHECKPOINTS, CONFLICTS, DOCUMENTS, REQUIREMENTS


DEPARTMENTS = (
    "Audio",
    "Backline",
    "Communications",
    "Hospitality",
    "Labor",
    "Lighting",
    "Medical",
    "Merchandise",
    "Power",
    "Production",
    "Rigging",
    "Security",
    "Stage Management",
    "Video",
)

KEYWORDS = {
    "Audio": ("audio", "console", "speaker", "microphone", "spl", "pa "),
    "Backline": ("backline", "drum", "guitar", "riser", "keyboard"),
    "Communications": ("radio", "comms", "intercom", "channel"),
    "Hospitality": ("meal", "catering", "hospitality", "dressing room"),
    "Labor": ("labor", "stagehand", "crew call", "steward"),
    "Lighting": ("lighting", "fixture", "sacn", "dmx", "followspot"),
    "Power": ("power", "amp", "voltage", "phase", "disconnect"),
    "Rigging": ("rigging", "rig point", "trim", "load", "steel", "hoist"),
    "Security": ("security", "barricade", "credential"),
    "Stage Management": ("load-in", "dock", "curfew", "doors"),
    "Video": ("video", "led", "fiber", "camera", "projection", "screen"),
}


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


class RigorService:
    def __init__(self, database: Database, secret_key: str) -> None:
        self.db = database
        self.secret_key = secret_key.encode()

    def _session_hash(self, token: str) -> str:
        return hmac.new(self.secret_key, token.encode(), hashlib.sha256).hexdigest()

    def start_tester(self, display_name: str, role: str) -> tuple[str, dict[str, Any]]:
        now = utc_now()
        tester_id = new_id("tester")
        workspace_id = new_id("workspace")
        show_id = new_id("show")
        token = secrets.token_urlsafe(36)
        expires_at = (datetime.now(UTC) + timedelta(days=45)).isoformat()

        with self.db.transaction() as connection:
            connection.execute(
                "INSERT INTO testers VALUES (?, ?, ?, ?, ?)",
                (tester_id, display_name.strip(), role, now, now),
            )
            connection.execute(
                "INSERT INTO auth_sessions VALUES (?, ?, ?, ?)",
                (self._session_hash(token), tester_id, expires_at, now),
            )
            connection.execute(
                "INSERT INTO workspaces VALUES (?, ?, 1, '[]', ?, ?)",
                (workspace_id, tester_id, now, now),
            )
            connection.execute(
                "INSERT INTO shows VALUES (?, ?, ?, ?, ?, ?, ?, 'PREPRODUCTION')",
                (
                    show_id,
                    workspace_id,
                    "Northstar Arena Tour · Las Vegas",
                    "Northstar",
                    "Desert Crown Arena",
                    "Las Vegas, NV",
                    "2026-10-24",
                ),
            )

            for document in DOCUMENTS:
                connection.execute(
                    "INSERT INTO documents VALUES (?, ?, ?, ?, 'PROCESSED', ?, 'DEMO', ?)",
                    (new_id("doc"), workspace_id, document["name"], document["doc_type"], document["page_count"], now),
                )
            for requirement in REQUIREMENTS:
                connection.execute(
                    """INSERT INTO requirements
                    (requirement_id, workspace_id, department, title, detail, status,
                     owner, due_at, document_name, page_number, excerpt, source_kind)
                    VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, 'DEMO')""",
                    (
                        new_id("req"),
                        workspace_id,
                        requirement["department"],
                        requirement["title"],
                        requirement["detail"],
                        requirement["status"],
                        requirement["document_name"],
                        requirement["page_number"],
                        requirement["excerpt"],
                    ),
                )
            for conflict in CONFLICTS:
                connection.execute(
                    """INSERT INTO conflicts
                    (conflict_id, workspace_id, department, title, severity,
                     left_value, right_value, left_source, right_source, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN')""",
                    (
                        new_id("conflict"),
                        workspace_id,
                        conflict["department"],
                        conflict["title"],
                        conflict["severity"],
                        conflict["left_value"],
                        conflict["right_value"],
                        conflict["left_source"],
                        conflict["right_source"],
                    ),
                )
            for sequence, checkpoint in enumerate(CHECKPOINTS, start=1):
                connection.execute(
                    "INSERT INTO checkpoints VALUES (?, ?, ?, ?, ?, 'PENDING', NULL)",
                    (new_id("checkpoint"), workspace_id, checkpoint["label"], checkpoint["department"], sequence),
                )

        self._log(workspace_id, "TESTER_STARTED", {"role": role})
        return token, self.snapshot_for_tester(tester_id)

    def tester_for_token(self, token: str | None) -> dict[str, Any] | None:
        if not token:
            return None
        row = self.db.row(
            """SELECT t.* FROM auth_sessions s
            JOIN testers t ON t.tester_id = s.tester_id
            WHERE s.session_hash = ? AND s.expires_at > ?""",
            (self._session_hash(token), utc_now()),
        )
        if row:
            self.db.execute("UPDATE testers SET last_seen_at = ? WHERE tester_id = ?", (utc_now(), row["tester_id"]))
        return row

    def workspace_for_tester(self, tester_id: str) -> dict[str, Any]:
        workspace = self.db.row("SELECT * FROM workspaces WHERE tester_id = ?", (tester_id,))
        if not workspace:
            raise LookupError("Workspace not found")
        return workspace

    def snapshot_for_tester(self, tester_id: str) -> dict[str, Any]:
        tester = self.db.row("SELECT tester_id, display_name, role FROM testers WHERE tester_id = ?", (tester_id,))
        workspace = self.workspace_for_tester(tester_id)
        workspace_id = workspace["workspace_id"]
        show = self.db.row("SELECT * FROM shows WHERE workspace_id = ?", (workspace_id,))
        requirements = self.db.rows(
            "SELECT * FROM requirements WHERE workspace_id = ? ORDER BY department, title",
            (workspace_id,),
        )
        conflicts = self.db.rows(
            "SELECT * FROM conflicts WHERE workspace_id = ? ORDER BY CASE severity WHEN 'CRITICAL' THEN 0 ELSE 1 END, department",
            (workspace_id,),
        )
        checkpoints = self.db.rows(
            "SELECT * FROM checkpoints WHERE workspace_id = ? ORDER BY sequence",
            (workspace_id,),
        )
        progress = self.progress(workspace_id, requirements, conflicts, checkpoints)
        return {
            "tester": tester,
            "workspace": {
                **workspace,
                "completed_sessions": json.loads(workspace["completed_sessions"]),
            },
            "show": show,
            "documents": self.db.rows("SELECT * FROM documents WHERE workspace_id = ? ORDER BY created_at", (workspace_id,)),
            "requirements": requirements,
            "conflicts": conflicts,
            "checkpoints": checkpoints,
            "incidents": self.db.rows("SELECT * FROM incidents WHERE workspace_id = ? ORDER BY created_at DESC", (workspace_id,)),
            "readiness": self.readiness(requirements, conflicts, checkpoints),
            "progress": progress,
            "departments": self.department_summary(requirements, conflicts),
        }

    def progress(
        self,
        workspace_id: str,
        requirements: list[dict[str, Any]] | None = None,
        conflicts: list[dict[str, Any]] | None = None,
        checkpoints: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        requirements = requirements or self.db.rows("SELECT * FROM requirements WHERE workspace_id = ?", (workspace_id,))
        conflicts = conflicts or self.db.rows("SELECT * FROM conflicts WHERE workspace_id = ?", (workspace_id,))
        checkpoints = checkpoints or self.db.rows("SELECT * FROM checkpoints WHERE workspace_id = ?", (workspace_id,))
        reviewed = sum(item["status"] in {"CONFIRMED", "REJECTED", "RESOLVED"} for item in requirements)
        owned = sum(bool(item["owner"]) for item in requirements)
        resolved = sum(item["status"] == "RESOLVED" for item in conflicts)
        completed_checks = sum(item["status"] == "COMPLETE" for item in checkpoints)
        sessions = {
            "1": {"complete": reviewed >= 6, "done": reviewed, "total": 6, "label": "Preproduction intake"},
            "2": {"complete": resolved == len(conflicts) and owned >= 4, "done": min(resolved + owned, len(conflicts) + 4), "total": len(conflicts) + 4, "label": "Technical advance"},
            "3": {"complete": completed_checks == len(checkpoints), "done": completed_checks, "total": len(checkpoints), "label": "Show day"},
        }
        completed = [int(number) for number, value in sessions.items() if value["complete"]]
        current = 1 if 1 not in completed else 2 if 2 not in completed else 3
        self.db.execute(
            "UPDATE workspaces SET current_session = ?, completed_sessions = ?, updated_at = ? WHERE workspace_id = ?",
            (current, json.dumps(completed), utc_now(), workspace_id),
        )
        return {"sessions": sessions, "current_session": current, "completed_sessions": completed}

    def update_requirement(self, workspace_id: str, requirement_id: str, values: dict[str, Any]) -> None:
        requirement = self.db.row(
            "SELECT * FROM requirements WHERE requirement_id = ? AND workspace_id = ?",
            (requirement_id, workspace_id),
        )
        if not requirement:
            raise LookupError("Requirement not found")
        status = values.get("status", requirement["status"])
        department = values.get("department", requirement["department"])
        owner = values.get("owner", requirement["owner"])
        due_at = values.get("due_at", requirement["due_at"])
        if status not in {"EXTRACTED", "NEEDS_CONFIRMATION", "CONFIRMED", "REJECTED", "RESOLVED"}:
            raise ValueError("Invalid requirement status")
        if department not in DEPARTMENTS:
            raise ValueError("Invalid department")
        self.db.execute(
            "UPDATE requirements SET status = ?, department = ?, owner = ?, due_at = ? WHERE requirement_id = ? AND workspace_id = ?",
            (status, department, owner, due_at, requirement_id, workspace_id),
        )
        self._log(workspace_id, "REQUIREMENT_UPDATED", {"requirement_id": requirement_id, "status": status})
        self.progress(workspace_id)

    def resolve_conflict(self, workspace_id: str, conflict_id: str, resolution: str, owner: str) -> None:
        if len(resolution.strip()) < 8:
            raise ValueError("Resolution must explain the operational decision")
        cursor = self.db.row(
            "SELECT conflict_id FROM conflicts WHERE conflict_id = ? AND workspace_id = ?",
            (conflict_id, workspace_id),
        )
        if not cursor:
            raise LookupError("Conflict not found")
        self.db.execute(
            """UPDATE conflicts SET status = 'RESOLVED', resolution = ?, owner = ?, resolved_at = ?
            WHERE conflict_id = ? AND workspace_id = ?""",
            (resolution.strip(), owner.strip(), utc_now(), conflict_id, workspace_id),
        )
        self._log(workspace_id, "CONFLICT_RESOLVED", {"conflict_id": conflict_id})
        self.progress(workspace_id)

    def update_checkpoint(self, workspace_id: str, checkpoint_id: str, complete: bool) -> None:
        row = self.db.row(
            "SELECT checkpoint_id FROM checkpoints WHERE checkpoint_id = ? AND workspace_id = ?",
            (checkpoint_id, workspace_id),
        )
        if not row:
            raise LookupError("Checkpoint not found")
        self.db.execute(
            "UPDATE checkpoints SET status = ?, completed_at = ? WHERE checkpoint_id = ? AND workspace_id = ?",
            ("COMPLETE" if complete else "PENDING", utc_now() if complete else None, checkpoint_id, workspace_id),
        )
        self._log(workspace_id, "CHECKPOINT_UPDATED", {"checkpoint_id": checkpoint_id, "complete": complete})
        self.progress(workspace_id)
        self._sync_show_status(workspace_id)

    def add_incident(self, workspace_id: str, department: str, summary: str, severity: str, resolution: str | None) -> None:
        if department not in DEPARTMENTS:
            raise ValueError("Invalid department")
        if severity not in {"LOW", "MEDIUM", "HIGH", "CRITICAL"}:
            raise ValueError("Invalid severity")
        self.db.execute(
            "INSERT INTO incidents VALUES (?, ?, ?, ?, ?, ?, ?)",
            (new_id("incident"), workspace_id, department, summary.strip(), severity, (resolution or "").strip() or None, utc_now()),
        )
        self._log(workspace_id, "INCIDENT_LOGGED", {"department": department, "severity": severity})

    def save_feedback(self, workspace_id: str, session_number: int, useful_score: int, trust_score: int, comments: str) -> None:
        if session_number not in {1, 2, 3} or not 1 <= useful_score <= 5 or not 1 <= trust_score <= 5:
            raise ValueError("Invalid feedback values")
        self.db.execute(
            "INSERT INTO feedback VALUES (?, ?, ?, ?, ?, ?, ?)",
            (new_id("feedback"), workspace_id, session_number, useful_score, trust_score, comments.strip(), utc_now()),
        )

    def ingest_document(self, workspace_id: str, filename: str, content: bytes) -> dict[str, Any]:
        if len(content) > 15 * 1024 * 1024:
            raise ValueError("Document exceeds the 15 MB beta limit")
        safe_name = re.sub(r"[^A-Za-z0-9._ -]", "_", filename).strip()[:120] or "uploaded-document"
        pages: list[str]
        if safe_name.lower().endswith(".pdf"):
            reader = PdfReader(io.BytesIO(content))
            pages = [(page.extract_text() or "") for page in reader.pages]
        elif safe_name.lower().endswith(".txt"):
            pages = [content.decode("utf-8", errors="replace")]
        else:
            raise ValueError("Upload a PDF or TXT document")
        document_id = new_id("doc")
        now = utc_now()
        self.db.execute(
            "INSERT INTO documents VALUES (?, ?, ?, 'UPLOADED', 'PROCESSED', ?, 'TESTER', ?)",
            (document_id, workspace_id, safe_name, len(pages), now),
        )
        extracted = self._extract_requirements(workspace_id, safe_name, pages)
        self._log(workspace_id, "DOCUMENT_PROCESSED", {"document_id": document_id, "requirements": len(extracted)})
        return {"document_id": document_id, "name": safe_name, "page_count": len(pages), "requirements_added": len(extracted)}

    def _extract_requirements(self, workspace_id: str, name: str, pages: list[str]) -> list[str]:
        ids: list[str] = []
        trigger = re.compile(r"\b(must|required|requires|provide|minimum|maximum|shall|confirm|load[- ]?in|voltage|amp(?:s|ere)?)\b", re.I)
        for page_number, text in enumerate(pages, start=1):
            candidates = re.split(r"(?<=[.!?])\s+|[\r\n]+", text)
            for sentence in candidates:
                cleaned = " ".join(sentence.split()).strip(" -•\t")
                if not 24 <= len(cleaned) <= 360 or not trigger.search(cleaned):
                    continue
                lowered = f" {cleaned.lower()} "
                department = next(
                    (dept for dept, words in KEYWORDS.items() if any(word in lowered for word in words)),
                    "Production",
                )
                requirement_id = new_id("req")
                title = cleaned[:72].rstrip(" ,.;:")
                self.db.execute(
                    """INSERT INTO requirements
                    (requirement_id, workspace_id, department, title, detail, status,
                     owner, due_at, document_name, page_number, excerpt, source_kind)
                    VALUES (?, ?, ?, ?, ?, 'NEEDS_CONFIRMATION', NULL, NULL, ?, ?, ?, 'TESTER')""",
                    (requirement_id, workspace_id, department, title, cleaned, name, page_number, cleaned),
                )
                ids.append(requirement_id)
                if len(ids) >= 40:
                    return ids
        return ids

    def readiness(self, requirements: list[dict[str, Any]], conflicts: list[dict[str, Any]], checkpoints: list[dict[str, Any]]) -> dict[str, Any]:
        confirmed = sum(item["status"] in {"CONFIRMED", "RESOLVED"} for item in requirements)
        open_conflicts = sum(item["status"] != "RESOLVED" for item in conflicts)
        completed_checks = sum(item["status"] == "COMPLETE" for item in checkpoints)
        requirement_score = confirmed / max(len(requirements), 1)
        conflict_score = 1 - open_conflicts / max(len(conflicts), 1)
        checkpoint_score = completed_checks / max(len(checkpoints), 1)
        score = round((requirement_score * 0.45 + conflict_score * 0.35 + checkpoint_score * 0.20) * 100)
        status = "BLOCKED" if open_conflicts else "SHOW_READY" if completed_checks == len(checkpoints) else "ADVANCE_READY"
        return {
            "score": score,
            "status": status,
            "confirmed_requirements": confirmed,
            "total_requirements": len(requirements),
            "open_conflicts": open_conflicts,
            "completed_checkpoints": completed_checks,
            "total_checkpoints": len(checkpoints),
        }

    def department_summary(self, requirements: list[dict[str, Any]], conflicts: list[dict[str, Any]]) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = []
        for department in sorted({item["department"] for item in requirements}):
            scoped = [item for item in requirements if item["department"] == department]
            open_conflicts = sum(item["department"] == department and item["status"] != "RESOLVED" for item in conflicts)
            ready = sum(item["status"] in {"CONFIRMED", "RESOLVED"} for item in scoped)
            status = "BLOCKED" if open_conflicts else "READY" if ready == len(scoped) else "NEEDS_REVIEW"
            result.append({"department": department, "total": len(scoped), "ready": ready, "open_conflicts": open_conflicts, "status": status})
        return result

    def report_pdf(self, workspace_id: str, department: str | None = None) -> bytes:
        show = self.db.row("SELECT * FROM shows WHERE workspace_id = ?", (workspace_id,))
        requirements = self.db.rows("SELECT * FROM requirements WHERE workspace_id = ? ORDER BY department, title", (workspace_id,))
        conflicts = self.db.rows("SELECT * FROM conflicts WHERE workspace_id = ? ORDER BY department", (workspace_id,))
        checkpoints = self.db.rows("SELECT * FROM checkpoints WHERE workspace_id = ? ORDER BY sequence", (workspace_id,))
        if department:
            requirements = [item for item in requirements if item["department"] == department]
            conflicts = [item for item in conflicts if item["department"] == department]
        readiness = self.readiness(requirements, conflicts, checkpoints)
        buffer = io.BytesIO()
        styles = getSampleStyleSheet()
        document = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=0.5 * inch, leftMargin=0.5 * inch, topMargin=0.5 * inch, bottomMargin=0.5 * inch)
        story: list[Any] = [
            Paragraph("RIGOR", styles["Title"]),
            Paragraph("Department Advance Report" if department else "Master Advance Report", styles["Heading2"]),
            Paragraph(f"{show['show_name']} · {show['venue']} · {show['show_date']}", styles["BodyText"]),
            Spacer(1, 12),
            Paragraph(f"Readiness: {readiness['status']} · {readiness['score']}%", styles["Heading2"]),
            Spacer(1, 8),
        ]
        rows = [["Department", "Requirement", "Status", "Owner", "Source"]]
        for item in requirements:
            rows.append([
                item["department"],
                Paragraph(item["title"], styles["BodyText"]),
                item["status"].replace("_", " "),
                item["owner"] or "—",
                Paragraph(f"{item['document_name']} · p{item['page_number'] or '—'}", styles["BodyText"]),
            ])
        table = Table(rows, colWidths=[0.9 * inch, 2.35 * inch, 1.0 * inch, 0.9 * inch, 1.35 * inch], repeatRows=1)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#15212a")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 7),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#c7d0d6")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f4f7f8")]),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.extend([table, Spacer(1, 14), Paragraph("Open conflicts", styles["Heading2"])])
        if conflicts:
            for item in conflicts:
                story.append(Paragraph(f"<b>{item['department']} · {item['title']}</b> — {item['status'].replace('_', ' ')}", styles["BodyText"]))
        else:
            story.append(Paragraph("No conflicts in this report scope.", styles["BodyText"]))
        story.extend([Spacer(1, 16), Paragraph(f"Generated {utc_now()} · Source evidence preserved by RIGOR", styles["BodyText"])])
        document.build(story)
        return buffer.getvalue()

    def _sync_show_status(self, workspace_id: str) -> None:
        snapshot = self.db.rows("SELECT * FROM requirements WHERE workspace_id = ?", (workspace_id,))
        conflicts = self.db.rows("SELECT * FROM conflicts WHERE workspace_id = ?", (workspace_id,))
        checkpoints = self.db.rows("SELECT * FROM checkpoints WHERE workspace_id = ?", (workspace_id,))
        status = self.readiness(snapshot, conflicts, checkpoints)["status"]
        self.db.execute("UPDATE shows SET status = ? WHERE workspace_id = ?", (status, workspace_id))

    def _log(self, workspace_id: str, event_type: str, payload: dict[str, Any]) -> None:
        self.db.log(workspace_id, new_id("event"), event_type, payload, utc_now())

