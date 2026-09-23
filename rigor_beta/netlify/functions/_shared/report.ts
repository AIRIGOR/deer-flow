import { readFile } from "node:fs/promises";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import { now, readiness, type ProductionState, type RecordMap } from "./model.js";

function safe(value: unknown) {
  return String(value ?? "").replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim();
}

async function fontBytes(filename: string) {
  // Netlify's esbuild bundle moves report.ts into the function entrypoint.
  // included_files keeps the font assets beside that bundle in _shared/fonts.
  const candidates = [new URL(`./fonts/${filename}`, import.meta.url), new URL(`./_shared/fonts/${filename}`, import.meta.url)];
  for (const url of candidates) {
    try { return await readFile(url); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new Error(`RIGOR report font missing: ${filename}`);
}

function scopedEvents(state: ProductionState, department: string | null, requirements: RecordMap[], conflicts: RecordMap[], checkpoints: RecordMap[]) {
  if (!department) return state.events;
  const ids = new Set([...requirements.map((r) => r.requirement_id), ...conflicts.map((c) => c.conflict_id), ...checkpoints.map((c) => c.checkpoint_id)]);
  return state.events.filter((entry) => entry.payload?.department === department ||
    [entry.payload?.requirement_id, entry.payload?.conflict_id, entry.payload?.checkpoint_id].some((id) => ids.has(id)));
}

export async function reportPdf(state: ProductionState, department: string | null) {
  const requirements = department ? state.requirements.filter((r) => r.department === department) : state.requirements;
  const conflicts = department ? state.conflicts.filter((c) => c.department === department) : state.conflicts;
  const checkpoints = department ? state.checkpoints.filter((c) => c.department === department) : state.checkpoints;
  const incidents = department ? state.incidents.filter((i) => i.department === department) : state.incidents;
  const events = scopedEvents(state, department, requirements, conflicts, checkpoints);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(await fontBytes("DejaVuSans.ttf"), { subset: true });
  const bold = await pdf.embedFont(await fontBytes("DejaVuSans-Bold.ttf"), { subset: true });
  let page = pdf.addPage([612, 792]);
  let y = 744;
  const ink = rgb(0.10, 0.16, 0.22);
  const muted = rgb(0.34, 0.40, 0.45);
  const teal = rgb(0.08, 0.39, 0.43);
  const nextPage = () => { page = pdf.addPage([612, 792]); y = 744; };
  const line = (value: unknown, size = 9, strong = false, indent = 0, color = ink) => {
    const font: PDFFont = strong ? bold : regular;
    const maxWidth = 528 - indent;
    const words = safe(value).split(/\s+/);
    let current = "";
    const draw = (text: string) => {
      if (y < 53) nextPage();
      page.drawText(text, { x: 42 + indent, y, size, font, color });
      y -= size + 5;
    };
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) { current = candidate; continue; }
      if (current) draw(current);
      current = word;
      while (font.widthOfTextAtSize(current, size) > maxWidth) {
        let split = current.length - 1;
        while (split > 1 && font.widthOfTextAtSize(current.slice(0, split), size) > maxWidth) split--;
        draw(current.slice(0, split)); current = current.slice(split);
      }
    }
    if (current) draw(current);
  };
  const height = (value: unknown, size: number, font: PDFFont, indent = 0) => {
    const limit = 528 - indent;
    let rows = 1; let current = "";
    for (const word of safe(value).split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > limit && current) { rows++; current = word; }
      else current = candidate;
    }
    return rows * (size + 5);
  };
  const heading = (title: string) => { if (y < 96) nextPage(); y -= 8; line(title, 12, true, 0, teal); y -= 3; };
  const item = (title: string, detail: string, evidence?: string) => {
    const required = height(title, 9, bold) + height(detail, 8, regular, 12) + (evidence ? height(evidence, 7.5, regular, 12) : 0) + 4;
    if (y - required < 53) nextPage();
    line(title, 9, true);
    line(detail, 8, false, 12);
    if (evidence) line(evidence, 7.5, false, 12, muted);
    y -= 4;
  };

  line("RIGOR", 22, true, 0, teal);
  line(department ? `${department} Department Advance Report` : "Master Advance Report", 15, true);
  line(`${state.show.show_name} / ${state.show.artist} / ${state.show.venue} / ${state.show.city} / ${state.show.show_date}`, 9);
  const score = readiness(state, requirements, conflicts);
  line(`Readiness: ${score.status.replaceAll("_", " ")} / ${score.score}%`, 11, true);
  line(`Generated ${now()} / ${requirements.length} requirements / ${conflicts.length} conflicts / ${checkpoints.length} checkpoints / ${incidents.length} incidents`, 8, false, 0, muted);

  heading("Source documents");
  const documents = department ? state.documents.filter((d) => requirements.some((r) => r.document_name === d.name)) : state.documents;
  if (!documents.length) line("No uploaded source documents in this report scope.", 9);
  for (const d of documents) line(`${d.name} / ${d.doc_type || "Document"} / ${d.status || "Status unknown"}`, 8);

  heading("Decisions and next actions");
  const pending = requirements.filter((r) => !["CONFIRMED", "REJECTED", "RESOLVED"].includes(r.status) || (["CONFIRMED", "RESOLVED"].includes(r.status) && !r.owner));
  const open = conflicts.filter((c) => c.status !== "RESOLVED");
  if (!pending.length && !open.length) line("No open requirement decisions or conflicts in this report scope.", 9);
  for (const r of pending) item(`${r.department}: ${r.title}`, `Action: review ${r.status}; assign an owner if accepted.`, `${r.document_name || "Unattributed"} / page ${r.page_number || "unknown"}`);
  for (const c of open) item(`${c.department}: ${c.title} [${c.severity}]`, `Resolve: ${c.left_value} versus ${c.right_value}.`, `${c.left_source || "Unattributed"} / ${c.right_source || "Unattributed"}`);

  heading("Requirements and source evidence");
  if (!requirements.length) line("No requirements in this report scope.", 9);
  for (const r of requirements) item(`${r.department}: ${r.title} [${r.status}]`,
    `${r.detail || ""} Owner: ${r.owner || "Unassigned"}${r.due_at ? `; due ${r.due_at}` : ""}.`,
    `Source: ${r.document_name || "Unattributed"} / page ${r.page_number || "unknown"}${r.excerpt ? ` / ${r.excerpt}` : ""}`);

  heading("Conflicts and operational decisions");
  if (!conflicts.length) line("No conflicts in this report scope.", 9);
  for (const c of conflicts) item(`${c.department}: ${c.title} [${c.severity} / ${c.status}]`,
    `${c.left_value} versus ${c.right_value}. ${c.resolution ? `Decision: ${c.resolution}` : "Decision pending."} Owner: ${c.owner || "Unassigned"}.`,
    `Sources: ${c.left_source || "Unattributed"} / ${c.right_source || "Unattributed"}`);

  heading("Show-day checkpoints");
  if (!checkpoints.length) line("No department checkpoints in this report scope.", 9);
  for (const c of checkpoints) item(`${c.department}: ${c.label} [${c.status}]`, c.completed_at ? `Completed ${c.completed_at}` : "Awaiting verification.");

  heading("Incidents and handoffs");
  if (!incidents.length) line("No incidents recorded in this report scope.", 9);
  for (const i of incidents) item(`${i.department}: ${i.summary} [${i.severity}]`,
    `Resolution / handoff: ${i.resolution || "Open - no resolution recorded"}.`, `Logged ${i.created_at || "time unknown"}`);

  // Keep a short chronology together; longer histories paginate normally.
  if (events.length <= 45 && y - (events.length * 13 + 40) < 53) nextPage();
  heading("Recorded action chronology");
  if (!events.length) line("No scoped actions recorded.", 9);
  for (const e of events) {
    const payload = e.payload || {};
    const target = payload.department || payload.document || payload.requirement_id || payload.conflict_id || payload.checkpoint_id || "";
    line(`${e.created_at || "Time unknown"} / ${e.type} / ${target}`, 8);
  }
  pdf.getPages().forEach((p, index) => p.drawText(`RIGOR / ${department || "Master"} / ${index + 1} of ${pdf.getPageCount()}`, { x: 42, y: 28, size: 7, font: regular, color: muted }));
  return pdf.save({ useObjectStreams: false });
}
