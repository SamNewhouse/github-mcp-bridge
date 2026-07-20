import { z } from "zod";

const githubPatSchema = z.string().min(1, "GITHUB_PAT is required");
const connectorSecretSchema = z
  .string()
  .min(1, "CONNECTOR_SECRET is required");
const portSchema = z.coerce.number().int().positive().default(3000);

export function getGithubPat(): string {
  return githubPatSchema.parse(process.env.GITHUB_PAT);
}

export function getConnectorSecret(): string {
  return connectorSecretSchema.parse(process.env.CONNECTOR_SECRET);
}

export function getPort(): number {
  return portSchema.parse(process.env.PORT);
}
