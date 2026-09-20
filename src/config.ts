import { z } from "zod";
import { parseEnv } from "./lib/env";
import { logWarn } from "./lib/logging";

const envSchema = z.object({
  // Default PAT used when no owner-specific PAT is configured.
  GITHUB_PAT: z.string().trim().min(1, "GITHUB_PAT is required"),

  CONNECTOR_SECRET: z.string().trim().min(32, "CONNECTOR_SECRET must be at least 32 characters — generate one with: openssl rand -hex 32"),

  PORT: z.coerce.number().int().positive().default(3000),
});

type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

function getEnv(): Env {
  if (cachedEnv) {
    return cachedEnv;
  }

  cachedEnv = parseEnv(envSchema, {
    label: "application environment",
  });

  return cachedEnv;
}

function getOptionalPositiveIntEnv(key: string, fallback: number): number {
  const raw = process.env[key];

  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    logWarn("invalid_optional_env", {
      key,
      value: raw,
      fallback,
      message: `${key} must be a positive integer; using fallback`,
    });

    return fallback;
  }

  return parsed;
}

export function getGithubPat(): string {
  return getEnv().GITHUB_PAT;
}

export function validateGithubPats(): void {
  for (const [key, val] of Object.entries(process.env)) {
    if (key.startsWith("GITHUB_PAT_") && (!val || val.trim() === "")) {
      logWarn("github_pat_empty", {
        key,
        message: `${key} is set but empty — requests for this owner will fall back to GITHUB_PAT`,
      });
    }
  }
}

export function getGithubPatForOwner(owner: string): {
  pat: string;
  key: string;
} {
  const ownerKey = owner.trim().toUpperCase().replace(/-/g, "_");

  const ownerPatKey = `GITHUB_PAT_${ownerKey}`;
  const ownerPat = process.env[ownerPatKey]?.trim();

  if (ownerPat) {
    return {
      pat: ownerPat,
      key: ownerPatKey,
    };
  }

  return {
    pat: getEnv().GITHUB_PAT,
    key: "GITHUB_PAT",
  };
}

export function getConnectorSecret(): string {
  return getEnv().CONNECTOR_SECRET;
}

export function getConnectorSecrets(): string[] {
  return getEnv()
    .CONNECTOR_SECRET.split(",")
    .map((secret) => secret.trim())
    .filter((secret) => secret.length > 0);
}

export function getPort(): number {
  return getEnv().PORT;
}

export function getMcpSessionIdleTtlMs(): number {
  return getOptionalPositiveIntEnv("MCP_SESSION_IDLE_TTL_MS", 5 * 60 * 1000);
}

export function getMcpSessionMaxTtlMs(): number {
  return getOptionalPositiveIntEnv("MCP_SESSION_MAX_TTL_MS", 60 * 60 * 1000);
}
