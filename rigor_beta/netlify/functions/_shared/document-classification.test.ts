import { describe, expect, it } from "vitest";
import { suggestDocumentType } from "./document-classification.js";

describe("RIGOR document type suggestions", () => {
  it("classifies technical rider content without relying on filename", () => {
    expect(suggestDocumentType("file001.txt", [
      "Touring requirements: This technical rider includes artist requirements.",
    ])).toEqual({ suggested_type: "TECHNICAL_RIDER", classification_status: "NEEDS_REVIEW" });
  });
  it("classifies a venue package by its content", () => {
    expect(suggestDocumentType("unknown.txt", [
      "Venue technical details include house power and house rigging.",
    ]).suggested_type).toBe("VENUE_TECH");
  });
  it("leaves ambiguous and filename-only material for human review", () => {
    expect(suggestDocumentType("video-spec.txt", ["General notes only."]).suggested_type).toBe("UNKNOWN");
    expect(suggestDocumentType("mixed.txt", ["LED wall and crew meal."]).suggested_type).toBe("UNKNOWN");
  });
});
