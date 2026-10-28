import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { readPdfPages } from "./pdf-text.js";
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
  pdf.addPage([612, 792]).drawText(content, { x: 40, y: 700, size: 12, font });
  return (await pdf.save()).buffer as ArrayBuffer;
}

describe("RIGOR actual PDF packet regression", () => {
  it("preserves separate requirement lines and physical page numbers after a blank page", async () => {
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    document.addPage();
    document.addPage().drawText("Show power must provide 400A service\nLabor call requires 12 stagehands", { x: 40, y: 700, size: 12, font, lineHeight: 20 });
    const pages = await readPdfPages((await document.save()).buffer as ArrayBuffer);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toBe("");
    expect(pages[1]).toContain("service\nLabor");
    const state = activeProduction(createWorkspace("Synthetic multiline QA", "PM"));
    const requirements = extractRequirements(state, "advance.pdf", pages);
    expect(requirements).toHaveLength(2);
    expect(requirements.every(item => item.page_number === 2 && item.status === "NEEDS_CONFIRMATION")).toBe(true);
    expect(requirements.map(item => item.category)).toEqual(["POWER_CAPACITY", "LABOR_CALL"]);
  });
  it("parses ten real PDFs, detects power contradictions and stays blocked", async () => {
    const state = activeProduction(createWorkspace("PDF Packet QA", "PM"));
    const seen = new Set<string>();
    for (const [name, content] of packet) {
      const raw = await makePdf(content);
      const bytes = new Uint8Array(raw);
      expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe("%PDF");
      const pages = await readPdfPages(raw);
      expect(pages).toHaveLength(1);
      expect(pages[0]).toContain(content);
      const suggested = suggestDocumentType(name, pages);
      expect(suggested.classification_status).toBe("NEEDS_REVIEW");
      seen.add(suggested.suggested_type);
      state.documents.push({ name, doc_type: "UPLOADED", status: "PROCESSED", review_status: "PENDING", page_count: pages.length });
      extractRequirements(state, name, pages);
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
