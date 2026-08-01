import { callTool, callToolRaw, OWNER, REPO } from "./helpers";

async function getKnownPrNumber(): Promise<number | null> {
  const result = await callTool("list_open_pull_requests", {
    owner: OWNER,
    repo: REPO,
  });
  if (!Array.isArray(result.pull_requests) || result.pull_requests.length === 0) {
    return null;
  }
  return result.pull_requests[0].number;
}

describe("list_open_pull_requests (integration)", () => {
  it("returns an array of open pull requests with expected fields", async () => {
    const result = await callTool("list_open_pull_requests", {
      owner: OWNER,
      repo: REPO,
    });
    expect(Array.isArray(result.pull_requests)).toBe(true);
    if (result.pull_requests.length > 0) {
      const pr = result.pull_requests[0];
      expect(pr).toHaveProperty("number");
      expect(pr).toHaveProperty("title");
      expect(pr).toHaveProperty("head");
      expect(pr).toHaveProperty("base");
    }
  });
});

describe("list_pull_requests (integration)", () => {
  it("returns an array when state=all", async () => {
    const result = await callTool("list_pull_requests", {
      owner: OWNER,
      repo: REPO,
      state: "all",
    });
    expect(Array.isArray(result.pull_requests)).toBe(true);
    expect(result.pull_requests.length).toBeGreaterThan(0);
  });

  it("each PR has the expected mapped fields", async () => {
    const result = await callTool("list_pull_requests", {
      owner: OWNER,
      repo: REPO,
      state: "all",
    });
    for (const pr of result.pull_requests) {
      expect(pr).toHaveProperty("number");
      expect(pr).toHaveProperty("title");
      expect(pr).toHaveProperty("state");
      expect(pr).toHaveProperty("draft");
      expect(pr).toHaveProperty("html_url");
      expect(pr).toHaveProperty("author");
      expect(pr).toHaveProperty("head");
      expect(pr).toHaveProperty("base");
      expect(pr).toHaveProperty("created_at");
      expect(pr).toHaveProperty("updated_at");
    }
  });

  it("rejects an invalid state value", async () => {
    const json = await callToolRaw("list_pull_requests", {
      owner: OWNER,
      repo: REPO,
      state: "invalid",
    });
    expect(json.error).toBeDefined();
  });
});

describe("get_pull_request (integration)", () => {
  it("returns full PR detail with all mapped fields", async () => {
    const knownPrNumber = await getKnownPrNumber();
    if (knownPrNumber === null) {
      return;
    }
    const result = await callTool("get_pull_request", {
      owner: OWNER,
      repo: REPO,
      pullNumber: knownPrNumber,
    });
    expect(result.pullRequest).toHaveProperty("number", knownPrNumber);
    expect(result.pullRequest).toHaveProperty("draft");
    expect(result.pullRequest).toHaveProperty("headSha");
    expect(result.pullRequest).toHaveProperty("additions");
    expect(result.pullRequest).toHaveProperty("deletions");
  });

  it("throws for a non-existent pull request number", async () => {
    await expect(
      callTool("get_pull_request", {
        owner: OWNER,
        repo: REPO,
        pullNumber: 999999,
      }),
    ).rejects.toThrow();
  });
});

describe("get_pull_request_diff (integration)", () => {
  it("returns a non-empty diff string for a known PR", async () => {
    const knownPrNumber = await getKnownPrNumber();
    if (knownPrNumber === null) {
      return;
    }
    const result = await callTool("get_pull_request_diff", {
      owner: OWNER,
      repo: REPO,
      pullNumber: knownPrNumber,
    });
    expect(result.diff.pullNumber).toBe(knownPrNumber);
    expect(typeof result.diff.diff).toBe("string");
    expect(result.diff.diff.length).toBeGreaterThan(0);
  });
});

describe("get_pull_request_reviews (integration)", () => {
  it("returns a reviews array for a known PR", async () => {
    const knownPrNumber = await getKnownPrNumber();
    if (knownPrNumber === null) {
      return;
    }
    const result = await callTool("get_pull_request_reviews", {
      owner: OWNER,
      repo: REPO,
      pullNumber: knownPrNumber,
    });
    expect(Array.isArray(result.reviews)).toBe(true);
  });

  it("each review has the expected response shape", async () => {
    const knownPrNumber = await getKnownPrNumber();
    if (knownPrNumber === null) {
      return;
    }
    const result = await callTool("get_pull_request_reviews", {
      owner: OWNER,
      repo: REPO,
      pullNumber: knownPrNumber,
    });
    if (result.reviews.length > 0) {
      const review = result.reviews[0];
      expect(review).toHaveProperty("id");
      expect(review).toHaveProperty("state");
      expect(review).toHaveProperty("body");
      expect(review).toHaveProperty("author");
      expect(review).toHaveProperty("commit_id");
      expect(review).toHaveProperty("submitted_at");
      expect(review).toHaveProperty("html_url");
    }
  });

  it("throws for a non-existent pull request number", async () => {
    await expect(
      callTool("get_pull_request_reviews", {
        owner: OWNER,
        repo: REPO,
        pullNumber: 999999,
      }),
    ).rejects.toThrow();
  });
});

describe("list_pull_request_files (integration)", () => {
  it("returns files and truncated flag for a known PR", async () => {
    const knownPrNumber = await getKnownPrNumber();
    if (knownPrNumber === null) {
      return;
    }
    const result = await callTool("list_pull_request_files", {
      owner: OWNER,
      repo: REPO,
      pullNumber: knownPrNumber,
    });
    expect(result.files).toHaveProperty("files");
    expect(Array.isArray(result.files.files)).toBe(true);
    expect(typeof result.files.truncated).toBe("boolean");
  });

  it("each file entry has the expected shape", async () => {
    const knownPrNumber = await getKnownPrNumber();
    if (knownPrNumber === null) {
      return;
    }
    const result = await callTool("list_pull_request_files", {
      owner: OWNER,
      repo: REPO,
      pullNumber: knownPrNumber,
    });
    if (result.files.files.length > 0) {
      const file = result.files.files[0];
      expect(file).toHaveProperty("path");
      expect(file).toHaveProperty("status");
      expect(file).toHaveProperty("additions");
      expect(file).toHaveProperty("deletions");
      expect(file).toHaveProperty("changes");
      expect(file).toHaveProperty("blob_url");
    }
  });
});

describe("list_pull_request_comments (integration)", () => {
  it("returns a comments array for a known PR", async () => {
    const knownPrNumber = await getKnownPrNumber();
    if (knownPrNumber === null) {
      return;
    }
    const result = await callTool("list_pull_request_comments", {
      owner: OWNER,
      repo: REPO,
      pullNumber: knownPrNumber,
    });
    expect(Array.isArray(result.comments)).toBe(true);
    if (result.comments.length > 0) {
      expect(result.comments[0]).toHaveProperty("id");
      expect(result.comments[0]).toHaveProperty("body");
      expect(result.comments[0]).toHaveProperty("author");
    }
  });

  it("each comment has the expected response shape", async () => {
    const knownPrNumber = await getKnownPrNumber();
    if (knownPrNumber === null) {
      return;
    }
    const result = await callTool("list_pull_request_comments", {
      owner: OWNER,
      repo: REPO,
      pullNumber: knownPrNumber,
    });
    if (result.comments.length > 0) {
      const comment = result.comments[0];
      expect(comment).toHaveProperty("id");
      expect(comment).toHaveProperty("body");
      expect(comment).toHaveProperty("author");
      expect(comment).toHaveProperty("html_url");
      expect(comment).toHaveProperty("created_at");
      expect(comment).toHaveProperty("updated_at");
    }
  });
});
