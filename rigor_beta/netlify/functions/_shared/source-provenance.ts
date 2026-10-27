import { createHash } from "node:crypto";

export type SourceProvenanceV1 = Readonly<{
  schema_version: "rigor.source.v1";
  document_id: string;
  workspace_id: string;
  production_id: string;
  sha256: string;
  byte_length: number;
  capture: "UPLOAD" | "LEGACY_PROCESSING";
}>;

type SourceIdentity = { document_id: string; workspace_id: string; production_id: string };

export function sourceProvenance(identity: SourceIdentity, bytes: ArrayBuffer, capture: SourceProvenanceV1["capture"] = "UPLOAD"): SourceProvenanceV1 {
  return { schema_version: "rigor.source.v1", ...identity,
    sha256: createHash("sha256").update(new Uint8Array(bytes)).digest("hex"), byte_length: bytes.byteLength, capture };
}

export function verifySourceProvenance(value: SourceProvenanceV1 | undefined, identity: SourceIdentity, bytes: ArrayBuffer): SourceProvenanceV1 {
  // Legacy pending jobs can bind their currently saved bytes, but cannot prove original upload integrity.
  if (value === undefined) return sourceProvenance(identity, bytes, "LEGACY_PROCESSING");
  const expected = sourceProvenance(identity, bytes, value.capture);
  if (value.schema_version !== expected.schema_version || !["UPLOAD", "LEGACY_PROCESSING"].includes(value.capture)
    || value.document_id !== expected.document_id || value.workspace_id !== expected.workspace_id
    || value.production_id !== expected.production_id || value.sha256 !== expected.sha256 || value.byte_length !== expected.byte_length) {
    throw new Error("Source identity or saved bytes do not match the upload binding");
  }
  return expected;
}
