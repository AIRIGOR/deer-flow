from __future__ import annotations

from typing import Any


DOCUMENTS: list[dict[str, Any]] = [
    {"name": "Tour Technical Rider · Rev 7", "doc_type": "TOUR_RIDER", "page_count": 42},
    {"name": "Desert Crown Arena · Production Manual", "doc_type": "VENUE_TECH_PACK", "page_count": 31},
    {"name": "Vendor Power & Rigging Confirmation", "doc_type": "VENDOR_CONFIRMATION", "page_count": 8},
]

REQUIREMENTS: list[dict[str, Any]] = [
    {"department": "Power", "title": "Show service", "detail": "Provide isolated 400A 3-phase show power at stage right.", "status": "NEEDS_CONFIRMATION", "document_name": DOCUMENTS[0]["name"], "page_number": 18, "excerpt": "Venue shall provide one isolated 400A, 3-phase service at stage right."},
    {"department": "Power", "title": "Venue capacity", "detail": "Venue house service is rated for 200A 3-phase at stage right.", "status": "EXTRACTED", "document_name": DOCUMENTS[1]["name"], "page_number": 13, "excerpt": "Stage-right company switch: 200A, 120/208V, 3-phase."},
    {"department": "Rigging", "title": "Downstage trim", "detail": "Tour design requires 42 ft downstage trim.", "status": "NEEDS_CONFIRMATION", "document_name": DOCUMENTS[0]["name"], "page_number": 22, "excerpt": "Minimum downstage truss trim: 42'-0\"."},
    {"department": "Rigging", "title": "Venue trim limit", "detail": "Venue steel geometry limits downstage trim to 38 ft.", "status": "EXTRACTED", "document_name": DOCUMENTS[1]["name"], "page_number": 21, "excerpt": "Maximum available trim at DS centerline is 38'-0\"."},
    {"department": "Video", "title": "FOH data path", "detail": "Tour requires four tactical fiber paths from FOH to stage.", "status": "NEEDS_CONFIRMATION", "document_name": DOCUMENTS[0]["name"], "page_number": 27, "excerpt": "Provide (4) tactical fiber paths, FOH to stage video world."},
    {"department": "Video", "title": "House data path", "detail": "Venue lists copper-only tie lines between FOH and stage.", "status": "EXTRACTED", "document_name": DOCUMENTS[1]["name"], "page_number": 9, "excerpt": "FOH panels contain shielded Cat6 copper tie lines only."},
    {"department": "Backline", "title": "Drum riser", "detail": "Tour requests an 8 ft × 8 ft rolling drum riser.", "status": "NEEDS_CONFIRMATION", "document_name": DOCUMENTS[0]["name"], "page_number": 35, "excerpt": "One 8' × 8' rolling drum riser, 24 inches high."},
    {"department": "Backline", "title": "Vendor riser", "detail": "Local vendor confirmed a 6 ft × 8 ft riser.", "status": "EXTRACTED", "document_name": DOCUMENTS[2]["name"], "page_number": 5, "excerpt": "Available rolling riser: 6' × 8' × 24\"."},
    {"department": "Audio", "title": "Console footprint", "detail": "FOH audio position requires 12 ft × 8 ft clear footprint.", "status": "EXTRACTED", "document_name": DOCUMENTS[0]["name"], "page_number": 12, "excerpt": "Reserve a clear 12' × 8' footprint for FOH audio."},
    {"department": "Lighting", "title": "Network universe count", "detail": "Lighting control must pass 32 sACN universes.", "status": "EXTRACTED", "document_name": DOCUMENTS[0]["name"], "page_number": 20, "excerpt": "Network shall pass a minimum of thirty-two sACN universes."},
    {"department": "Lighting", "title": "Followspots", "detail": "Two house followspots with operators are venue-provided.", "status": "EXTRACTED", "document_name": DOCUMENTS[1]["name"], "page_number": 16, "excerpt": "Two Robert Juliat followspots and operators are available."},
    {"department": "Stage Management", "title": "Dock access", "detail": "Dock access opens at 07:00; no early truck staging onsite.", "status": "EXTRACTED", "document_name": DOCUMENTS[1]["name"], "page_number": 4, "excerpt": "Production dock opens at 0700. Early staging is offsite."},
    {"department": "Security", "title": "Barricade", "detail": "Venue provides 120 linear ft of bike rack barricade.", "status": "EXTRACTED", "document_name": DOCUMENTS[1]["name"], "page_number": 25, "excerpt": "Inventory: 120 linear feet of bike rack barricade."},
    {"department": "Hospitality", "title": "Crew meal", "detail": "Hot crew dinner for 58 is due before doors.", "status": "EXTRACTED", "document_name": DOCUMENTS[0]["name"], "page_number": 39, "excerpt": "Provide hot dinner for 58 crew no later than 17:00."},
    {"department": "Communications", "title": "Radio channels", "detail": "Ten production radios across four isolated channels.", "status": "EXTRACTED", "document_name": DOCUMENTS[0]["name"], "page_number": 31, "excerpt": "Ten production radios; four isolated channels required."},
    {"department": "Labor", "title": "Load-in crew", "detail": "Thirty-six hands called for 08:00 load-in.", "status": "EXTRACTED", "document_name": DOCUMENTS[2]["name"], "page_number": 2, "excerpt": "Confirmed: 36 stagehands at 0800."},
    {"department": "Merchandise", "title": "Seller count", "detail": "Venue provides six sellers and two stands.", "status": "EXTRACTED", "document_name": DOCUMENTS[1]["name"], "page_number": 28, "excerpt": "Two merchandise locations; six sellers included."},
    {"department": "Medical", "title": "Show coverage", "detail": "One ALS unit onsite from doors through clear.", "status": "EXTRACTED", "document_name": DOCUMENTS[1]["name"], "page_number": 29, "excerpt": "ALS coverage begins at doors and remains until audience clear."},
]

CONFLICTS: list[dict[str, Any]] = [
    {"department": "Power", "title": "Show power capacity", "severity": "CRITICAL", "left_value": "Tour: 400A 3-phase", "right_value": "Venue: 200A 3-phase", "left_source": "Tour Rider · p18", "right_source": "Venue Manual · p13"},
    {"department": "Rigging", "title": "Downstage trim height", "severity": "CRITICAL", "left_value": "Tour: 42 ft minimum", "right_value": "Venue: 38 ft maximum", "left_source": "Tour Rider · p22", "right_source": "Venue Manual · p21"},
    {"department": "Video", "title": "FOH signal transport", "severity": "HIGH", "left_value": "Tour: 4 tactical fiber paths", "right_value": "Venue: Cat6 copper only", "left_source": "Tour Rider · p27", "right_source": "Venue Manual · p9"},
    {"department": "Backline", "title": "Drum riser footprint", "severity": "HIGH", "left_value": "Tour: 8 ft × 8 ft", "right_value": "Vendor: 6 ft × 8 ft", "left_source": "Tour Rider · p35", "right_source": "Vendor Confirmation · p5"},
]

CHECKPOINTS: list[dict[str, str]] = [
    {"label": "Dock open and truck order confirmed", "department": "Stage Management"},
    {"label": "Rigging steel inspected and points released", "department": "Rigging"},
    {"label": "Show power energized and phase tested", "department": "Power"},
    {"label": "Video signal path verified FOH to stage", "department": "Video"},
    {"label": "Audio line check complete", "department": "Audio"},
    {"label": "Lighting network and house lights verified", "department": "Lighting"},
    {"label": "Backline risers locked and marked", "department": "Backline"},
    {"label": "Doors readiness walk completed", "department": "Production"},
]

