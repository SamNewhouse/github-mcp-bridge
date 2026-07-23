jest.mock("../../src/github/client", () => ({
  githubRequest: jest.fn(),
}));

import { githubRequest } from "../../src/github/client";
import {
  getWorkflowRun,
  listWorkflowRuns,
} from "../../src/github/workflows";

const mock = githubRequest as jest.MockedFunction<typeof githubRequest>;

beforeEach(() => {
  mock.mockReset();
});

function makeRun(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 123,
    name: "CI",
    head_branch: "main",
    head_sha: "deadbeef",
    run_number: 44,
    event: "push",
    status: "completed",
    conclusion: "success",
    workflow_id: 999,
    html_url: "https://github.com/owner/repo/actions/runs/123",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:10:00Z",
    run_started_at: "2026-01-01T00:01:00Z",
    actor: { login: "alice" },
    triggering_actor: { login: "alice" },
    ...overrides,
  };
}

describe("listWorkflowRuns", () => {
  /**
   * Return shape — verifies total_count is preserved and runs are mapped
   * to the flattened output shape, including actor usernames.
   */
  it("maps workflow runs and total_count", async () => {
    mock.mockResolvedValueOnce({
      total_count: 1,
      workflow_runs: [makeRun()],
    });

    const result = await listWorkflowRuns("owner", "repo");

    expect(result.total_count).toBe(1);
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0]).toMatchObject({
      id: 123,
      name: "CI",
      workflow_id: 999,
      run_number: 44,
      event: "push",
      status: "completed",
      conclusion: "success",
      head_branch: "main",
      head_sha: "deadbeef",
      html_url: "https://github.com/owner/repo/actions/runs/123",
      actor: "alice",
      triggering_actor: "alice",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:10:00Z",
      run_started_at: "2026-01-01T00:01:00Z",
    });
  });

  /**
   * Filters forwarded — asserts branch, event, status, and per_page are
   * included in the request URL when provided.
   */
  it("forwards branch, event, status, and perPage in the URL", async () => {
    mock.mockResolvedValueOnce({
      total_count: 0,
      workflow_runs: [],
    });

    await listWorkflowRuns("owner", "repo", "main", "push", "completed", 5);

    const url = (mock as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("branch=main");
    expect(url).toContain("event=push");
    expect(url).toContain("status=completed");
    expect(url).toContain("per_page=5");
  });

  /**
   * Optional filters omitted — asserts the request still includes per_page
   * and does not require branch/event/status to be present.
   */
  it("works without optional filters", async () => {
    mock.mockResolvedValueOnce({
      total_count: 0,
      workflow_runs: [],
    });

    await listWorkflowRuns("owner", "repo");

    const url = (mock as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("/actions/runs?");
    expect(url).toContain("per_page=30");
  });

  /**
   * Empty result — no workflow runs matched the filter.
   */
  it("returns an empty runs array", async () => {
    mock.mockResolvedValueOnce({
      total_count: 0,
      workflow_runs: [],
    });

    const result = await listWorkflowRuns("owner", "repo");

    expect(result).toEqual({ total_count: 0, runs: [] });
  });

  /**
   * Null actor fields — GitHub may return null for actor or triggering_actor.
   * Asserts both are mapped to null in the flattened output.
   */
  it("preserves null actor and triggering_actor", async () => {
    mock.mockResolvedValueOnce({
      total_count: 1,
      workflow_runs: [
        makeRun({
          actor: null,
          triggering_actor: null,
        }),
      ],
    });

    const result = await listWorkflowRuns("owner", "repo");

    expect(result.runs[0]!.actor).toBeNull();
    expect(result.runs[0]!.triggering_actor).toBeNull();
  });

  /**
   * run_started_at null — queued runs may not have started yet.
   * Asserts null is preserved.
   */
  it("preserves null run_started_at for queued runs", async () => {
    mock.mockResolvedValueOnce({
      total_count: 1,
      workflow_runs: [
        makeRun({
          run_started_at: null,
          status: "queued",
          conclusion: null,
        }),
      ],
    });

    const result = await listWorkflowRuns("owner", "repo");

    expect(result.runs[0]!.run_started_at).toBeNull();
    expect(result.runs[0]!.conclusion).toBeNull();
  });
});

describe("getWorkflowRun", () => {
  /**
   * Full detail — verifies the run is mapped and jobs/steps are included
   * from the second API call to the workflow jobs endpoint.
   */
  it("returns run detail plus jobs and steps", async () => {
    mock
      .mockResolvedValueOnce(makeRun())
      .mockResolvedValueOnce({
        total_count: 1,
        jobs: [
          {
            id: 1,
            name: "test",
            status: "completed",
            conclusion: "success",
            started_at: "2026-01-01T00:01:00Z",
            completed_at: "2026-01-01T00:02:00Z",
            html_url: "https://github.com/job/1",
            steps: [
              {
                number: 1,
                name: "checkout",
                status: "completed",
                conclusion: "success",
                started_at: "2026-01-01T00:01:00Z",
                completed_at: "2026-01-01T00:01:10Z",
              },
            ],
          },
        ],
      });

    const result = await getWorkflowRun("owner", "repo", 123);

    expect(result).toMatchObject({
      id: 123,
      name: "CI",
      workflow_id: 999,
      run_number: 44,
      event: "push",
      status: "completed",
      conclusion: "success",
      head_branch: "main",
      head_sha: "deadbeef",
      actor: "alice",
      triggering_actor: "alice",
    });

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({
      id: 1,
      name: "test",
      status: "completed",
      conclusion: "success",
      started_at: "2026-01-01T00:01:00Z",
      completed_at: "2026-01-01T00:02:00Z",
      html_url: "https://github.com/job/1",
    });
    expect(result.jobs[0]!.steps).toHaveLength(1);
    expect(result.jobs[0]!.steps[0]).toMatchObject({
      number: 1,
      name: "checkout",
      status: "completed",
      conclusion: "success",
      started_at: "2026-01-01T00:01:00Z",
      completed_at: "2026-01-01T00:01:10Z",
    });
  });

  /**
   * Null actor fields — GitHub may return null for actor and triggering_actor.
   * Asserts both are preserved in the mapped result.
   */
  it("preserves null actor and triggering_actor", async () => {
    mock
      .mockResolvedValueOnce(
        makeRun({
          actor: null,
          triggering_actor: null,
        }),
      )
      .mockResolvedValueOnce({
        total_count: 0,
        jobs: [],
      });

    const result = await getWorkflowRun("owner", "repo", 123);

    expect(result.actor).toBeNull();
    expect(result.triggering_actor).toBeNull();
  });

  /**
   * Jobs request URL — asserts the second request goes to the jobs endpoint
   * for the run and requests up to 100 jobs.
   */
  it("requests jobs with per_page=100", async () => {
    mock
      .mockResolvedValueOnce(makeRun())
      .mockResolvedValueOnce({
        total_count: 0,
        jobs: [],
      });

    await getWorkflowRun("owner", "repo", 123);

    const url = (mock as jest.Mock).mock.calls[1][0] as string;
    expect(url).toContain("/actions/runs/123/jobs");
    expect(url).toContain("per_page=100");
  });

  /**
   * Empty jobs — workflow run has no jobs available.
   * Asserts jobs is returned as an empty array.
   */
  it("returns an empty jobs array when no jobs are present", async () => {
    mock
      .mockResolvedValueOnce(makeRun())
      .mockResolvedValueOnce({
        total_count: 0,
        jobs: [],
      });

    const result = await getWorkflowRun("owner", "repo", 123);

    expect(result.jobs).toEqual([]);
  });

  /**
   * Null step timestamps — queued or skipped steps may have null timestamps.
   * Asserts null values are preserved in the mapped output.
   */
  it("preserves null step timestamps", async () => {
    mock
      .mockResolvedValueOnce(makeRun())
      .mockResolvedValueOnce({
        total_count: 1,
        jobs: [
          {
            id: 1,
            name: "test",
            status: "in_progress",
            conclusion: null,
            started_at: "2026-01-01T00:01:00Z",
            completed_at: null,
            html_url: "https://github.com/job/1",
            steps: [
              {
                number: 1,
                name: "checkout",
                status: "in_progress",
                conclusion: null,
                started_at: null,
                completed_at: null,
              },
            ],
          },
        ],
      });

    const result = await getWorkflowRun("owner", "repo", 123);

    expect(result.jobs[0]!.conclusion).toBeNull();
    expect(result.jobs[0]!.completed_at).toBeNull();
    expect(result.jobs[0]!.steps[0]!.started_at).toBeNull();
    expect(result.jobs[0]!.steps[0]!.completed_at).toBeNull();
  });
});
