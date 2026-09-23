import { describe, expect, it, vi } from "vitest";
import { analyzeWithDeerFlow, deerFlowStatus, DeerFlowUnavailable } from "./deerflow.js";

const settings = { url: "https://rigor-deerflow.onrender.com", token: "test-secret" };

describe("DeerFlow bridge", () => {
  it("requires a valid service URL and token", async () => {
    await expect(analyzeWithDeerFlow({ url: settings.url }, "plan.txt", ["text"])).rejects.toBeInstanceOf(DeerFlowUnavailable);
    await expect(analyzeWithDeerFlow({ ...settings, url: "http://example.com" }, "plan.txt", ["text"])).rejects.toMatchObject({ status: 503 });
    expect(await deerFlowStatus({ url: settings.url })).toBe("NOT_CONFIGURED");
  });

  it("reports gateway reachability separately from analysis", async () => {
    const healthy = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ status: "healthy" }), { status: 200 }));
    expect(await deerFlowStatus(settings, healthy)).toBe("REACHABLE");
    expect(healthy).toHaveBeenCalledWith(`${settings.url}/health`, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(await deerFlowStatus(settings, vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")))).toBe("UNAVAILABLE");
  });

  it("sends authenticated document text and uses the actual analysis response", async () => {
    const requirements = [{ requirement_text: "Provide 32 A power", source_page: 2 }];
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ requirements }), { status: 200 }));
    expect(await analyzeWithDeerFlow(settings, "rider.txt", ["power"], fetcher)).toEqual(requirements);
    expect(fetcher).toHaveBeenCalledWith(`${settings.url}/api/rigor/analyze`, expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "X-RIGOR-Service-Token": settings.token }),
      body: JSON.stringify({ document_name: "rider.txt", pages: ["power"] }),
    }));
  });

  it.each([401, 502])("fails without fallback on upstream HTTP %i", async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("failed", { status }));
    await expect(analyzeWithDeerFlow(settings, "rider.txt", ["power"], fetcher)).rejects.toMatchObject({ status: status === 401 ? 503 : 502 });
  });

  it("rejects an invalid analysis payload", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ message: "ok" }), { status: 200 }));
    await expect(analyzeWithDeerFlow(settings, "rider.txt", ["power"], fetcher)).rejects.toMatchObject({ status: 502 });
  });
});
