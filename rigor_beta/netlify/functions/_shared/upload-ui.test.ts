import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
function harness() {
  const nodes: Record<string, any> = {};
  for (const id of ["app", "toast", "production-form", "upload-zone", "upload-status", "document-upload"]) nodes[id] = { textContent: "", innerHTML: "", handlers: {}, classList: { add: vi.fn(), remove: vi.fn() }, addEventListener(name: string, fn: any) { this.handlers[name] = fn; } };
  const fetch = vi.fn();
  const context = createContext({ document: { getElementById: (id: string) => nodes[id] || null, querySelectorAll: () => [] }, sessionStorage: { getItem: () => null, setItem: vi.fn() }, setTimeout: vi.fn(), clearTimeout: vi.fn(), fetch, FormData, File, JSON, Date, console });
  const source = readFileSync(new URL("../../../app/static/app.js", import.meta.url), "utf8").replace(/boot\(\);\s*$/, "");
  runInContext(source, context);
  return { nodes, fetch, context };
}
describe("upload UI", () => {
  it("shows a persistent error and restores controls after a timeout response", async () => {
    const h = harness(); h.fetch.mockResolvedValue(new Response(JSON.stringify({ detail: "Request failed (504)" }), { status: 504, headers: { "content-type": "application/json" } }));
    h.context.testEvent = { target: { files: [new File(["Tour"], "tour.txt")], value: "file" } };
    await runInContext("uploadDocument(testEvent)", h.context);
    expect(h.nodes["upload-status"].textContent).toContain("504");
    expect(h.nodes["upload-status"].textContent).toContain("Refresh");
    expect(h.nodes["upload-zone"].classList.remove).toHaveBeenCalledWith("busy");
    expect(h.context.testEvent.target.value).toBe("");
  });
  it("rejects ZIP inputs before sending an upload", async () => {
    const h = harness(); h.context.testEvent = { target: { files: [new File(["Tour"], "tour.zip")] } };
    await runInContext("uploadDocument(testEvent)", h.context);
    expect(h.fetch).not.toHaveBeenCalled(); expect(h.nodes["upload-status"].textContent).toContain("PDF or TXT");
  });
  it("wires drag/drop to the same upload path", () => {
    const h = harness(); runInContext("bindSessionEvents()", h.context);
    const preventDefault = vi.fn();
    h.nodes["upload-zone"].handlers.drop({ preventDefault, dataTransfer: { files: [new File(["Tour"], "tour.zip")] } });
    expect(preventDefault).toHaveBeenCalled(); expect(h.nodes["upload-status"].textContent).toContain("PDF or TXT");
  });
});
