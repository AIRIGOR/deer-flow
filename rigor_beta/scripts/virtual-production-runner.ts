import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createProduction, departmentSummary, extractRequirements,
  newId, now, progress, readiness
} from "../netlify/functions/_shared/model.ts";

const outDir = join(process.cwd(), ".artifacts", "virtual-production");
const show = {
  show_name: "RIGOR Virtual Production 001",
  artist: "Neon Horizon World Tour",
  venue: "Desert Crown Arena",
  city: "Las Vegas, NV",
  show_date: "2026-10-24",
};
const production = createProduction("workspace_virtual_ai_employee", show, 1);

const packet = [
  ["Neon Horizon Tour Technical Rider.pdf","TOUR_RIDER",[
    "Tour power requires isolated 400A 3-phase show power service at stage right.",
    "Tour rigging requires minimum downstage trim of 42 ft.",
    "Video must provide four tactical fiber paths from FOH to stage video world.",
    "Backline requires one 8 ft x 8 ft rolling drum riser, 24 inches high.",
    "FOH audio console position requires a clear 12 ft x 8 ft footprint.",
    "Lighting network must pass a minimum of 32 sACN universes.",
    "Hospitality must provide hot crew dinner for 58 crew no later than 17:00.",
    "Communications requires 10 production radios across four isolated channels.",
    "Load-in requires 36 stagehands at 08:00."
  ]],
  ["Desert Crown Arena Production Manual.pdf","VENUE_TECH_PACK",[
    "Venue power service is limited to 200A at stage right.",
    "Maximum available downstage trim is 38 ft.",
    "Video FOH panels provide shielded Cat6 copper tie lines only between FOH and stage.",
    "Production dock access opens at 07:00 and early truck staging is offsite.",
    "Lighting venue must provide two house followspots with operators.",
    "Security venue provides 120 linear ft of bike rack barricade."
  ]],
  ["Local Vendor Confirmation.pdf","VENDOR_CONFIRMATION",[
    "Backline available rolling riser is 6 ft x 8 ft x 24 inches.",
    "Labor vendor confirms 36 stagehands at 08:00."
  ]]
] as const;

function evt(type: string, payload: Record<string, unknown>) {
  production.events.push({ event_id: newId("event"), type, created_at: now(), payload });
}
function owner(dept: string) {
  const m: Record<string,string> = {
    Audio:"FOH Audio Lead", Backline:"Backline Lead", Communications:"Comms Lead",
    Hospitality:"Tour Coordinator", Labor:"Production Manager", Lighting:"Lighting Director",
    Power:"Production Electrician", Production:"Production Manager", Rigging:"Head Rigger",
    Security:"Venue Security Manager", "Stage Management":"Stage Manager", Video:"Video Lead"
  };
  return m[dept] || "Production Manager";
}
function decide(category: string) {
  const m: Record<string,[string,string]> = {
    POWER_CAPACITY:["Production Electrician","Venue 200A service is insufficient. Supply a temporary 400A 3-phase generator/distro package with licensed electrician; retain house service as backup only."],
    RIGGING_TRIM:["Head Rigger","Revise tour trim from 42 ft to venue maximum 38 ft. Head Rigger and Lighting Director approve revised trim and cue implications before load-in."],
    VIDEO_TRANSPORT:["Video Lead","Do not use house Cat6 as primary show transport. Video vendor supplies four tactical fiber paths plus one spare; Cat6 remains utility-only."],
    BACKLINE_RISER:["Backline Lead","Reject 6 x 8 riser. Vendor adds compatible deck sections to deliver required 8 x 8 rolling riser at 24 inches high."]
  };
  return m[category] || ["Production Manager","Production Manager reviewed both sources and recorded the accepted operational value."];
}

for (const [name, docType, pages] of packet) {
  production.documents.push({
    document_id:newId("doc"), production_id:production.production.production_id,
    workspace_id:production.production.workspace_id, name, doc_type:docType,
    status:"PROCESSED", page_count:pages.length, source_kind:"VIRTUAL_PRODUCTION",
    analysis_engine:"STRUCTURED_EXTRACTION_V1", created_at:now()
  });
  const extracted = extractRequirements(production, name, [...pages]);
  evt("DOCUMENT_PROCESSED",{document:name,requirements_added:extracted.length});
}

const planted = new Set(["POWER_CAPACITY","RIGGING_TRIM","VIDEO_TRANSPORT","BACKLINE_RISER"]);
const detectedBefore = production.conflicts.map(c => ({
  conflict_id:c.conflict_id, department:c.department, category:c.category,
  severity:c.severity, left_value:c.left_value, right_value:c.right_value,
  left_source:c.left_source, right_source:c.right_source
}));

for (const r of production.requirements) {
  r.status = "CONFIRMED";
  r.owner = owner(r.department);
  evt("AI_REQUIREMENT_CONFIRMED",{requirement_id:r.requirement_id,department:r.department,owner:r.owner});
}
for (const c of production.conflicts) {
  const [who,resolution] = decide(c.category);
  c.status="RESOLVED"; c.owner=who; c.resolution=resolution; c.resolved_at=now();
  evt("AI_CONFLICT_RESOLVED",{conflict_id:c.conflict_id,category:c.category,owner:who,resolution});
}

const preShow = readiness(production);
for (const cp of production.checkpoints) {
  cp.status="COMPLETE"; cp.completed_at=now();
  evt("CHECKPOINT_COMPLETED",{checkpoint_id:cp.checkpoint_id,label:cp.label,department:cp.department});
  if (cp.department === "Video") {
    production.incidents.push({
      incident_id:newId("incident"), production_id:production.production.production_id,
      workspace_id:production.production.workspace_id, department:"Video", severity:"MEDIUM",
      summary:"Fiber path B failed continuity during FOH-to-stage verification.",
      resolution:"Rerouted path B to spare tactical fiber. Continuity passed on retest; 11-minute impact with no doors delay.",
      created_at:now()
    });
    evt("INCIDENT_LOGGED",{department:"Video",severity:"MEDIUM",resolved:true});
  }
}

const finalProgress = progress(production);
const finalReadiness = readiness(production);
production.show.status = finalReadiness.status;
const departments = departmentSummary(production);
const detectedSet = new Set(detectedBefore.map(c=>c.category));
const missed = [...planted].filter(x=>!detectedSet.has(x));
const unexpected = [...detectedSet].filter(x=>!planted.has(x));

const findings = [
  {severity:missed.length?"CRITICAL":"PASS",finding:missed.length?"Missed expected conflicts: "+missed.join(", "):"All four intentionally planted cross-document conflicts were detected."},
  {severity:unexpected.length?"REVIEW":"PASS",finding:unexpected.length?"Additional conflicts detected: "+unexpected.join(", "):"No unintended conflict categories were generated."},
  {severity:"PRODUCT_GAP",finding:"Session 1 can complete after six reviews even when more requirements remain. Production gate should require all decision-relevant items or explicit defer/waiver."},
  {severity:"PRODUCT_GAP",finding:"Resolved show-day incidents do not affect readiness. Incident severity and closure should feed the readiness model."},
  {severity:"PRODUCT_GAP",finding:"Current live PDF omits checkpoints, incidents, decision chronology, assumptions, and AI actions; Master Advance Report should include them."}
];

const report = {
  run:{run_id:newId("virtual_run"),generated_at:now(),ai_employee:{name:"RIGOR OPS-1",role:"Autonomous Production Advance Coordinator"},engine:"STRUCTURED_EXTRACTION_V1"},
  show:production.show, source_documents:production.documents,
  summary:{
    requirements_extracted:production.requirements.length,
    conflicts_detected:detectedBefore.length,
    conflicts_resolved:production.conflicts.filter(c=>c.status==="RESOLVED").length,
    checkpoints_completed:production.checkpoints.filter(c=>c.status==="COMPLETE").length,
    incidents_logged:production.incidents.length,
    pre_show_readiness:preShow, final_readiness:finalReadiness, workflow_progress:finalProgress
  },
  departments, conflicts:production.conflicts, requirements:production.requirements,
  checkpoints:production.checkpoints, incidents:production.incidents, findings,
  event_log:production.events
};

const md: string[] = [
  "# RIGOR Virtual Production 001 - Master Run Report","",
  "**AI employee:** RIGOR OPS-1 - Autonomous Production Advance Coordinator",
  "**Show:** "+show.artist+" / "+show.venue+" / "+show.city+" / "+show.show_date,
  "**Engine:** STRUCTURED_EXTRACTION_V1","",
  "## Executive result","",
  "- Final status: **"+finalReadiness.status+"**",
  "- Final readiness: **"+finalReadiness.score+"%**",
  "- Requirements: **"+production.requirements.length+" extracted / "+finalReadiness.confirmed_requirements+" confirmed**",
  "- Conflicts: **"+detectedBefore.length+" detected / "+production.conflicts.filter(c=>c.status==="RESOLVED").length+" resolved**",
  "- Checkpoints: **"+production.checkpoints.filter(c=>c.status==="COMPLETE").length+"/"+production.checkpoints.length+" complete**",
  "- Incidents: **"+production.incidents.length+" logged / "+production.incidents.filter(i=>i.resolution).length+" resolved**","",
  "## Conflict decisions",""
];
for (const c of production.conflicts) {
  md.push("### "+c.department+" - "+c.category,
    "- Severity: **"+c.severity+"**",
    "- Conflict: "+c.left_value+" vs "+c.right_value,
    "- Sources: "+c.left_source+" / "+c.right_source,
    "- Owner: **"+c.owner+"**",
    "- Resolution: "+c.resolution,"");
}
md.push("## Department readiness","");
for (const d of departments) md.push("- **"+d.department+":** "+d.status+" - "+d.ready+"/"+d.total+" ready, "+d.open_conflicts+" open conflicts");
md.push("","## Show-day checkpoint log","");
for (const cp of production.checkpoints) md.push("- COMPLETE - **"+cp.department+":** "+cp.label);
md.push("","## Incident log","");
for (const i of production.incidents) md.push("### "+i.severity+" - "+i.department,"- Event: "+i.summary,"- Resolution: "+i.resolution,"");
md.push("## RIGOR evaluation findings","");
for (const f of findings) md.push("- **"+f.severity+":** "+f.finding);
md.push("","## Confirmed requirements & provenance","");
for (const r of production.requirements) md.push("- **"+r.department+" / "+r.category+":** "+r.detail+" - Owner: "+r.owner+" - Source: "+r.document_name+" p"+r.page_number+" - Confidence: "+Math.round((r.confidence||0)*100)+"%");
md.push("","## Audit trail","","Total recorded events: **"+production.events.length+"**. Full event data is included in `virtual-production-run.json`.");

await mkdir(outDir,{recursive:true});
await writeFile(join(outDir,"virtual-production-run.json"),JSON.stringify(report,null,2),"utf-8");
await writeFile(join(outDir,"RIGOR-Virtual-Production-001-Master-Run-Report.md"),md.join("\n"),"utf-8");

console.log(JSON.stringify({
  run_id:report.run.run_id, final_status:finalReadiness.status, readiness:finalReadiness.score,
  requirements:production.requirements.length, conflicts_detected:detectedBefore.length,
  conflicts_resolved:production.conflicts.filter(c=>c.status==="RESOLVED").length,
  checkpoints:production.checkpoints.filter(c=>c.status==="COMPLETE").length+"/"+production.checkpoints.length,
  incidents:production.incidents.length, expected_conflicts_missed:missed, unexpected_conflicts:unexpected,
  artifacts:outDir
},null,2));
