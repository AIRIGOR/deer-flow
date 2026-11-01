import type { getStore } from "@netlify/blobs";
import { normalizeWorkspace, now, type WorkspaceState } from "./model.js";

type Store = ReturnType<typeof getStore>;
const versions = new WeakMap<WorkspaceState, string>();
export class WorkspaceConflictError extends Error {
  constructor(public status = 409) {
    super(status === 428
      ? "Workspace version required. Reload /api/workspace and send its ETag in If-Match."
      : "Workspace changed. Reload /api/workspace and review your changes before submitting again.");
  }
}
export const workspaceETag = (state: WorkspaceState) => versions.get(state);

export async function readWorkspace(store: Store, testerId: string) {
  const entry = await store.getWithMetadata(`workspace/${testerId}`, { type: "json", consistency: "strong" });
  if (!entry) return null;
  if (!entry.etag) throw new WorkspaceConflictError(428);
  const state = normalizeWorkspace(entry.data);
  versions.set(state, entry.etag);
  return state;
}

export function requireWorkspaceVersion(request: Request, state: WorkspaceState) {
  const supplied = request.headers.get("If-Match");
  if (!supplied) throw new WorkspaceConflictError(428);
  if (supplied !== versions.get(state)) throw new WorkspaceConflictError();
}

export async function createWorkspaceRecord(store: Store, state: WorkspaceState) {
  const result = await store.setJSON(`workspace/${state.tester.tester_id}`, state, { onlyIfNew: true });
  if (!result.modified) throw new WorkspaceConflictError();
  if (!result.etag) throw new WorkspaceConflictError(428);
  versions.set(state, result.etag);
}

export async function saveWorkspace(store: Store, state: WorkspaceState) {
  const etag = versions.get(state);
  if (!etag) throw new WorkspaceConflictError(428);
  state.workspace.updated_at = now();
  const result = await store.setJSON(`workspace/${state.tester.tester_id}`, state, { onlyIfMatch: etag });
  if (!result.modified) throw new WorkspaceConflictError();
  if (!result.etag) throw new WorkspaceConflictError(428);
  versions.set(state, result.etag);
}
