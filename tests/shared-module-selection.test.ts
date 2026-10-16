import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assessSharedModule, verifySharedModuleAssessment } from "../scripts/assess-shared-module.js";

const { createSelector } = createRequire(import.meta.url)("../scripts/select-shared-module-review.cjs");
const select = createSelector(verifySharedModuleAssessment);
const headSha = "a".repeat(40);
const testedSha = "b".repeat(40);
const baselineSha = "c".repeat(40);
const bot = { login: "github-actions[bot]", type: "Bot" };
const directories: string[] = [];
afterEach(() => directories.splice(0).forEach(directory => fs.rmSync(directory, { recursive: true, force: true })));

function fixture(repair = false) {
  const evidenceDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "module-select-test-"));
  directories.push(evidenceDirectory);
  // Deliberate demo edits must not turn fixture setup into an application-test failure.
  const originalModule = fs.readFileSync("infra/modules/hostingPlan.bicep", "utf8")
    .replace(/^param zoneRedundant bool = (true|false)$/m, "param zoneRedundant bool = true");
  const baseline = Buffer.from(repair ? originalModule.replace("param zoneRedundant bool = true", "param zoneRedundant bool = false") : originalModule);
  const candidate = Buffer.from(baseline.toString().replace(
    `param zoneRedundant bool = ${repair ? "false" : "true"}`, `param zoneRedundant bool = ${repair ? "true" : "false"}`));
  const baselineModule = path.join(evidenceDirectory, "baseline.bicep");
  const candidateModule = path.join(evidenceDirectory, "candidate.bicep");
  fs.writeFileSync(baselineModule, baseline);
  fs.writeFileSync(candidateModule, candidate);
  const report = assessSharedModule({
    baselineModule, candidateModule, registryFile: path.resolve("fixtures/shared-module-consumers/registry.json"),
    source: { repository: "demo/repo", runId: "100", runAttempt: "1", headSha, testedSha, baselineSha },
    templatesDirectory: path.join(evidenceDirectory, "consumer-templates"),
    compiler: (wrapperFile, outputFile) => {
      const module = fs.readFileSync(path.resolve(path.dirname(wrapperFile), "../module/hostingPlan.bicep"), "utf8");
      const wrapper = fs.readFileSync(wrapperFile, "utf8");
      fs.writeFileSync(outputFile, JSON.stringify({ resources: [{
        type: "Microsoft.Resources/deployments", name: "sampleHostingPlan",
        properties: {
          parameters: wrapper.includes("zoneRedundant: true") ? { zoneRedundant: { value: true } } : {},
          template: {
            parameters: { zoneRedundant: { type: "bool", defaultValue: module.includes("param zoneRedundant bool = true") } },
            resources: [{ type: "Microsoft.Web/serverfarms", properties: { zoneRedundant: "[parameters('zoneRedundant')]" } }],
          },
        },
      }] }));
    },
  });
  const reportFile = path.join(evidenceDirectory, "shared-module-assessment.json");
  const writeReport = () => fs.writeFileSync(reportFile, JSON.stringify(report));
  writeReport();
  const run: any = { id: 100, run_attempt: 1, repository: { id: 1 }, head_repository: { id: 1 },
    event: "pull_request", path: ".github/workflows/ci.yml", status: "completed", conclusion: "success",
    head_sha: headSha, head_branch: "feature/hosting-default", pull_requests: [{ number: 20, base: { ref: "main", sha: baselineSha } }],
  };
  const pr: any = { number: 20, state: "open", head: { sha: headSha, ref: run.head_branch, repo: { id: 1 } },
    base: { ref: "main", repo: { id: 1 } } };
  const contents: Record<string, Buffer> = { [baselineSha]: baseline, [headSha]: candidate };
  const issues: any[] = [];
  const comments: any[] = [];
  const github = { rest: {
    actions: { getWorkflowRunAttempt: vi.fn(async () => ({ data: run })) },
    pulls: { get: vi.fn(async () => ({ data: pr })) },
    repos: {
      getCommit: vi.fn(async ({ ref }: any) => ({ data: { sha: ref,
        parents: ref === testedSha ? [{ sha: baselineSha }, { sha: headSha }] : [{ sha: baselineSha }] } })),
      getContent: vi.fn(async ({ ref }: any) => ({ data: {
        type: "file", encoding: "base64", content: contents[ref].toString("base64"), size: contents[ref].length,
      } })),
    },
    issues: {
      listForRepo: vi.fn(async () => ({ data: issues })),
      listComments: vi.fn(async () => ({ data: comments })),
    },
  } };
  const context = { repo: { owner: "demo", repo: "repo" }, runId: 101, serverUrl: "https://github.com",
    payload: { workflow_run: { id: 100, run_attempt: 1, head_sha: headSha }, repository: { id: 1 } } };
  const core = { setOutput: vi.fn() };
  return { github, context, core, evidenceDirectory, run, pr, report, writeReport, reportFile, contents, issues, comments };
}

describe("trusted shared module selection before model use", () => {
  it("selects and independently verifies the registered consumer failure after successful baseline CI", async () => {
    const f = fixture();
    expect(await select(f)).toEqual({ selected: true, investigate: true, replay: false, reason: "consumer-requirement-failed" });
    expect(f.core.setOutput).toHaveBeenCalledWith("investigate", "true");
    expect(f.github.rest.repos.getContent.mock.calls.map(([args]) => args.ref)).toEqual([baselineSha, headSha]);
    expect(f.github.rest.repos.getCommit).toHaveBeenCalledWith(expect.objectContaining({ ref: testedSha }));
  });

  it("skips unrelated changes without reading an assessment artifact or calling the model", async () => {
    const f = fixture();
    f.contents[headSha] = f.contents[baselineSha];
    fs.rmSync(f.evidenceDirectory, { recursive: true });
    expect(await select(f)).toMatchObject({ selected: false, investigate: false, reason: "module-unchanged" });
    expect(f.github.rest.issues.listForRepo).not.toHaveBeenCalled();
  });

  it("skips stale source commits before fetching PR input files or reading artifacts", async () => {
    const f = fixture();
    f.pr.head.sha = "d".repeat(40);
    fs.rmSync(f.evidenceDirectory, { recursive: true });
    expect(await select(f)).toMatchObject({ selected: false, investigate: false, reason: "stale-source" });
    expect(f.github.rest.repos.getCommit).not.toHaveBeenCalled();
    expect(f.github.rest.repos.getContent).not.toHaveBeenCalled();
  });

  it.each(["failure", "fork", "wrong-workflow", "wrong-attempt"])("rejects %s metadata through the publisher source guard", async variant => {
    const f = fixture();
    if (variant === "failure") f.run.conclusion = "failure";
    if (variant === "fork") f.run.head_repository.id = 2;
    if (variant === "wrong-workflow") f.run.path = ".github/workflows/unrelated.yml";
    if (variant === "wrong-attempt") f.run.run_attempt = 2;
    await expect(select(f)).rejects.toThrow();
    expect(f.github.rest.repos.getContent).not.toHaveBeenCalled();
    expect(f.core.setOutput).not.toHaveBeenCalled();
  });

  it("accepts a run that tested the source head directly", async () => {
    const f = fixture();
    f.report.source.testedSha = headSha;
    f.writeReport();
    expect(await select(f)).toMatchObject({ investigate: true });
    expect(f.github.rest.repos.getCommit).toHaveBeenCalledTimes(1);
  });

  it("selects a changed module with healthy consumers without spending model credits", async () => {
    const f = fixture(true);
    expect(await select(f)).toEqual({ selected: true, investigate: false, replay: false, reason: "consumer-requirements-passed" });
    expect(f.github.rest.issues.listForRepo).not.toHaveBeenCalled();
  });

  it.each(["baseline", "source-commit", "tested-merge", "run", "digest", "consumer-template", "error-report"])
    ("fails closed on invalid %s binding", async variant => {
      const f = fixture();
      if (variant === "baseline") delete f.run.pull_requests[0].base.sha;
      if (variant === "source-commit") f.github.rest.repos.getCommit.mockResolvedValueOnce({ data: { sha: "d".repeat(40), parents: [] } });
      if (variant === "tested-merge") f.github.rest.repos.getCommit.mockImplementation(async ({ ref }: any) => ({ data: { sha: ref, parents: [{ sha: baselineSha }, { sha: "d".repeat(40) }] } }));
      if (variant === "run") f.report.source.runId = "99";
      if (variant === "digest") f.report.module.candidateDigest = "d".repeat(64);
      if (variant === "consumer-template") fs.writeFileSync(path.join(f.evidenceDirectory, "consumer-templates/candidate/sample-inherited-zone.json"), "{}");
      if (variant === "error-report") { f.report.status = "ERROR"; f.report.code = "SHARED_MODULE_EVIDENCE_INVALID"; f.report.unknowns.push("Compiler evidence missing"); }
      f.writeReport();
      await expect(select(f)).rejects.toThrow();
      expect(f.core.setOutput).not.toHaveBeenCalledWith("investigate", "true");
    });

  it.each(["source-size", "source-symlink", "artifact-size", "artifact-symlink", "template-size", "missing-template"])
    ("rejects unsafe %s before investigation", async variant => {
      const f = fixture();
      if (variant === "source-size") f.github.rest.repos.getContent.mockResolvedValueOnce({ data: { type: "file", encoding: "base64", size: 256 * 1024 + 1, content: "" } });
      if (variant === "source-symlink") f.github.rest.repos.getContent.mockResolvedValueOnce({ data: { type: "symlink", encoding: "base64", size: 1, content: "YQ==" } });
      if (variant === "artifact-size") fs.writeFileSync(f.reportFile, " ".repeat(128 * 1024 + 1));
      if (variant === "artifact-symlink") { fs.unlinkSync(f.reportFile); fs.symlinkSync(path.resolve("package.json"), f.reportFile); }
      const template = path.join(f.evidenceDirectory, "consumer-templates/candidate/sample-inherited-zone.json");
      if (variant === "template-size") fs.writeFileSync(template, " ".repeat(512 * 1024 + 1));
      if (variant === "missing-template") fs.unlinkSync(template);
      await expect(select(f)).rejects.toThrow();
      expect(f.core.setOutput).not.toHaveBeenCalledWith("investigate", "true");
    });

  it.each(["body", "comment"])("suppresses a paid replay using a verified bot %s occurrence", async location => {
    const f = fixture();
    const occurrence = "OCCURRENCE_KEY: demo/repo::100::1";
    f.issues.push({ number: 23, title: "[Module Review] registered consumer", labels: ["shared-module-review"],
      user: bot, body: location === "body" ? occurrence : "Earlier occurrence" });
    if (location === "comment") f.comments.push({ user: bot, body: `<!-- ${occurrence} -->` });
    expect(await select(f)).toEqual({ selected: true, investigate: false, replay: true, reason: "recorded-occurrence" });
  });

  it("does not trust a human's copied replay marker or a different occurrence", async () => {
    const f = fixture();
    f.issues.push({ number: 23, title: "[Module Review] registered consumer", labels: ["shared-module-review"],
      user: { login: "human", type: "User" }, body: "OCCURRENCE_KEY: demo/repo::100::1" });
    f.comments.push({ user: bot, body: "OCCURRENCE_KEY: demo/repo::100::10" });
    expect(await select(f)).toMatchObject({ investigate: true, replay: false });
  });

  it("fails closed when replay lookup is truncated", async () => {
    const f = fixture();
    f.github.rest.issues.listForRepo.mockResolvedValue({ data: Array.from({ length: 100 }, () => ({})) });
    await expect(select(f)).rejects.toThrow("lookup incomplete");
    expect(f.core.setOutput).toHaveBeenCalledWith("selected", "true");
    expect(f.core.setOutput).not.toHaveBeenCalledWith("investigate", "true");
  });
});
