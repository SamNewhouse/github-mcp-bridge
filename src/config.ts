import { z } from "zod";
import { parseEnv } from "./lib/env";

const envSchema = z.object({
  GITHUB_PAT: z.string().trim().min(1, "GITHUB_PAT is required"),
  CONNECTOR_SECRET: z
    .string()
    .trim()
    .min(
      32,
      "CONNECTOR_SECRET must be at least 32 characters — generate one with: openssl rand -hex 32",
    ),
  PORT: z.coerce.number().int().positive().default(3000),
});

type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

function getEnv(): Env {
  if (cachedEnv) {
    return cachedEnv;
  }

  cachedEnv = parseEnv(envSchema, { label: "application environment" });
  return cachedEnv;
}

export function getGithubPat(): string {
  return getEnv().GITHUB_PAT;
}

/**
 * Returns the GitHub PAT to use for a given owner (user or organisation).
 *
 * Resolution order:
 *   1. GITHUB_PAT_<owner> — owner-specific PAT, keyed exactly by the GitHub
 *      username or org name as passed into every tool call.
 *      e.g. owner "SamNewhouse" → GITHUB_PAT_SamNewhouse
 *           owner "my-org"      → GITHUB_PAT_my-org
 *   2. GITHUB_PAT — the default fallback PAT.
 *
 * Add as many GITHUB_PAT_* variables as you need — no other config required.
 */
export function getGithubPatForOwner(owner: string): string {
  const key = `GITHUB_PAT_${owner}`;
  const pat = process.env[key]?.trim();
  if (pat && pat.length > 0) {
    return pat;
  }
  return getEnv().GITHUB_PAT;
}

export function getConnectorSecret(): string {
  return getEnv().CONNECTOR_SECRET;
}

/**
 * Returns all valid secrets as an array to support zero-downtime rotation.
 * CONNECTOR_SECRET may be a comma-separated list (e.g. "newSecret,oldSecret").
 * Each entry is trimmed and empty entries are discarded.
 */
export function getConnectorSecrets(): string[] {
  return getEnv()
    .CONNECTOR_SECRET.split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function getPort(): number {
  return getEnv().PORT;
}
