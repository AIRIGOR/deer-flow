import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
const pdfParse = createRequire(import.meta.url)("pdf-parse/lib/pdf-parse.js") as (buffer: Buffer, options?: { version: string }) => Promise<{ numpages: number; text: string }>;
import { activeProduction, createWorkspace, extractRequirements, readiness, rebuildConflicts } from "./model.js";
import { suggestDocumentType } from "./document-classification.js";

const packet = [
  ["tour-rider.pdf", "Technical rider. Show power must provide 400A service."],
  ["venue-spec.pdf", "Venue technical: Show power must provide 200A service."],
  ["stage-plot.pdf", "Stage plot: downstage left and upstage right."],
  ["audio-inputs.pdf", "Input list: 24 channels and FOH console."],
  ["lighting.pdf", "Lighting plot: DMX universe 1."],
  ["video.pdf", "Video specification: LED wall pixel pitch."],
  ["hospitality.pdf", "Hospitality rider: catering and dressing room."],
  ["schedule.pdf", "Show schedule: soundcheck and doors at 19:00."],
  ["rigging.pdf", "Rigging plot: point load 1000 lbs."],
  ["trucking.pdf", "Truck manifest: trailer and truck parking."],
] as const;

function makePdf(content: string) {
  // A valid, uncompressed PDF 1.4 with explicit cross-reference offsets.
  const escaped = content.replace(/[\\\\()]/g, (char) => "\\\\" + char);
  const stream = `BT /F1 12 Tf 40 700 Td (${escaped}) Tj ET\n`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
  ];
  let source = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const [index, body] of objects.entries()) {
    offsets.push(Buffer.byteLength(source));
    source += `${index + 1} 0 obj\n${body}\nendobj\n`;
  }
  const xref = Buffer.byteLength(source);
  source += "xref\n0 6\n0000000000 65535 f \n";
  for (const offset of offsets) source += `${String(offset).padStart(10, "0")} 00000 n \n`;
  source += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new TextEncoder().encode(source);
  return Buffer.from(bytes.buffer);
}

describe("RIGOR actual PDF packet regression", () => {
  it("parses ten real generated PDF files, detects power contradictions, and stays blocked", async () => {
    const state = activeProduction(createWorkspace("PDF Packet QA", "PM"));
    const seen = new Set<string>();
    for (const [name, content] of packet) {
      const bytes = await makePdf(content);
      expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
      const parsed = await pdfParse(bytes, { version: "v2.0.550" });
      expect(parsed.numpages).toBe(1);
      expect(parsed.text).toContain(content);
      const suggested = suggestDocumentType(name, [parsed.text]);
      expect(suggested.classification_status).toBe("NEEDS_REVIEW");
      seen.add(suggested.suggested_type);
      state.documents.push({ name, doc_type: "UPLOADED", status: "PROCESSED", review_status: "PENDING", page_count: parsed.numpages });
      extractRequirements(state, name, [parsed.text]);
    }
    rebuildConflicts(state);
    expect(state.documents).toHaveLength(10);
    expect(seen).toContain("HOSPITALITY");
    expect(seen).toContain("RIGGING");
    expect(state.conflicts.some(item => item.category === "POWER_CAPACITY")).toBe(true);
    expect(readiness(state).status).toBe("BLOCKED");
    expect(readiness(state).unreviewed_documents).toBe(10);
  });
});
