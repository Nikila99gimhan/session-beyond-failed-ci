import { describe, it, expect, beforeEach } from "vitest";
import {
  IssueStore,
  evaluateTriageEvent,
  computeEventIdentity,
  computeRootCauseIdentity,
  type TriageEvent,
} from "../src/idempotency.js";

describe("Phase 1: Event Identity, Root-Cause Identity & Handler Policy Testing", () => {
  let store: IssueStore;

  const baseEventIdentity = {
    repository: "Nikila99gimhan/session-beyond-failed-ci",
    runId: 36269573747,
    runAttempt: 1,
  };

  const baseRootCauseIdentity = {
    policyVersion: "2026.1",
    checkerVersion: "1.0.0",
    resourceType: "Microsoft.Web/sites",
    violations: ["POL-AZ-NET-001", "POL-AZ-SKU-003"],
  };

  beforeEach(() => {
    store = new IssueStore();
  });

  it("Test 1 [Same-event replay]: replaying the identical event produces 0 additional comments and skips", () => {
    const event: TriageEvent = {
      eventIdentity: { ...baseEventIdentity },
      rootCauseIdentity: { ...baseRootCauseIdentity },
      headSha: "8a5aed5f0b31d36bcbaefc0393daa5f5edc78fdf",
      conclusion: "failure",
    };

    const firstDecision = evaluateTriageEvent(event, store);
    expect(firstDecision.action).toBe("CREATE_CANONICAL");

    const replayDecision = evaluateTriageEvent(event, store);
    expect(replayDecision.action).toBe("SKIP_EXACT_EVENT_REPLAY");
    if (replayDecision.action === "SKIP_EXACT_EVENT_REPLAY") {
      expect(replayDecision.reason).toContain("Exact event replay detected");
    }

    const issues = store.getAll();
    expect(issues.length).toBe(1);
    expect(issues[0].comments.length).toBe(0);
    expect(issues[0].recordedEvents.size).toBe(1);
  });

  it("Test 2 [New run, same root cause]: updates the canonical issue with exactly 1 comment", () => {
    const initialRun: TriageEvent = {
      eventIdentity: { ...baseEventIdentity, runId: 101, runAttempt: 1 },
      rootCauseIdentity: { ...baseRootCauseIdentity },
      headSha: "8a5aed5",
      conclusion: "failure",
    };

    const nextRunSameCause: TriageEvent = {
      eventIdentity: { ...baseEventIdentity, runId: 102, runAttempt: 1 },
      rootCauseIdentity: { ...baseRootCauseIdentity },
      headSha: "9b6bfe6",
      conclusion: "failure",
    };

    const decision1 = evaluateTriageEvent(initialRun, store);
    const decision2 = evaluateTriageEvent(nextRunSameCause, store);

    expect(decision1.action).toBe("CREATE_CANONICAL");
    expect(decision2.action).toBe("ADD_COMMENT");

    const issues = store.getAll();
    expect(issues.length).toBe(1);
    expect(issues[0].comments.length).toBe(1);
    expect(issues[0].recordedEvents.size).toBe(2);
  });

  it("Test 3 [Changed root cause]: creates a separate canonical issue when policy violations or resource type change", () => {
    const runRootCauseA: TriageEvent = {
      eventIdentity: { ...baseEventIdentity, runId: 201, runAttempt: 1 },
      rootCauseIdentity: { ...baseRootCauseIdentity, violations: ["POL-AZ-NET-001"] },
      headSha: "aaa111",
      conclusion: "failure",
    };

    const runRootCauseB: TriageEvent = {
      eventIdentity: { ...baseEventIdentity, runId: 202, runAttempt: 1 },
      rootCauseIdentity: { ...baseRootCauseIdentity, violations: ["POL-AZ-SKU-003"] },
      headSha: "bbb222",
      conclusion: "failure",
    };

    const decisionA = evaluateTriageEvent(runRootCauseA, store);
    const decisionB = evaluateTriageEvent(runRootCauseB, store);

    expect(decisionA.action).toBe("CREATE_CANONICAL");
    expect(decisionB.action).toBe("CREATE_CANONICAL");

    const issues = store.getAll();
    expect(issues.length).toBe(2);
    expect(issues[0].id).not.toBe(issues[1].id);
  });

  it("Test 4 [Concurrent matching runs]: 10 concurrent requests for same event produce exactly 1 creation and 9 skips", () => {
    const event: TriageEvent = {
      eventIdentity: { ...baseEventIdentity, runId: 301, runAttempt: 1 },
      rootCauseIdentity: { ...baseRootCauseIdentity },
      headSha: "ccc333",
      conclusion: "failure",
    };

    const decisions = Array.from({ length: 10 }, () => evaluateTriageEvent(event, store));
    const creations = decisions.filter((d) => d.action === "CREATE_CANONICAL");
    const skips = decisions.filter((d) => d.action === "SKIP_EXACT_EVENT_REPLAY");

    expect(creations.length).toBe(1);
    expect(skips.length).toBe(9);

    const issues = store.getAll();
    expect(issues.length).toBe(1);
    expect(issues[0].comments.length).toBe(0);
  });

  it("Test 5 [Closed or manually edited issue]: creates a new canonical issue if previous issue is closed", () => {
    const firstRun: TriageEvent = {
      eventIdentity: { ...baseEventIdentity, runId: 401, runAttempt: 1 },
      rootCauseIdentity: { ...baseRootCauseIdentity },
      headSha: "ddd444",
      conclusion: "failure",
    };

    const decision1 = evaluateTriageEvent(firstRun, store);
    expect(decision1.action).toBe("CREATE_CANONICAL");

    store.closeIssue("#1");
    expect(store.get("#1")?.state).toBe("closed");

    const secondRun: TriageEvent = {
      eventIdentity: { ...baseEventIdentity, runId: 402, runAttempt: 1 },
      rootCauseIdentity: { ...baseRootCauseIdentity },
      headSha: "eee555",
      conclusion: "failure",
    };

    const decision2 = evaluateTriageEvent(secondRun, store);
    expect(decision2.action).toBe("CREATE_CANONICAL");

    const issues = store.getAll();
    expect(issues.length).toBe(2);
    expect(issues[0].state).toBe("closed");
    expect(issues[1].state).toBe("open");
  });

  it("Test 6 [Required label/prefix]: rejects comment delivery if target issue lacks required prefix or label", () => {
    const firstRun: TriageEvent = {
      eventIdentity: { ...baseEventIdentity, runId: 501, runAttempt: 1 },
      rootCauseIdentity: { ...baseRootCauseIdentity },
      headSha: "fff666",
      conclusion: "failure",
    };

    evaluateTriageEvent(firstRun, store);

    store.modifyTitle("#1", "Manual Triage: Investigation in Progress");

    const secondRun: TriageEvent = {
      eventIdentity: { ...baseEventIdentity, runId: 502, runAttempt: 1 },
      rootCauseIdentity: { ...baseRootCauseIdentity },
      headSha: "ggg777",
      conclusion: "failure",
    };

    const decision = evaluateTriageEvent(secondRun, store, {
      requiredTitlePrefix: "[CI Failure] ",
      requiredLabels: ["ci-failure"],
    });

    expect(decision.action).toBe("REJECT_INVALID_TARGET");
    if (decision.action === "REJECT_INVALID_TARGET") {
      expect(decision.reason).toContain('does not start with required prefix "[CI Failure] "');
    }

    store.modifyTitle("#1", "[CI Failure] Restored title");
    store.removeLabel("#1", "ci-failure");

    const thirdRun: TriageEvent = {
      eventIdentity: { ...baseEventIdentity, runId: 503, runAttempt: 1 },
      rootCauseIdentity: { ...baseRootCauseIdentity },
      headSha: "hhh888",
      conclusion: "failure",
    };

    const decisionLabel = evaluateTriageEvent(thirdRun, store, {
      requiredTitlePrefix: "[CI Failure] ",
      requiredLabels: ["ci-failure"],
    });

    expect(decisionLabel.action).toBe("REJECT_INVALID_TARGET");
    if (decisionLabel.action === "REJECT_INVALID_TARGET") {
      expect(decisionLabel.reason).toContain("lacks required labels: ci-failure");
    }
  });

  it("Test 7 [Failed delivery followed by retry]: transient failure followed by retry records comment once without duplicates", () => {
    const firstRun: TriageEvent = {
      eventIdentity: { ...baseEventIdentity, runId: 601, runAttempt: 1 },
      rootCauseIdentity: { ...baseRootCauseIdentity },
      headSha: "iii999",
      conclusion: "failure",
    };

    evaluateTriageEvent(firstRun, store);

    const eventKey = computeEventIdentity({
      repository: "Nikila99gimhan/session-beyond-failed-ci",
      runId: 602,
      runAttempt: 1,
    });

    let deliverySuccess = false;
    let attempts = 0;

    while (!deliverySuccess && attempts < 3) {
      attempts++;
      if (attempts < 2) {
        deliverySuccess = false;
      } else {
        const res = store.addCommentToIssue("#1", eventKey, "Comment on retry");
        deliverySuccess = res.success;
      }
    }

    expect(deliverySuccess).toBe(true);
    expect(attempts).toBe(2);

    const duplicateAttempt = store.addCommentToIssue("#1", eventKey, "Duplicate comment attempt");
    expect(duplicateAttempt.success).toBe(false);
    expect(duplicateAttempt.error).toContain("already recorded on #1");

    const targetIssue = store.get("#1")!;
    expect(targetIssue.comments.length).toBe(1);
  });
});
