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
  it("uploads multiple selected documents sequentially", async () => {
    const h = harness();
    h.fetch.mockImplementation(async () => Response.json({ workspace: {} }));
    runInContext("renderWorkspace = () => {}", h.context);
    h.context.testEvent = { target: { files: [
      new File(["Power 400A"], "tour.txt"),
      new File(["Power 200A"], "venue.txt"),
    ], value: "selected" } };
    await runInContext("uploadDocument(testEvent)", h.context);
    expect(h.fetch).toHaveBeenCalledTimes(2);
    expect(h.fetch.mock.calls.map(call => call[1].body.get("file").name)).toEqual(["tour.txt", "venue.txt"]);
    expect(h.nodes["upload-status"].textContent).toContain("2 documents saved");
    expect(h.context.testEvent.target.value).toBe("");
  });
  it("stops a batch on an unconfirmed save and reports the partial count", async () => {
    const h = harness();
    h.fetch.mockResolvedValueOnce(Response.json({ workspace: {} }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: "Temporary failure" }), {
        status: 503, headers: { "content-type": "application/json" },
      }));
    runInContext("renderWorkspace = () => {}", h.context);
    h.context.testEvent = { target: { files: [
      new File(["Power 400A"], "tour.txt"),
      new File(["Power 200A"], "venue.txt"),
    ], value: "selected" } };
    await runInContext("uploadDocument(testEvent)", h.context);
    expect(h.fetch).toHaveBeenCalledTimes(2);
    expect(h.nodes["upload-status"].textContent).toContain("1 of 2 saved");
    expect(h.nodes["upload-status"].textContent).toContain("Refresh");
  });
  it("wires drag/drop to the same upload path", () => {
    const h = harness(); runInContext("bindSessionEvents()", h.context);
    const preventDefault = vi.fn();
    h.nodes["upload-zone"].handlers.drop({ preventDefault, dataTransfer: { files: [new File(["Tour"], "tour.zip")] } });
    expect(preventDefault).toHaveBeenCalled(); expect(h.nodes["upload-status"].textContent).toContain("PDF or TXT");
  });
});
