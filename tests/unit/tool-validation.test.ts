import { describe, expect, test } from "@jest/globals";
import { defineTool } from "../../src/tools/shared";
import { z } from "zod";

describe("defineTool", () => {
  test("rejects non-object args", async () => {
    const tool = defineTool({
      name: "x",
      description: "x",
      input: z.object({}),
      handler: async () => ({ ok: true }),
    });

    await expect(tool.run([] as unknown as Record<string, unknown>)).rejects.toThrow(/object/i);
  });

  test("returns detailed zod errors", async () => {
    const tool = defineTool({
      name: "x",
      description: "x",
      input: z.object({ owner: z.string() }),
      handler: async (input) => input,
    });

    await expect(tool.run({})).rejects.toThrow(/owner/i);
  });
});
