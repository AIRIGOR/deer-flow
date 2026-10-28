/** Advisory-only document classification. Never substitutes for source review. */
export const DOCUMENT_KINDS = [
  { kind: "TECHNICAL_RIDER", cues: [/technical rider/i, /production rider/i, /touring requirements/i, /artist requirements/i] },
  { kind: "STAGE_PLOT", cues: [/stage plot/i, /stage layout/i, /downstage/i, /upstage/i, /stage dimensions/i] },
  { kind: "AUDIO_INPUT_LIST", cues: [/input list/i, /channel list/i, /patch list/i, /foh console/i, /monitor console/i] },
  { kind: "LIGHTING", cues: [/lighting plot/i, /lighting fixture/i, /dmx universe/i, /lighting console/i, /sacn/i] },
  { kind: "VIDEO", cues: [/video specification/i, /led wall/i, /video transport/i, /video switcher/i, /pixel pitch/i] },
  { kind: "HOSPITALITY", cues: [/hospitality rider/i, /dressing room/i, /catering/i, /crew meal/i, /dietary requirements/i] },
  { kind: "VENUE_TECH", cues: [/venue technical/i, /house power/i, /venue capacity/i, /loading dock/i, /house rigging/i] },
  { kind: "SCHEDULE", cues: [/show schedule/i, /load.in schedule/i, /doors at/i, /curfew/i, /soundcheck/i] },
  { kind: "RIGGING", cues: [/rigging plot/i, /point load/i, /suspended weight/i, /rigging capacity/i, /motor point/i] },
  { kind: "TRUCKING", cues: [/truck manifest/i, /truck schedule/i, /trailer/i, /truck parking/i, /vehicle access/i] },
  { kind: "LABOR", cues: [/labor call/i, /stagehand/i, /crew call/i, /union labor/i, /crew staffing/i] },
  { kind: "ADVANCE", cues: [/technical advance/i, /production advance/i, /advance confirmation/i] },
] as const;

export function suggestDocumentType(name: string, pages: string[]) {
  const text = pages.join(" ").slice(0, 50000).replace(/\s+/g, " ");
  const candidates = DOCUMENT_KINDS.map(({ kind, cues }) => ({
    kind,
    contentSupported: cues.some(cue => cue.test(text)),
    // Filename is helpful but cannot establish the classification alone.
    score: cues.reduce((sum, cue) => sum + (cue.test(text) ? 2 : 0) + (cue.test(name) ? 1 : 0), 0),
  })).filter(candidate => candidate.contentSupported).sort((a, b) => b.score - a.score);
  const first = candidates[0];
  const second = candidates[1];
  if (!first || first.score < 2 || (second && first.score === second.score)) {
    return { suggested_type: "UNKNOWN", classification_status: "NEEDS_REVIEW" };
  }
  return { suggested_type: first.kind, classification_status: "NEEDS_REVIEW" };
}
