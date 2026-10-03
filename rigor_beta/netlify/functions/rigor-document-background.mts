import type { Context } from "@netlify/functions";
import { processUpload } from "./rigor-api.mjs";

export default async (request: Request, context: Context) => {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  await processUpload(request, context);
};
