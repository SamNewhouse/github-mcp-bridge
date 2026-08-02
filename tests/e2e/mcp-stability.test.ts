import "dotenv/config";

import test from "node:test";
import assert from "node:assert/strict";

import {
  getToolList,
  executeTool,
  toolDefinitions,
} from "../../src/tools/index";
import {
  getOrCreateSessionForPrincipal,
  validateSession,
  touchSession,
} from "../../src/lib/session";

const REPEAT_COUNT = 5;
const STRESS_COUNT = 15;
const TEST_PRINCIPAL = "test-principal";
const ALT_TEST_PRINCIPAL = "test-principal-alt";
const TEST_TOOL_NAME = process.env.MCP_TEST_TOOL_NAME || "";
const TEST_TOOL_ARGS = TEST_TOOL_NAME
  ? (JSON.parse(process.env.MCP_TEST_TOOL_ARGS || "{}") as Record<string, unknown>)
  : {};

function logPass(step: string, details: Record<string, unknown> = {}): void {
  const compact = Object.entries(details)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");

  console.log(`PASS ${step}${compact ? ` ${compact}` : ""}`);
}

function getSortedToolNames(): string[] {
  return getToolList()
    .map((tool) => tool.name)
    .sort();
}

function getChosenToolName(): string {
  const tools = getToolList();
  assert.ok(tools.length > 0, "expected discovered tools");
  const chosenToolName = TEST_TOOL_NAME || tools[0]?.name;
  assert.ok(chosenToolName, "expected a tool to call");
  return chosenToolName;
}

function getChosenToolArgs(): Record<string, unknown> {
  return TEST_TOOL_NAME ? TEST_TOOL_ARGS : {};
}

test("tool registry is populated and internally consistent", () => {
  const tools = getToolList();
  assert.ok(tools.length > 0, "expected at least one registered tool");

  const toolNamesFromList = tools.map((tool) => tool.name).sort();
  const toolNamesFromDefinitions = Object.keys(toolDefinitions).sort();

  assert.deepEqual(
    toolNamesFromList,
    toolNamesFromDefinitions,
    "getToolList output should match toolDefinitions keys",
  );

  for (const tool of tools) {
    assert.equal(typeof tool.name, "string");
    assert.ok(tool.name.length > 0, "tool name should be non-empty");
    assert.equal(typeof tool.description, "string");
    assert.ok(
      tool.description.length > 0,
      `tool ${tool.name} should have a description`,
    );
    assert.equal(typeof tool.inputSchema, "object");
    assert.ok(tool.inputSchema, `tool ${tool.name} should have an input schema`);
  }

  logPass("tool_registry_consistent", { toolCount: tools.length });
});

test("tool list stays stable across repeated cycles", () => {
  const toolNameSets: string[][] = [];

  for (let i = 0; i < REPEAT_COUNT; i++) {
    const toolNames = getSortedToolNames();
    assert.ok(toolNames.length > 0, `cycle_${i + 1}: expected at least one tool`);

    toolNameSets.push(toolNames);

    logPass(`cycle_${i + 1}_tools_list`, {
      toolCount: toolNames.length,
    });
  }

  const firstSignature = JSON.stringify(toolNameSets[0]);
  for (const toolNames of toolNameSets) {
    assert.equal(
      JSON.stringify(toolNames),
      firstSignature,
      "tool list changed across cycles",
    );
  }
});

test("session is reused for the same principal across repeated cycles", () => {
  const sessions: string[] = [];

  for (let i = 0; i < REPEAT_COUNT; i++) {
    const sessionId = getOrCreateSessionForPrincipal(TEST_PRINCIPAL);
    assert.ok(sessionId, `cycle_${i + 1}: expected a session id`);

    const isValid = validateSession(sessionId, TEST_PRINCIPAL);
    assert.ok(
      isValid,
      `cycle_${i + 1}: session should be valid immediately after creation`,
    );

    assert.equal(
      touchSession(sessionId),
      true,
      `cycle_${i + 1}: expected touchSession to succeed`,
    );

    sessions.push(sessionId);

    logPass(`cycle_${i + 1}_session_reuse`, { sessionId });
  }

  assert.equal(
    new Set(sessions).size,
    1,
    "expected the same session to be reused for the same principal across cycles",
  );
});

test("different principals receive different sessions", () => {
  const sessionA = getOrCreateSessionForPrincipal(TEST_PRINCIPAL);
  const sessionB = getOrCreateSessionForPrincipal(ALT_TEST_PRINCIPAL);

  assert.ok(sessionA, "expected session for primary principal");
  assert.ok(sessionB, "expected session for alternate principal");
  assert.notEqual(
    sessionA,
    sessionB,
    "different principals should not share the same session",
  );

  assert.equal(validateSession(sessionA, TEST_PRINCIPAL), true);
  assert.equal(validateSession(sessionB, ALT_TEST_PRINCIPAL), true);
  assert.equal(validateSession(sessionA, ALT_TEST_PRINCIPAL), false);
  assert.equal(validateSession(sessionB, TEST_PRINCIPAL), false);

  logPass("session_isolation", { sessionA, sessionB });
});

test("tool list is stable while sessions are created and touched repeatedly", () => {
  const baseline = JSON.stringify(getSortedToolNames());

  for (let i = 0; i < REPEAT_COUNT; i++) {
    const principal = i % 2 === 0 ? TEST_PRINCIPAL : ALT_TEST_PRINCIPAL;
    const sessionId = getOrCreateSessionForPrincipal(principal);

    assert.equal(
      validateSession(sessionId, principal),
      true,
      `cycle_${i + 1}: expected session to validate`,
    );

    assert.equal(
      touchSession(sessionId),
      true,
      `cycle_${i + 1}: expected touchSession to succeed`,
    );

    const current = JSON.stringify(getSortedToolNames());
    assert.equal(
      current,
      baseline,
      "tool list changed while sessions were being reused",
    );

    logPass(`cycle_${i + 1}_tool_list_with_sessions`, {
      principal,
      sessionId,
    });
  }
});

test("tool list is consistent when fetched without any session context", () => {
  const toolSets: string[][] = [];

  for (let i = 0; i < REPEAT_COUNT; i++) {
    const toolNames = getSortedToolNames();

    assert.ok(
      toolNames.length > 0,
      `tools_list_no_session_${i + 1}: expected tools`,
    );

    toolSets.push(toolNames);

    logPass(`tools_list_no_session_${i + 1}`, {
      toolCount: toolNames.length,
    });
  }

  const firstSignature = JSON.stringify(toolSets[0]);
  for (const toolNames of toolSets) {
    assert.equal(
      JSON.stringify(toolNames),
      firstSignature,
      "tool list changed without session context",
    );
  }
});

test("tool call executes successfully with and without an active session", async () => {
  const chosenToolName = getChosenToolName();
  const chosenToolArgs = getChosenToolArgs();

  const sessionId = getOrCreateSessionForPrincipal(TEST_PRINCIPAL);
  assert.ok(validateSession(sessionId, TEST_PRINCIPAL), "session should be valid");

  const withSession = await executeTool(chosenToolName, chosenToolArgs);
  assert.ok(withSession !== undefined, "expected a result from tool call with session");

  logPass("tool_call_with_session", {
    tool: chosenToolName,
    sessionId,
  });

  assert.equal(touchSession(sessionId), true, "expected touchSession to succeed");

  const withoutSession = await executeTool(chosenToolName, chosenToolArgs);
  assert.ok(
    withoutSession !== undefined,
    "expected a result from tool call without session",
  );

  logPass("tool_call_without_session", {
    tool: chosenToolName,
  });
});

test("repeated tool calls do not change tool availability", async () => {
  const chosenToolName = getChosenToolName();
  const chosenToolArgs = getChosenToolArgs();
  const baseline = JSON.stringify(getSortedToolNames());

  for (let i = 0; i < REPEAT_COUNT; i++) {
    const result = await executeTool(chosenToolName, chosenToolArgs);
    assert.ok(result !== undefined, `cycle_${i + 1}: expected tool result`);

    const current = JSON.stringify(getSortedToolNames());
    assert.equal(
      current,
      baseline,
      "tool list changed after repeated tool calls",
    );

    logPass(`cycle_${i + 1}_tool_call_repeat`, {
      tool: chosenToolName,
    });
  }
});

test("mixed session and stateless flows do not affect tool availability", async () => {
  const chosenToolName = getChosenToolName();
  const chosenToolArgs = getChosenToolArgs();
  const baseline = JSON.stringify(getSortedToolNames());

  for (let i = 0; i < REPEAT_COUNT; i++) {
    const principal = i % 2 === 0 ? TEST_PRINCIPAL : ALT_TEST_PRINCIPAL;
    const sessionId = getOrCreateSessionForPrincipal(principal);

    assert.equal(validateSession(sessionId, principal), true);

    const withSession = await executeTool(chosenToolName, chosenToolArgs);
    assert.ok(
      withSession !== undefined,
      `cycle_${i + 1}: expected session-backed tool result`,
    );

    const withoutSession = await executeTool(chosenToolName, chosenToolArgs);
    assert.ok(
      withoutSession !== undefined,
      `cycle_${i + 1}: expected stateless tool result`,
    );

    assert.equal(touchSession(sessionId), true);

    const current = JSON.stringify(getSortedToolNames());
    assert.equal(
      current,
      baseline,
      "tool list changed during mixed session/stateless flow",
    );

    logPass(`cycle_${i + 1}_mixed_flow`, {
      tool: chosenToolName,
      principal,
      sessionId,
    });
  }
});

test("unknown tools are rejected consistently", async () => {
  await assert.rejects(
    () => executeTool("__tool_that_does_not_exist__", {}),
    /Unknown or missing tool/,
  );

  logPass("unknown_tool_rejected");
});

test("invalid non-object tool arguments are rejected consistently", async () => {
  const chosenToolName = getChosenToolName();

  await assert.rejects(
    () => executeTool(chosenToolName, null),
    /Tool arguments must be an object|Invalid tool arguments/,
  );

  await assert.rejects(
    () => executeTool(chosenToolName, []),
    /Tool arguments must be an object|Invalid tool arguments/,
  );

  logPass("invalid_args_rejected", {
    tool: chosenToolName,
  });
});

test("tool registry remains stable under repeated mixed operations", async () => {
  const chosenToolName = getChosenToolName();
  const chosenToolArgs = getChosenToolArgs();
  const baseline = JSON.stringify(getSortedToolNames());

  for (let i = 0; i < STRESS_COUNT; i++) {
    const principal = i % 2 === 0 ? TEST_PRINCIPAL : ALT_TEST_PRINCIPAL;
    const sessionId = getOrCreateSessionForPrincipal(principal);

    assert.equal(
      validateSession(sessionId, principal),
      true,
      `stress_${i + 1}: expected session to validate`,
    );

    if (i % 3 === 0) {
      const result = await executeTool(chosenToolName, chosenToolArgs);
      assert.ok(result !== undefined, `stress_${i + 1}: expected tool result`);
    } else {
      const toolNames = getSortedToolNames();
      assert.ok(toolNames.length > 0, `stress_${i + 1}: expected tools`);
    }

    assert.equal(
      JSON.stringify(getSortedToolNames()),
      baseline,
      `tool list changed during stress cycle ${i + 1}`,
    );

    if ((i + 1) % 10 === 0 || i === STRESS_COUNT - 1) {
      logPass(`stress_cycle_${i + 1}`, {
        tool: chosenToolName,
        principal,
        sessionId,
      });
    }
  }
});
