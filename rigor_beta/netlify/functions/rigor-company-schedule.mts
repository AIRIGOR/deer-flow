import type { Config } from "@netlify/functions";

export default async (request: Request) => {
  const token = Netlify.env.get("RIGOR_DEERFLOW_TOKEN")?.trim();
  if (!token) {
    console.error("RIGOR company schedule: RIGOR_DEERFLOW_TOKEN missing");
    return;
  }

  const target = new URL(
    "/.netlify/functions/rigor-company-pulse-background",
    request.url,
  );

  const response = await fetch(target, {
    method: "POST",
    headers: {
      "X-RIGOR-Automation-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ source: "scheduled-company-pulse" }),
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    console.error(
      "RIGOR company schedule failed to start background pulse",
      response.status,
      (await response.text()).slice(0, 500),
    );
  }
};

export const config: Config = {
  schedule: "0 15 * * 1-5",
};
