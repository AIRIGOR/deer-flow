import { timingSafeEqual } from "node:crypto";
import { getDeployStore, getStore } from "@netlify/blobs";
import type { Context } from "@netlify/functions";
export function commandStore(context: Context) {
  return context.deploy.context === "production" ? getStore({ name: "rigor-company-proof", consistency: "strong" }) : getDeployStore("rigor-company-proof");
}
export function authorized(request: Request) {
  const expected = Buffer.from(Netlify.env.get("RIGOR_COMPANY_ADMIN_TOKEN")?.trim() || "");
  const supplied = Buffer.from(request.headers.get("x-rigor-company-token")?.trim() || "");
  return expected.length > 0 && expected.length === supplied.length && timingSafeEqual(expected, supplied);
}
export function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
