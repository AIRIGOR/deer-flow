import type { Context } from "@netlify/functions";

export const STAGING_SITE_ID = "96331e39-86a9-45a3-910c-edd321d60bb7";
export const restrictedStaging = (context: Context) => context.site?.id === STAGING_SITE_ID;
export const stagingSimulationEnabled = (context: Context) => restrictedStaging(context)
  && Netlify.env.get("RIGOR_STAGING_DRY_RUN_ENABLED") === "true";
// Tokens do not establish human authority. No live hosted Founder mode is enabled.
export const hostedFounderBlocked = (context: Context) => context.deploy.context !== "dev";
