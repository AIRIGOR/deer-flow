export const DEPARTMENTS = [
  "Audio", "Backline", "Communications", "Hospitality", "Labor", "Lighting", "Medical",
  "Merchandise", "Power", "Production", "Rigging", "Security", "Stage Management", "Video",
] as const;

export const DOCUMENTS = [
  { name: "Tour Technical Rider · Rev 7", doc_type: "TOUR_RIDER", page_count: 42 },
  { name: "Desert Crown Arena · Production Manual", doc_type: "VENUE_TECH_PACK", page_count: 31 },
  { name: "Vendor Power & Rigging Confirmation", doc_type: "VENDOR_CONFIRMATION", page_count: 8 },
];

export const REQUIREMENTS = [
  ["Power", "Show service", "Provide isolated 400A 3-phase show power at stage right.", "NEEDS_CONFIRMATION", 0, 18, "Venue shall provide one isolated 400A, 3-phase service at stage right."],
  ["Power", "Venue capacity", "Venue house service is rated for 200A 3-phase at stage right.", "EXTRACTED", 1, 13, "Stage-right company switch: 200A, 120/208V, 3-phase."],
  ["Rigging", "Downstage trim", "Tour design requires 42 ft downstage trim.", "NEEDS_CONFIRMATION", 0, 22, "Minimum downstage truss trim: 42'-0\"."],
  ["Rigging", "Venue trim limit", "Venue steel geometry limits downstage trim to 38 ft.", "EXTRACTED", 1, 21, "Maximum available trim at DS centerline is 38'-0\"."],
  ["Video", "FOH data path", "Tour requires four tactical fiber paths from FOH to stage.", "NEEDS_CONFIRMATION", 0, 27, "Provide (4) tactical fiber paths, FOH to stage video world."],
  ["Video", "House data path", "Venue lists copper-only tie lines between FOH and stage.", "EXTRACTED", 1, 9, "FOH panels contain shielded Cat6 copper tie lines only."],
  ["Backline", "Drum riser", "Tour requests an 8 ft × 8 ft rolling drum riser.", "NEEDS_CONFIRMATION", 0, 35, "One 8' × 8' rolling drum riser, 24 inches high."],
  ["Backline", "Vendor riser", "Local vendor confirmed a 6 ft × 8 ft riser.", "EXTRACTED", 2, 5, "Available rolling riser: 6' × 8' × 24\"."],
  ["Audio", "Console footprint", "FOH audio position requires 12 ft × 8 ft clear footprint.", "EXTRACTED", 0, 12, "Reserve a clear 12' × 8' footprint for FOH audio."],
  ["Lighting", "Network universe count", "Lighting control must pass 32 sACN universes.", "EXTRACTED", 0, 20, "Network shall pass a minimum of thirty-two sACN universes."],
  ["Lighting", "Followspots", "Two house followspots with operators are venue-provided.", "EXTRACTED", 1, 16, "Two Robert Juliat followspots and operators are available."],
  ["Stage Management", "Dock access", "Dock access opens at 07:00; no early truck staging onsite.", "EXTRACTED", 1, 4, "Production dock opens at 0700. Early staging is offsite."],
  ["Security", "Barricade", "Venue provides 120 linear ft of bike rack barricade.", "EXTRACTED", 1, 25, "Inventory: 120 linear feet of bike rack barricade."],
  ["Hospitality", "Crew meal", "Hot crew dinner for 58 is due before doors.", "EXTRACTED", 0, 39, "Provide hot dinner for 58 crew no later than 17:00."],
  ["Communications", "Radio channels", "Ten production radios across four isolated channels.", "EXTRACTED", 0, 31, "Ten production radios; four isolated channels required."],
  ["Labor", "Load-in crew", "Thirty-six hands called for 08:00 load-in.", "EXTRACTED", 2, 2, "Confirmed: 36 stagehands at 0800."],
  ["Merchandise", "Seller count", "Venue provides six sellers and two stands.", "EXTRACTED", 1, 28, "Two merchandise locations; six sellers included."],
  ["Medical", "Show coverage", "One ALS unit onsite from doors through clear.", "EXTRACTED", 1, 29, "ALS coverage begins at doors and remains until audience clear."],
] as const;

export const CONFLICTS = [
  ["Power", "Show power capacity", "CRITICAL", "Tour: 400A 3-phase", "Venue: 200A 3-phase", "Tour Rider · p18", "Venue Manual · p13"],
  ["Rigging", "Downstage trim height", "CRITICAL", "Tour: 42 ft minimum", "Venue: 38 ft maximum", "Tour Rider · p22", "Venue Manual · p21"],
  ["Video", "FOH signal transport", "HIGH", "Tour: 4 tactical fiber paths", "Venue: Cat6 copper only", "Tour Rider · p27", "Venue Manual · p9"],
  ["Backline", "Drum riser footprint", "HIGH", "Tour: 8 ft × 8 ft", "Vendor: 6 ft × 8 ft", "Tour Rider · p35", "Vendor Confirmation · p5"],
] as const;

export const CHECKPOINTS = [
  ["Dock open and truck order confirmed", "Stage Management"],
  ["Rigging steel inspected and points released", "Rigging"],
  ["Show power energized and phase tested", "Power"],
  ["Video signal path verified FOH to stage", "Video"],
  ["Audio line check complete", "Audio"],
  ["Lighting network and house lights verified", "Lighting"],
  ["Backline risers locked and marked", "Backline"],
  ["Doors readiness walk completed", "Production"],
] as const;

export const KEYWORDS: Record<string, string[]> = {
  Audio: ["audio", "console", "speaker", "microphone", "spl", "pa "],
  Backline: ["backline", "drum", "guitar", "riser", "keyboard"],
  Communications: ["radio", "comms", "intercom", "channel"],
  Hospitality: ["meal", "catering", "hospitality", "dressing room"],
  Labor: ["labor", "stagehand", "crew call", "steward"],
  Lighting: ["lighting", "fixture", "sacn", "dmx", "followspot"],
  Power: ["power", "amp", "voltage", "phase", "disconnect"],
  Rigging: ["rigging", "rig point", "trim", "load", "steel", "hoist"],
  Security: ["security", "barricade", "credential"],
  "Stage Management": ["load-in", "dock", "curfew", "doors"],
  Video: ["video", "led", "fiber", "camera", "projection", "screen"],
};
