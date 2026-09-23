export type DeerFlowRequirement = {
  department?: string;
  category?: string;
  requirement_text?: string;
  normalized_value?: string | null;
  unit?: string | null;
  source_page?: number | null;
  source_excerpt?: string;
  confidence?: number;
};

export type DeerFlowSettings = { url?: string; token?: string };

export class DeerFlowUnavailable extends Error {
  constructor(message: string, public readonly status = 503) { super(message); }
}

function configured(settings: DeerFlowSettings) {
  if (!settings.url?.trim() || !settings.token?.trim()) {
    throw new DeerFlowUnavailable("DeerFlow is not connected. Document analysis is paused until its service URL and token are configured.");
  }
  let url: URL;
  try { url = new URL(settings.url); }
  catch { throw new DeerFlowUnavailable("DeerFlow service URL is invalid."); }
  if (url.protocol !== "https:" || url.username || url.password) throw new DeerFlowUnavailable("DeerFlow requires an HTTPS service URL without embedded credentials.");
  return url.href.replace(/\/$/, "");
}

export async function deerFlowStatus(settings: DeerFlowSettings, fetcher: typeof fetch = fetch) {
  let base: string;
  try { base = configured(settings); }
  catch { return "NOT_CONFIGURED" as const; }
  try {
    const response = await fetcher(`${base}/health`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return "UNAVAILABLE" as const;
    const body = await response.json() as { status?: string };
    return body.status === "healthy" ? "REACHABLE" as const : "UNAVAILABLE" as const;
  } catch { return "UNAVAILABLE" as const; }
}

export async function analyzeWithDeerFlow(
  settings: DeerFlowSettings,
  documentName: string,
  pages: string[],
  fetcher: typeof fetch = fetch,
): Promise<DeerFlowRequirement[]> {
  const base = configured(settings);
  let response: Response;
  try {
    response = await fetcher(`${base}/api/rigor/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-RIGOR-Service-Token": settings.token!.trim() },
      body: JSON.stringify({ document_name: documentName, pages }),
      signal: AbortSignal.timeout(50000),
    });
  } catch {
    throw new DeerFlowUnavailable("DeerFlow could not be reached. The document was not processed; please retry shortly.", 502);
  }
  if (!response.ok) {
    console.warn("DeerFlow analysis response", response.status);
    throw new DeerFlowUnavailable(
      response.status === 401 ? "DeerFlow service credentials do not match. The document was not processed." :
        "DeerFlow analysis is unavailable. The document was not processed; please retry shortly.",
      response.status === 401 ? 503 : 502,
    );
  }
  try {
    const payload = await response.json() as { requirements?: DeerFlowRequirement[] };
    if (Array.isArray(payload.requirements)) return payload.requirements;
  } catch { /* invalid upstream response */ }
  throw new DeerFlowUnavailable("DeerFlow returned an invalid analysis. The document was not processed.", 502);
}
