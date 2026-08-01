import {
  createSession,
  getOrCreateSessionForPrincipal,
  getSessionIdFromHeaders,
  touchSession,
  validateSession,
} from "../../src/lib/session";

describe("session helper", () => {
  it("creates a valid session for a principal", () => {
    const sessionId = createSession("principal-a");

    expect(typeof sessionId).toBe("string");
    expect(sessionId.length).toBeGreaterThan(0);
    expect(validateSession(sessionId)).toBe(true);
    expect(validateSession(sessionId, "principal-a")).toBe(true);
    expect(validateSession(sessionId, "principal-b")).toBe(false);
  });

  it("reuses an active session for the same principal", () => {
    const first = getOrCreateSessionForPrincipal("principal-a");
    const second = getOrCreateSessionForPrincipal("principal-a");

    expect(second).toBe(first);
    expect(validateSession(first, "principal-a")).toBe(true);
  });

  it("creates different sessions for different principals", () => {
    const first = getOrCreateSessionForPrincipal("principal-a");
    const second = getOrCreateSessionForPrincipal("principal-b");

    expect(second).not.toBe(first);
    expect(validateSession(first, "principal-a")).toBe(true);
    expect(validateSession(second, "principal-b")).toBe(true);
  });

  it("touches an existing session", () => {
    const sessionId = createSession("principal-a");

    expect(touchSession(sessionId)).toBe(true);
    expect(validateSession(sessionId, "principal-a")).toBe(true);
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
