import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { createRequire } from "node:module";
const pdfParse = createRequire(import.meta.url)("pdf-parse/lib/pdf-parse.js") as (buffer: Buffer) => Promise<{ numpages: number; text: string }>;
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

async function makePdf(content: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage([612, 792]).drawText(content, { x: 48, y: 740, size: 11, font });
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

describe("RIGOR actual PDF packet regression", () => {
  it("parses ten real generated PDF files, detects power contradictions, and stays blocked", async () => {
    const state = activeProduction(createWorkspace("PDF Packet QA", "PM"));
    const seen = new Set<string>();
    for (const [name, content] of packet) {
      const bytes = await makePdf(content);
      expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
      const parsed = await pdfParse(bytes);
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
