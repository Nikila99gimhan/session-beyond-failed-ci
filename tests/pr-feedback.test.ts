import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const { start, finish, recover, hasOccurrence } = createRequire(import.meta.url)("../scripts/publish-investigation-feedback.cjs");

const sha = "a".repeat(40);
const bot = { login: "github-actions[bot]", type: "Bot" };
const repo = { owner: "demo", repo: "repo" };
const marker = "OCCURRENCE_KEY: demo/repo::100::1";
// Captured through the pinned runtime's real ingestion/writer sanitizer twice.
// See the fixture provenance; this is a local compatibility check, not Actions.
const sanitizedDelivery = JSON.parse(readFileSync("tests/fixtures/sanitized-report-markers.json", "utf8"));

function fixture(mode: "failure" | "shared-module" = "failure") {
  const run: any = {
    id: 100, run_attempt: 1, repository: { id: 1 }, head_repository: { id: 1 },
    event: "pull_request", path: ".github/workflows/ci.yml", status: "completed", conclusion: "failure",
    head_sha: sha, head_branch: "feature/network", pull_requests: [{ number: 14, base: { ref: "main" } }],
  };
  const pr: any = {
    number: 14, state: "open", head: { sha, ref: run.head_branch, repo: { id: 1 } },
    base: { ref: "main", repo: { id: 1 } },
  };
  const check: any = { id: 200, name: "CI Investigation", head_sha: sha,
    external_id: "demo/repo::100::1", app: { slug: "github-actions" } };
  const issue: any = { number: 15, title: "[CI Failure] subnet + auth", user: bot,
    labels: [{ name: "ci-failure" }], body: marker };
  const prComments: any[] = [];
  const issueComments: any[] = [];
  const github = { rest: {
    actions: { getWorkflowRunAttempt: vi.fn(async () => ({ data: run })) },
    pulls: { get: vi.fn(async () => ({ data: pr })) },
    checks: {
      listForRef: vi.fn(async () => ({ data: { check_runs: [] } })),
      create: vi.fn(async () => ({ data: check })),
      get: vi.fn(async () => ({ data: check })),
      update: vi.fn(async () => ({ data: check })),
    },
    issues: {
      get: vi.fn(async () => ({ data: issue })),
      listForRepo: vi.fn(async () => ({ data: [issue] })),
      listComments: vi.fn(async ({ issue_number }: any) => ({ data: issue_number === 14 ? prComments : issueComments })),
      createComment: vi.fn(async (args: any) => {
        const comment = { ...args, id: 300, user: bot, html_url: "https://github.com/demo/repo/pull/14#issuecomment-300" };
        prComments.push(comment);
        return { data: comment };
      }),
      updateComment: vi.fn(async () => ({})),
    },
  } };
  const context = { repo, runId: 101, serverUrl: "https://github.com",
    payload: { workflow_run: { id: 100, run_attempt: 1, head_sha: sha }, repository: { id: 1 } } };
  const core = { setOutput: vi.fn() };
  const delivery = { checkId: "200", createdIssue: "15", agent: "success", detection: "success",
    detectionConclusion: "success", writer: "success" };
  if (mode === "shared-module") {
    run.conclusion = "success";
    check.name = "Shared Module Review";
    check.external_id += "::shared-module";
    issue.title = "[Module Review] hosting plan default affects registered consumer";
    issue.labels = [{ name: "shared-module-review" }];
  }
  issue.body = sanitizedDelivery.cases.find((item: any) => item.workflow ===
    (mode === "failure" ? "ci-investigator" : "shared-module-investigator")).sanitized;
  return { github, context, core, delivery, mode, run, pr, check, issue, prComments, issueComments };
}

describe.each(["failure", "shared-module"] as const)("Sanitized report delivery: %s", mode => {
  const workflow = mode === "failure" ? "ci-investigator" : "shared-module-investigator";
  const sample = sanitizedDelivery.cases.find((item: any) => item.workflow === workflow);

  it("keeps the workflow's audit format aligned with the sanitizer compatibility fixture", () => {
    const source = readFileSync(`.github/workflows/${workflow}.md`, "utf8");
    const block = source.match(/^ {0,2}```text\n([\s\S]*?)^ {0,2}```/m)?.[1]
      .replace(/^  /gm, "").trimEnd();
    expect(block).toBe(sample.template);
    expect(hasOccurrence(sample.sanitized, marker)).toBe(true);
    expect(sample.sanitized).toContain("ROOT_CAUSE_FINGERPRINT:");
  });

  it("links the sanitized issue once and reuses the managed PR comment on replay", async () => {
    const f = fixture(mode);
    await finish(f);
    await finish(f);
    expect(f.github.rest.issues.createComment).toHaveBeenCalledTimes(1);
    expect(f.github.rest.issues.updateComment).not.toHaveBeenCalled();
    expect(f.github.rest.checks.update).toHaveBeenLastCalledWith(expect.objectContaining({
      conclusion: "success", details_url: "https://github.com/demo/repo/issues/15",
    }));
  });

  it("links a distinct occurrence persisted in a sanitized bot issue comment", async () => {
    const f = fixture(mode);
    f.delivery.createdIssue = "";
    f.issue.body = "Earlier occurrence";
    f.issueComments.push({ body: sample.sanitized, user: bot });
    await finish(f);
    expect(f.github.rest.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({ issue_number: 14 }));
  });

  it("reproduces the legacy marker loss and still refuses to link an unbound report", async () => {
    const f = fixture(mode);
    expect(hasOccurrence(sanitizedDelivery.legacy.input, marker)).toBe(true);
    expect(hasOccurrence(sanitizedDelivery.legacy.sanitized, marker)).toBe(false);
    f.issue.body = sanitizedDelivery.legacy.sanitized;
    await expect(finish(f)).rejects.toThrow("Writer issue does not contain this source occurrence");
    expect(f.github.rest.issues.createComment).not.toHaveBeenCalled();
    expect(f.github.rest.checks.update).toHaveBeenCalledWith(expect.objectContaining({ conclusion: "failure" }));
  });
});

describe("Deterministic PR investigation feedback", () => {
  it("attaches the running check to the PR source commit, not the automation commit", async () => {
    const f = fixture();
    await start(f);
    expect(f.github.rest.actions.getWorkflowRunAttempt).toHaveBeenCalledWith({ ...repo, run_id: 100, attempt_number: 1 });
    expect(f.github.rest.checks.create).toHaveBeenCalledWith(expect.objectContaining({
      name: "CI Investigation", head_sha: sha, external_id: "demo/repo::100::1", status: "in_progress",
    }));
    expect(f.core.setOutput).toHaveBeenCalledWith("check_id", "200");
  });

  it("reuses an existing check for the exact source attempt", async () => {
    const f = fixture();
    f.github.rest.checks.listForRef.mockResolvedValue({ data: { check_runs: [f.check] } } as never);
    await start(f);
    expect(f.github.rest.checks.create).not.toHaveBeenCalled();
    expect(f.github.rest.checks.update).toHaveBeenCalledWith(expect.objectContaining({ check_run_id: 200 }));
  });

  it.each(["fork", "wrong-repository", "wrong-sha", "push", "green", "wrong-workflow", "wrong-attempt", "wrong-base", "ambiguous-pr"])
    ("rejects %s source metadata before any write", async variant => {
      const f = fixture();
      if (variant === "fork") f.run.head_repository.id = 9;
      if (variant === "wrong-repository") f.run.repository.id = 9;
      if (variant === "wrong-sha") f.run.head_sha = "b".repeat(40);
      if (variant === "push") f.run.event = "push";
      if (variant === "green") f.run.conclusion = "success";
      if (variant === "wrong-workflow") f.run.path = ".github/workflows/other.yml";
      if (variant === "wrong-attempt") f.run.run_attempt = 2;
      if (variant === "wrong-base") f.pr.base.ref = "other";
      if (variant === "ambiguous-pr") f.run.pull_requests.push({ number: 16, base: { ref: "main" } });
      await expect(start(f)).rejects.toThrow();
      expect(f.github.rest.checks.create).not.toHaveBeenCalled();
      expect(f.github.rest.issues.createComment).not.toHaveBeenCalled();
    });

  it("links the verified controlled issue on the exact PR, with a completed informational check", async () => {
    const f = fixture();
    const result = await finish(f);
    expect(result.issueUrl).toBe("https://github.com/demo/repo/issues/15");
    expect(f.github.rest.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({
      ...repo, issue_number: 14, body: expect.stringContaining("[issue #15](https://github.com/demo/repo/issues/15)"),
    }));
    expect(f.github.rest.checks.update).toHaveBeenCalledWith(expect.objectContaining({
      check_run_id: 200, status: "completed", conclusion: "success",
      output: expect.objectContaining({ summary: expect.stringContaining("CI remains failed") }),
    }));
  });

  it("does not create another PR comment on exact replay", async () => {
    const f = fixture();
    await finish(f);
    await finish(f);
    expect(f.github.rest.issues.createComment).toHaveBeenCalledTimes(1);
    expect(f.github.rest.issues.updateComment).not.toHaveBeenCalled();
  });

  it("finds an existing issue from a verified bot occurrence comment", async () => {
    const f = fixture();
    f.delivery.createdIssue = "";
    f.issue.body = "Original occurrence";
    f.issueComments.push({ body: `<!-- ${marker} -->`, user: bot });
    await finish(f);
    expect(f.github.rest.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({ issue_number: 14 }));
  });

  it.each(["wrong-occurrence", "untrusted-author", "pr-as-report", "wrong-label", "wrong-title"])
    ("refuses a %s report and marks delivery failed", async variant => {
      const f = fixture();
      if (variant === "wrong-occurrence") f.issue.body = marker + "0";
      if (variant === "untrusted-author") f.issue.user = { login: "some-user", type: "User" };
      if (variant === "pr-as-report") f.issue.pull_request = {};
      if (variant === "wrong-label") f.issue.labels = [];
      if (variant === "wrong-title") f.issue.title = "Unrelated issue";
      await expect(finish(f)).rejects.toThrow();
      expect(f.github.rest.issues.createComment).not.toHaveBeenCalled();
      expect(f.github.rest.checks.update).toHaveBeenCalledWith(expect.objectContaining({ conclusion: "failure" }));
    });

  it("cannot update an unrelated commit check", async () => {
    const f = fixture();
    f.check.head_sha = "b".repeat(40);
    await expect(finish(f)).rejects.toThrow("binding failed");
    expect(f.github.rest.checks.update).not.toHaveBeenCalled();
    expect(f.github.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it.each(["agent", "detection", "writer", "detectionConclusion"])("does not publish on %s failure", async stage => {
    const f = fixture();
    (f.delivery as any)[stage] = "failure";
    await expect(finish(f)).rejects.toThrow();
    expect(f.github.rest.issues.createComment).not.toHaveBeenCalled();
    expect(f.github.rest.checks.update).toHaveBeenCalledWith(expect.objectContaining({ conclusion: "failure" }));
  });

  it.each(["moved", "closed", "moved-during-publish"])("keeps historical results off a %s PR", async state => {
    const f = fixture();
    if (state === "moved") f.pr.head.sha = "b".repeat(40);
    if (state === "closed") f.pr.state = "closed";
    if (state === "moved-during-publish") {
      f.github.rest.pulls.get.mockResolvedValueOnce({ data: f.pr })
        .mockResolvedValueOnce({ data: { ...f.pr, head: { ...f.pr.head, sha: "b".repeat(40) } } });
    }
    await finish(f);
    expect(f.github.rest.issues.createComment).not.toHaveBeenCalled();
    expect(f.github.rest.checks.update).toHaveBeenCalledWith(expect.objectContaining({
      output: expect.objectContaining({ title: "Historical investigation report published" }),
    }));
  });

  it("does not overwrite a newer managed comment or trust a user's copied marker", async () => {
    const f = fixture();
    f.prComments.push({ id: 1, user: { login: "user", type: "User" }, body: "<!-- governed-ci-investigation -->" });
    await finish(f);
    expect(f.github.rest.issues.createComment).toHaveBeenCalledTimes(1);
    f.prComments[1].body = "<!-- governed-ci-investigation -->\n<!-- source-run: 101:1 -->";
    await finish(f);
    expect(f.github.rest.issues.updateComment).not.toHaveBeenCalled();
  });

  it("fails closed when a paginated lookup is incomplete", async () => {
    const f = fixture();
    f.github.rest.checks.listForRef.mockResolvedValue({ data: { check_runs: Array.from({ length: 100 }, () => ({})) } } as never);
    await expect(start(f)).rejects.toThrow("lookup incomplete");
    expect(f.github.rest.checks.create).not.toHaveBeenCalled();
  });

  it("requires an exact occurrence marker rather than a substring", () => {
    expect(hasOccurrence(`<!-- ${marker} -->`, marker)).toBe(true);
    expect(hasOccurrence(marker + "0", marker)).toBe(false);
  });
});

describe("Explicit shared module review feedback", () => {
  it("accepts successful PR CI only in the explicit shared-module mode", async () => {
    const f = fixture("shared-module");
    const { mode: _mode, ...withoutMode } = f;
    await expect(start(withoutMode)).rejects.toThrow();
    expect(f.github.rest.checks.create).not.toHaveBeenCalled();
    await start(f);
    expect(f.github.rest.checks.create).toHaveBeenCalledWith(expect.objectContaining({
      name: "Shared Module Review", head_sha: sha,
      external_id: "demo/repo::100::1::shared-module",
      output: expect.objectContaining({ summary: expect.stringContaining("CI passed") }),
    }));
  });

  it.each(["failed-ci", "fork", "wrong-repository", "wrong-sha", "push", "wrong-workflow", "wrong-attempt", "wrong-base", "ambiguous-pr"])
    ("rejects %s before any shared module write", async variant => {
      const f = fixture("shared-module");
      if (variant === "failed-ci") f.run.conclusion = "failure";
      if (variant === "fork") f.run.head_repository.id = 9;
      if (variant === "wrong-repository") f.run.repository.id = 9;
      if (variant === "wrong-sha") f.run.head_sha = "b".repeat(40);
      if (variant === "push") f.run.event = "push";
      if (variant === "wrong-workflow") f.run.path = ".github/workflows/other.yml";
      if (variant === "wrong-attempt") f.run.run_attempt = 2;
      if (variant === "wrong-base") f.pr.base.ref = "other";
      if (variant === "ambiguous-pr") f.run.pull_requests.push({ number: 16, base: { ref: "main" } });
      await expect(start(f)).rejects.toThrow();
      expect(f.github.rest.checks.create).not.toHaveBeenCalled();
      expect(f.github.rest.issues.createComment).not.toHaveBeenCalled();
    });

  it("publishes a mode-specific report without saying healthy CI failed or that the change is approved", async () => {
    const f = fixture("shared-module");
    await finish(f);
    const body = f.github.rest.issues.createComment.mock.calls[0][0].body;
    expect(body).toContain("<!-- governed-shared-module-review -->");
    expect(body).toContain("Baseline CI passed");
    expect(body).toContain("not approval");
    expect(body).not.toContain("still failing");
    expect(body).not.toContain("governed-ci-investigation");
    expect(f.github.rest.checks.update).toHaveBeenCalledWith(expect.objectContaining({
      status: "completed", conclusion: "success",
      output: expect.objectContaining({ summary: expect.stringContaining("shared module finding still needs review") }),
    }));
  });

  it("uses a separate managed PR comment and check from the failure investigation", async () => {
    const f = fixture("shared-module");
    f.prComments.push({ id: 299, user: bot, body: "<!-- governed-ci-investigation -->\nExisting failure report" });
    f.github.rest.checks.listForRef.mockResolvedValue({ data: { check_runs: [{
      ...f.check, id: 199, name: "CI Investigation", external_id: "demo/repo::100::1",
    }] } } as never);
    await start(f);
    await finish(f);
    expect(f.github.rest.checks.create).toHaveBeenCalledTimes(1);
    expect(f.github.rest.issues.createComment).toHaveBeenCalledTimes(1);
    expect(f.github.rest.issues.updateComment).not.toHaveBeenCalled();
  });

  it.each(["failure-check", "failure-identity", "failure-issue-title", "failure-issue-label", "wrong-occurrence", "untrusted-evidence"])
    ("refuses %s for module review delivery", async variant => {
      const f = fixture("shared-module");
      if (variant === "failure-check") f.check.name = "CI Investigation";
      if (variant === "failure-identity") f.check.external_id = "demo/repo::100::1";
      if (variant === "failure-issue-title") f.issue.title = "[CI Failure] unrelated failure";
      if (variant === "failure-issue-label") f.issue.labels = [{ name: "ci-failure" }];
      if (variant === "wrong-occurrence") f.issue.body = "OCCURRENCE_KEY: demo/repo::99::1";
      if (variant === "untrusted-evidence") f.issue.user = { login: "user", type: "User" };
      await expect(finish(f)).rejects.toThrow();
      expect(f.github.rest.issues.createComment).not.toHaveBeenCalled();
    });

  it("finds a replayed module review through the mode-specific label and bot occurrence", async () => {
    const f = fixture("shared-module");
    f.delivery.createdIssue = "";
    f.issue.body = "Earlier module review occurrence";
    f.issueComments.push({ body: `<!-- ${marker} -->`, user: bot });
    await finish(f);
    await finish(f);
    expect(f.github.rest.issues.listForRepo).toHaveBeenCalledWith(expect.objectContaining({ labels: "shared-module-review" }));
    expect(f.github.rest.issues.createComment).toHaveBeenCalledTimes(1);
    expect(f.github.rest.issues.updateComment).not.toHaveBeenCalled();
  });

  it("keeps a stale successful source report off the current PR conversation", async () => {
    const f = fixture("shared-module");
    f.pr.head.sha = "b".repeat(40);
    await finish(f);
    expect(f.github.rest.issues.createComment).not.toHaveBeenCalled();
    expect(f.github.rest.checks.update).toHaveBeenCalledWith(expect.objectContaining({
      output: expect.objectContaining({ title: "Historical investigation report published" }),
    }));
  });

  it("rejects unknown modes rather than relaxing the source conclusion guard", async () => {
    const f = fixture();
    await expect(start({ ...f, mode: "success" })).rejects.toThrow("Unknown investigation feedback mode");
    expect(f.github.rest.actions.getWorkflowRunAttempt).not.toHaveBeenCalled();
    expect(f.github.rest.checks.create).not.toHaveBeenCalled();
  });
});

describe("verified prior report delivery recovery", () => {
  it("restores a missing PR comment from an existing report without claiming another investigation ran", async () => {
    const f = fixture("shared-module");
    const { mode: _mode, ...defaultSharedMode } = f;
    await recover(defaultSharedMode);
    expect(f.github.rest.issues.get.mock.invocationCallOrder[0])
      .toBeLessThan(f.github.rest.checks.create.mock.invocationCallOrder[0]);
    const body = f.github.rest.issues.createComment.mock.calls[0][0].body;
    expect(body).toContain("issue #15");
    expect(body).toContain("No new agent investigation or detection was run");
    expect(body).toContain("Baseline CI passed");
    expect(body).not.toContain("still failing");
    expect(f.github.rest.checks.update).toHaveBeenCalledWith(expect.objectContaining({
      conclusion: "success", output: expect.objectContaining({
        title: "Existing investigation report linked", summary: expect.stringContaining("no new agent investigation or detection was run"),
      }),
    }));
  });

  it("completes a previously in-progress check and creates only one managed PR comment on replay", async () => {
    const f = fixture("shared-module");
    f.check.status = "in_progress";
    f.github.rest.checks.listForRef.mockResolvedValue({ data: { check_runs: [f.check] } } as never);
    await recover(f);
    await recover(f);
    expect(f.github.rest.checks.create).not.toHaveBeenCalled();
    expect(f.github.rest.issues.createComment).toHaveBeenCalledTimes(1);
    expect(f.github.rest.issues.updateComment).not.toHaveBeenCalled();
    expect(f.github.rest.checks.update).toHaveBeenCalledWith(expect.objectContaining({ check_run_id: 200, conclusion: "success" }));
  });

  it.each(["no-report", "multiple-reports", "untrusted-occurrence", "wrong-mode-report", "wrong-occurrence"])
    ("rejects %s before creating a check or comment", async variant => {
      const f = fixture("shared-module");
      if (variant === "no-report") f.github.rest.issues.listForRepo.mockResolvedValue({ data: [] });
      if (variant === "multiple-reports") f.github.rest.issues.listForRepo.mockResolvedValue({ data: [f.issue, { ...f.issue, number: 16 }] });
      if (variant === "untrusted-occurrence") f.issue.user = { login: "user", type: "User" };
      if (variant === "wrong-mode-report") f.issue.title = "[CI Failure] previous failure";
      if (variant === "wrong-occurrence") f.issue.body = "OCCURRENCE_KEY: demo/repo::99::1";
      await expect(recover(f)).rejects.toThrow("No unique controlled report");
      expect(f.github.rest.checks.create).not.toHaveBeenCalled();
      expect(f.github.rest.checks.update).not.toHaveBeenCalled();
      expect(f.github.rest.issues.createComment).not.toHaveBeenCalled();
    });

  it.each(["fork", "wrong-sha", "failed-baseline", "wrong-attempt", "wrong-workflow"])
    ("rejects %s source before report lookup or writes", async variant => {
      const f = fixture("shared-module");
      if (variant === "fork") f.run.head_repository.id = 9;
      if (variant === "wrong-sha") f.run.head_sha = "b".repeat(40);
      if (variant === "failed-baseline") f.run.conclusion = "failure";
      if (variant === "wrong-attempt") f.run.run_attempt = 2;
      if (variant === "wrong-workflow") f.run.path = ".github/workflows/other.yml";
      await expect(recover(f)).rejects.toThrow();
      expect(f.github.rest.issues.listForRepo).not.toHaveBeenCalled();
      expect(f.github.rest.checks.create).not.toHaveBeenCalled();
      expect(f.github.rest.checks.update).not.toHaveBeenCalled();
    });

  it("does not reclassify failed original CI when explicitly recovering a failure report", async () => {
    const f = fixture();
    await recover(f);
    const body = f.github.rest.issues.createComment.mock.calls[0][0].body;
    expect(body).toContain("original CI checks are still failing");
    expect(body).not.toContain("Baseline CI passed");
    expect(f.github.rest.checks.update).toHaveBeenCalledWith(expect.objectContaining({
      conclusion: "success", output: expect.objectContaining({ summary: expect.stringContaining("CI remains failed") }),
    }));
  });

  it("keeps historical recovery off a PR that moved while preserving its historical check", async () => {
    const f = fixture("shared-module");
    f.pr.head.sha = "b".repeat(40);
    await recover(f);
    expect(f.github.rest.issues.createComment).not.toHaveBeenCalled();
    expect(f.github.rest.checks.update).toHaveBeenCalledWith(expect.objectContaining({
      output: expect.objectContaining({ title: "Historical investigation report linked" }),
    }));
  });

  it("fails delivery if a previously verified report loses its occurrence before publication", async () => {
    const f = fixture("shared-module");
    f.github.rest.issues.get.mockResolvedValueOnce({ data: { ...f.issue } })
      .mockResolvedValueOnce({ data: { ...f.issue, body: "Occurrence removed" } });
    await expect(recover(f)).rejects.toThrow("no longer verified");
    expect(f.github.rest.issues.createComment).not.toHaveBeenCalled();
    expect(f.github.rest.checks.update).toHaveBeenCalledWith(expect.objectContaining({ conclusion: "failure" }));
  });
});
