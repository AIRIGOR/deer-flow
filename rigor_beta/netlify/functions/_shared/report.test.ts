import { describe, expect, it } from "vitest";
import pdfParse from "pdf-parse";
import { createProduction, extractRequirements } from "./model.js";
import { reportPdf } from "./report.js";

describe("Advance Report PDF", () => {
  it("includes operational history in Master and isolates the department export", async () => {
    const state = createProduction("workspace_test", {
      show_name: "Production àṣẹ", artist: "Tour", venue: "Test Hall", city: "New York", show_date: "2026-10-24",
    });
    extractRequirements(state, "tour-rider.txt", ["Video must provide four tactical fiber paths from FOH to stage.", "Audio console requires 12 ft x 8 ft at FOH."]);
    extractRequirements(state, "venue-pack.txt", ["Video FOH provides Cat6 copper tie lines only."]);
    state.requirements.forEach((r) => { r.status = "CONFIRMED"; r.owner = `${r.department} Lead`; });
    const conflict = state.conflicts[0];
    conflict.status = "RESOLVED"; conflict.resolution = "Vendor provides four tactical fiber paths plus one spare."; conflict.owner = "Video Lead";
    state.checkpoints.find((c) => c.department === "Video")!.status = "COMPLETE";
    state.incidents.push({ department: "Video", summary: "Fiber path B failed continuity", severity: "MEDIUM", resolution: "Routed to spare fiber", created_at: "2026-10-24T14:00:00Z" });
    state.events.push({ type: "AI_REQUIREMENT_CONFIRMED", created_at: "2026-10-24T09:00:00Z", payload: { department: "Video" } });
    state.events.push({ type: "INCIDENT_LOGGED", created_at: "2026-10-24T14:00:00Z", payload: { department: "Video" } });

    const master = await pdfParse(Buffer.from(await reportPdf(state, null)), { version: "v2.0.550" });
    const video = await pdfParse(Buffer.from(await reportPdf(state, "Video")), { version: "v2.0.550" });
    expect(master.text).toContain("Master Advance Report");
    expect(master.text).toContain("Production àṣẹ");
    expect(master.text).toContain("Audio console");
    expect(master.text).toContain("Fiber path B failed continuity");
    expect(master.text).toContain("Recorded action chronology");
    expect(master.text).toContain("AI_REQUIREMENT_CONFIRMED");
    expect(master.text).toContain("Source: tour-rider.txt / page 1");
    expect(video.text).toContain("Video Department Advance Report");
    expect(video.text).toContain("Routed to spare fiber");
    expect(video.text).toContain("Vendor provides four tactical fiber paths");
    expect(video.text).not.toContain("Audio console");
    expect(video.text).not.toContain("Audio line check");
  });
});
