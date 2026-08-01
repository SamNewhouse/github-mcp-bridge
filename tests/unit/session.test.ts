import {
  createSession,
  getSessionIdFromHeaders,
  touchSession,
  validateSession,
} from "../../src/lib/session";

describe("session helper", () => {
  it("creates a valid session", () => {
    const sessionId = createSession();

    expect(typeof sessionId).toBe("string");
    expect(sessionId.length).toBeGreaterThan(0);
    expect(validateSession(sessionId)).toBe(true);
  });

  it("touches an existing session", () => {
    const sessionId = createSession();

    expect(touchSession(sessionId)).toBe(true);
    expect(validateSession(sessionId)).toBe(true);
  });

  it("rejects an unknown session", () => {
    expect(validateSession("missing-session")).toBe(false);
    expect(touchSession("missing-session")).toBe(false);
  });

  it("extracts session id from headers", () => {
    expect(
      getSessionIdFromHeaders({
        "mcp-session-id": "abc-123",
      }),
    ).toBe("abc-123");

    expect(
      getSessionIdFromHeaders({
        "mcp-session-id": ["xyz-789"],
      }),
    ).toBe("xyz-789");

    expect(getSessionIdFromHeaders({})).toBeNull();
  });
});
