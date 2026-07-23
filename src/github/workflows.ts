import { githubRequest } from "./client";

type GitHubWorkflowRun = {
  id: number;
  name: string | null;
  head_branch: string | null;
  head_sha: string;
  run_number: number;
  event: string;
  status: string | null;
  conclusion: string | null;
  workflow_id: number;
  html_url: string;
  created_at: string;
  updated_at: string;
  run_started_at: string | null;
  actor: { login: string } | null;
  triggering_actor: { login: string } | null;
};

type GitHubWorkflowJob = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  html_url: string;
  steps: {
    name: string;
    status: string;
    conclusion: string | null;
    number: number;
    started_at: string | null;
    completed_at: string | null;
  }[];
};

type GitHubListWorkflowRunsResponse = {
  total_count: number;
  workflow_runs: GitHubWorkflowRun[];
};

type GitHubJobsResponse = {
  total_count: number;
  jobs: GitHubWorkflowJob[];
};

function mapRun(run: GitHubWorkflowRun) {
  return {
    id: run.id,
    name: run.name,
    workflow_id: run.workflow_id,
    run_number: run.run_number,
    event: run.event,
    status: run.status,
    conclusion: run.conclusion,
    head_branch: run.head_branch,
    head_sha: run.head_sha,
    html_url: run.html_url,
    actor: run.actor?.login ?? null,
    triggering_actor: run.triggering_actor?.login ?? null,
    created_at: run.created_at,
    updated_at: run.updated_at,
    run_started_at: run.run_started_at ?? null,
  };
}

export async function listWorkflowRuns(
  owner: string,
  repo: string,
  branch?: string,
  event?: string,
  status?: string,
  perPage = 30,
) {
  const params = new URLSearchParams();
  if (branch) params.set("branch", branch);
  if (event) params.set("event", event);
  if (status) params.set("status", status);
  params.set("per_page", String(perPage));

  const data = await githubRequest<GitHubListWorkflowRunsResponse>(
    `/repos/${owner}/${repo}/actions/runs?${params.toString()}`,
    { owner },
  );

  return {
    total_count: data.total_count,
    runs: data.workflow_runs.map(mapRun),
  };
}

export async function getWorkflowRun(
  owner: string,
  repo: string,
  runId: number,
) {
  const run = await githubRequest<GitHubWorkflowRun>(
    `/repos/${owner}/${repo}/actions/runs/${runId}`,
    { owner },
  );

  const jobsData = await githubRequest<GitHubJobsResponse>(
    `/repos/${owner}/${repo}/actions/runs/${runId}/jobs?per_page=100`,
    { owner },
  );

  return {
    ...mapRun(run),
    jobs: jobsData.jobs.map((job) => ({
      id: job.id,
      name: job.name,
      status: job.status,
      conclusion: job.conclusion,
      started_at: job.started_at ?? null,
      completed_at: job.completed_at ?? null,
      html_url: job.html_url,
      steps: job.steps.map((step) => ({
        number: step.number,
        name: step.name,
        status: step.status,
        conclusion: step.conclusion,
        started_at: step.started_at ?? null,
        completed_at: step.completed_at ?? null,
      })),
    })),
  };
}
