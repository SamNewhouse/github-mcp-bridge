import {
  createSession,
  deleteSessionForPrincipal,
  getOrCreateSessionForPrincipal,
  getSessionIdFromHeaders,
  touchSessionForPrincipal,
} from "../../src/lib/session";

/**
 * In-memory stand-in for Upstash Redis. Expiry is computed from Date.now(),
 * so Jest's fake timers control it. Values are stored as-is, mirroring the
 * JSON-decoded objects the real client returns.
 */
const mockStore = new Map<string, { value: unknown; expiresAt: number }>();

jest.mock("@upstash/redis", () => {
  class MockRedis {
    private live(key: string) {
      const entry = mockStore.get(key);

      if (!entry) {
        return undefined;
      }

      if (entry.expiresAt <= Date.now()) {
        mockStore.delete(key);
        return undefined;
      }

      return entry;
    }

    async set(key: string, value: unknown, opts?: { px?: number }) {
      mockStore.set(key, {
        value,
        expiresAt: opts?.px ? Date.now() + opts.px : Infinity,
      });

      return "OK";
    }

    async get<T>(key: string): Promise<T | null> {
      return (this.live(key)?.value as T | undefined) ?? null;
    }

    async pexpire(key: string, ms: number) {
      const entry = this.live(key);

      if (!entry) {
        return 0;
      }

      entry.expiresAt = Date.now() + ms;
      return 1;
    }

    async del(key: string) {
      return mockStore.delete(key) ? 1 : 0;
    }
  }

  return { Redis: MockRedis };
});

const MINUTE = 60 * 1000;

describe("session helper", () => {
  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    delete process.env.MCP_SESSION_IDLE_TTL_MS;
    delete process.env.MCP_SESSION_MAX_TTL_MS;

    mockStore.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("creates a valid session for a principal", async () => {
    const sessionId = await createSession("principal-a");

    expect(typeof sessionId).toBe("string");
    expect(sessionId.length).toBeGreaterThan(0);
    expect(await touchSessionForPrincipal(sessionId, "principal-a")).toBe(true);
    expect(await touchSessionForPrincipal(sessionId, "principal-b")).toBe(
      false,
    );
  });

  it("creates a new session on each call to getOrCreateSessionForPrincipal", async () => {
    const first = await getOrCreateSessionForPrincipal("principal-a");
    const second = await getOrCreateSessionForPrincipal("principal-a");

    expect(second).not.toBe(first);
    expect(await touchSessionForPrincipal(first, "principal-a")).toBe(true);
    expect(await touchSessionForPrincipal(second, "principal-a")).toBe(true);
  });

  it("creates different sessions for different principals", async () => {
    const first = await getOrCreateSessionForPrincipal("principal-a");
    const second = await getOrCreateSessionForPrincipal("principal-b");

    expect(second).not.toBe(first);
    expect(await touchSessionForPrincipal(first, "principal-a")).toBe(true);
    expect(await touchSessionForPrincipal(second, "principal-b")).toBe(true);
    expect(await touchSessionForPrincipal(first, "principal-b")).toBe(false);
  });

  it("rejects an unknown session", async () => {
    expect(
      await touchSessionForPrincipal("missing-session", "principal-a"),
    ).toBe(false);
  });

  it("expires a session after the idle TTL", async () => {
    const sessionId = await createSession("principal-a");

    jest.advanceTimersByTime(5 * MINUTE + 1);

    expect(await touchSessionForPrincipal(sessionId, "principal-a")).toBe(
      false,
    );
  });

  it("slides the idle window on each touch", async () => {
    const sessionId = await createSession("principal-a");

    jest.advanceTimersByTime(4 * MINUTE);
    expect(await touchSessionForPrincipal(sessionId, "principal-a")).toBe(true);

    // 8 minutes after creation: would be dead without sliding.
    jest.advanceTimersByTime(4 * MINUTE);
    expect(await touchSessionForPrincipal(sessionId, "principal-a")).toBe(true);

    jest.advanceTimersByTime(5 * MINUTE + 1);
    expect(await touchSessionForPrincipal(sessionId, "principal-a")).toBe(
      false,
    );
  });

  it("never extends a session past the maximum lifetime", async () => {
    const sessionId = await createSession("principal-a");

    for (let i = 0; i < 14; i++) {
      jest.advanceTimersByTime(4 * MINUTE);
      expect(await touchSessionForPrincipal(sessionId, "principal-a")).toBe(
        true,
      );
    }

    // 56 minutes in, the remaining lifetime is 4 minutes.
    jest.advanceTimersByTime(5 * MINUTE);

    expect(await touchSessionForPrincipal(sessionId, "principal-a")).toBe(
      false,
    );
  });

  it("deletes a session for its owner only", async () => {
    const sessionId = await createSession("principal-a");

    expect(await deleteSessionForPrincipal(sessionId, "principal-b")).toBe(
      false,
    );
    expect(await touchSessionForPrincipal(sessionId, "principal-a")).toBe(true);

    expect(await deleteSessionForPrincipal(sessionId, "principal-a")).toBe(
      true,
    );
    expect(await touchSessionForPrincipal(sessionId, "principal-a")).toBe(
      false,
    );
  });

  it("returns false when deleting an unknown session", async () => {
    expect(
      await deleteSessionForPrincipal("missing-session", "principal-a"),
    ).toBe(false);
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
