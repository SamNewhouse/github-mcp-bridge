import { z } from "zod";
import { parseEnv } from "./lib/env";
import { logWarn } from "./lib/logging";

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
 * Validates all GITHUB_PAT_* environment variables at startup.
 * Logs a warning for any that are present but empty/whitespace — these
 * would silently fall back to the default PAT at request time, which is
 * likely a misconfiguration.
 *
 * Call this once during server startup after the env has been parsed.
 */
export function validateGithubPats(): void {
  for (const [key, val] of Object.entries(process.env)) {
    if (key.startsWith("GITHUB_PAT_") && (!val || val.trim().length === 0)) {
      logWarn("github_pat_empty", {
        key,
        message:
          `${key} is set but empty — requests for this owner will fall back to GITHUB_PAT`,
      });
    }
  }
}

/**
 * Returns the GitHub PAT to use for a given owner (user or organisation).
 *
 * Resolution order:
 *   1. GITHUB_PAT_<OWNER> — owner-specific PAT. The owner name is uppercased
 *      and hyphens are replaced with underscores to produce a valid env var name.
 *      e.g. owner "SamNewhouse"  → GITHUB_PAT_SAMNEWHOUSE
 *           owner "Kelvast"      → GITHUB_PAT_KELVAST
 *           owner "my-org"       → GITHUB_PAT_MY_ORG
 *   2. GITHUB_PAT — the default fallback PAT used when no owner-specific
 *      variable is set.
 *
 * Add as many GITHUB_PAT_* variables as you need — no other config required.
 */
export function getGithubPatForOwner(owner: string): {
  pat: string;
  key: string;
} {
  const key = `GITHUB_PAT_${owner.toUpperCase().replace(/-/g, "_")}`;
  const pat = process.env[key]?.trim();
  if (pat && pat.length > 0) {
    return { pat, key };
  }
  return { pat: getEnv().GITHUB_PAT, key: "GITHUB_PAT" };
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
