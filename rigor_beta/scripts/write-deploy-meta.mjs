import { mkdir, writeFile } from "node:fs/promises";

const payload = {
  service: "rigor-flow-preview",
  commit: process.env.COMMIT_REF || process.env.HEAD || null,
  branch: process.env.BRANCH || null,
  context: process.env.CONTEXT || null,
  deploy_url: process.env.DEPLOY_URL || null,
  generated_at: new Date().toISOString(),
};

await mkdir(new URL("../app/static/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../app/static/deploy-meta.json", import.meta.url),
  JSON.stringify(payload, null, 2) + "\n",
  "utf8",
);

console.log("RIGOR deploy metadata written", payload);
