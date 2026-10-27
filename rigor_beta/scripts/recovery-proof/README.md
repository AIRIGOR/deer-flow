# Isolated application recovery proof

Install the locked app dependencies first (`npm ci`). These tests use the real application worker and API code, but synthetic TXT documents, sessions and gateway results. They never call a live LLM or access a customer workspace.

Docker/local durable adapter:

```sh
node scripts/recovery-proof/run.mjs EXISTING_NODE22_OR_NEWER_IMAGE OUTPUT_DIRECTORY
```

The image must already exist; the harness does not pull it. It creates only labeled test containers with networking disabled, mounts the generated bundle read-only and a unique synthetic state directory read/write, verifies the container label before external SIGKILL, and removes only its own containers. Evidence and fixtures remain. Container PID 1 is killed by Docker externally, not a self-signal that may be ignored.

Real isolated Netlify storage with host Node 24 processes:

```sh
node scripts/recovery-proof/run-cloud.mjs STAGING_SITE_ID PATH_TO_EXISTING_NETLIFY_CLI_COMMAND_HELPERS_JS OUTPUT_DIRECTORY
```

This explicitly writes synthetic cloud data and requires authority for isolated staging testing. It loads the existing CLI login through its normal helper, keeps credentials in host memory, uses generated `rigorrec-*` store names, rejects unknown/application store names, and retains cloud test objects for audit. No new token is provisioned, no operational store is read, and no secret is printed or saved. Source/attempt details are private; the application public health API uses an allowlist projection.

Scenarios: kill after the gateway request begins; kill after verified receipt persistence but before the canonical workspace commit; for real-store mode, a concurrent new show edit while a stale worker commit is paused. Resume must not repeat uncertain work or fabricate completion. Explicit authenticated synthetic retry must create one requirement and one completion event while human readiness gates remain required. Concurrent edits and active selection must survive. Private receipt correlation must remain discoverable by attempt/source.

Scope: Docker uses a durable local Blob adapter; cloud mode uses real Netlify conditional writes and fresh host processes. These complement each other, but neither invokes the deployed function, authenticates a real Founder, parses real PDFs, verifies extraction accuracy, provides global ACID or certifies disaster recovery. Never relabel these as complete production operating cycles.
