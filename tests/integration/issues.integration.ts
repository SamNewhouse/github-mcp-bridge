import { callTool, callToolRaw, OWNER, REPO } from "./helpers";

async function getKnownClosedIssueNumber(): Promise<number | null> {
  const result = await callTool("list_issues", {
    owner: OWNER,
    repo: REPO,
    state: "closed",
  });
  if (!Array.isArray(result.issues) || result.issues.length === 0) {
    return null;
  }
  return result.issues[0].number;
}

const KNOWN_PR_NUMBER = 1;

describe("list_issues (integration)", () => {
  it("returns open issues excluding pull requests", async () => {
    const result = await callTool("list_issues", {
      owner: OWNER,
      repo: REPO,
      state: "open",
    });
    expect(Array.isArray(result.issues)).toBe(true);
    for (const issue of result.issues) {
      expect(issue).toHaveProperty("number");
      expect(issue).toHaveProperty("title");
      expect(issue).toHaveProperty("state");
      expect(issue).not.toHaveProperty("pull_request");
    }
  });

  it("returns closed issues when state=closed", async () => {
    const result = await callTool("list_issues", {
      owner: OWNER,
      repo: REPO,
      state: "closed",
    });
    expect(Array.isArray(result.issues)).toBe(true);
    for (const issue of result.issues) {
      expect(issue.state).toBe("closed");
    }
  });

  it("rejects an invalid state value", async () => {
    const json = await callToolRaw("list_issues", {
      owner: OWNER,
      repo: REPO,
      state: "invalid",
    });
    expect(json.error).toBeDefined();
  });
});

describe("get_issue (integration)", () => {
  it("returns the expected fields for a known closed issue", async () => {
    const knownIssueNumber = await getKnownClosedIssueNumber();
    if (knownIssueNumber === null) {
      return;
    }
    const result = await callTool("get_issue", {
      owner: OWNER,
      repo: REPO,
      issueNumber: knownIssueNumber,
    });
    expect(result.issue).toHaveProperty("number", knownIssueNumber);
    expect(result.issue).toHaveProperty("title");
    expect(result.issue).toHaveProperty("state", "closed");
    expect(result.issue).toHaveProperty("html_url");
    expect(result.issue).toHaveProperty("author");
    expect(result.issue).toHaveProperty("body");
    expect(result.issue).toHaveProperty("labels");
    expect(result.issue).toHaveProperty("assignees");
    expect(result.issue).toHaveProperty("created_at");
    expect(result.issue).toHaveProperty("updated_at");
  });

  it("throws when the number belongs to a pull request", async () => {
    await expect(
      callTool("get_issue", {
        owner: OWNER,
        repo: REPO,
        issueNumber: KNOWN_PR_NUMBER,
      }),
    ).rejects.toThrow();
  });

  it("throws for a non-existent issue number", async () => {
    await expect(
      callTool("get_issue", { owner: OWNER, repo: REPO, issueNumber: 999999 }),
    ).rejects.toThrow();
  });
});

describe("create_issue (integration — validation)", () => {
  it("rejects request with missing title field", async () => {
    const json = await callToolRaw("create_issue", {
      owner: OWNER,
      repo: REPO,
    });
    expect(json.error).toBeDefined();
  });

  it("rejects request with missing owner field", async () => {
    const json = await callToolRaw("create_issue", {
      repo: REPO,
      title: "should not be created",
    });
    expect(json.error).toBeDefined();
  });
});

describe("add_issue_comment (integration — validation)", () => {
  it("rejects request with missing body field", async () => {
    const json = await callToolRaw("add_issue_comment", {
      owner: OWNER,
      repo: REPO,
      issueNumber: KNOWN_PR_NUMBER,
    });
    expect(json.error).toBeDefined();
  });

  it("rejects request with missing issueNumber field", async () => {
    const json = await callToolRaw("add_issue_comment", {
      owner: OWNER,
      repo: REPO,
      body: "should not be posted",
    });
    expect(json.error).toBeDefined();
  });
});

describe("list_issue_comments (integration)", () => {
  it("returns comments array for a known issue/PR number", async () => {
    const result = await callTool("list_issue_comments", {
      owner: OWNER,
      repo: REPO,
      issueNumber: KNOWN_PR_NUMBER,
    });
    expect(Array.isArray(result.comments)).toBe(true);
    if (result.comments.length > 0) {
      expect(result.comments[0]).toHaveProperty("id");
      expect(result.comments[0]).toHaveProperty("body");
      expect(result.comments[0]).toHaveProperty("author");
    }
  });

  it("throws for a non-existent issue number", async () => {
    await expect(
      callTool("list_issue_comments", {
        owner: OWNER,
        repo: REPO,
        issueNumber: 999999,
      }),
    ).rejects.toThrow();
  });
});
