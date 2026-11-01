import type { Context } from "@netlify/functions";
import { processUpload } from "./rigor-api.mjs";
import { WorkspaceConflictError } from "./_shared/workspace-store.js";

export default async (request: Request, context: Context) => {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  try {
    await processUpload(request, context);
  } catch (error) {
    if (error instanceof WorkspaceConflictError) {
      return Response.json({ detail: error.message }, { status: error.status });
    }
    throw error;
  }
};
