import { describe, it, expect, beforeEach } from "vitest";
import {
  IssueStore,
  evaluateTriageEvent,
  computeOccurrenceKey,
  computeRootCauseFingerprint,
  type TriageEvent,
} from "../src/idempotency.js";

describe("Triage Idempotency & Replay Verification", () => {
  let store: IssueStore;

  const baseOccurrence = {
    repository: "Nikila99gimhan/session-beyond-failed-ci",
    runId: 10501,
    runAttempt: 1,
    headSha: "fc8d28c78c3bcfd36a3c63952f9dd7b0dd8d103b",
    failedJob: "deployment-policy",
    policyVersion: "2026.1",
    accountScope: "sub-prod-eastus-01",
  };

  const baseRootCause = {
    organization: "enterprise-cloud-platform",
    service: "azure-functions-service",
    environment: "production",
    ruleIds: ["POL-AZ-NET-001", "POL-AZ-SKU-003"],
    policyVersion: "2026.1",
  };

  beforeEach(() => {
    store = new IssueStore();
  });

  it("should create exactly one canonical issue on initial failure", () => {
    const event: TriageEvent = {
      occurrence: { ...baseOccurrence },
      rootCause: { ...baseRootCause },
      conclusion: "failure",
    };

    const decision = evaluateTriageEvent(event, store);
    expect(decision.action).toBe("CREATE_CANONICAL");
    if (decision.action === "CREATE_CANONICAL") {
      expect(decision.canonicalId).toBe("ISSUE-1");
    }

    const allIssues = store.getAll();
    expect(allIssues.length).toBe(1);
    expect(allIssues[0].occurrences.size).toBe(1);
  });

  it("should skip cancelled runs deterministically with a logged reason", () => {
    const event: TriageEvent = {
      occurrence: { ...baseOccurrence },
      rootCause: { ...baseRootCause },
      conclusion: "cancelled",
    };

    const decision = evaluateTriageEvent(event, store);
    expect(decision.action).toBe("SKIP_CANCELLED");
    if (decision.action === "SKIP_CANCELLED") {
      expect(decision.reason).toContain("cancelled by user; non-actionable");
    }

    // Zero issues created in store
    expect(store.getAll().length).toBe(0);
  });

  it("should handle 10 concurrent replays of the same occurrence: exactly 1 canonical issue, 9 skipped", () => {
    const event: TriageEvent = {
      occurrence: { ...baseOccurrence },
      rootCause: { ...baseRootCause },
      conclusion: "failure",
    };

    const decisions = [];
    for (let i = 0; i < 10; i++) {
      decisions.push(evaluateTriageEvent(event, store));
    }

    const creations = decisions.filter((d) => d.action === "CREATE_CANONICAL");
    const exactReplaySkips = decisions.filter((d) => d.action === "SKIP_EXACT_REPLAY");

    expect(creations.length).toBe(1);
    expect(exactReplaySkips.length).toBe(9);

    const issues = store.getAll();
    expect(issues.length).toBe(1);
    expect(issues[0].occurrences.size).toBe(1);
    expect(issues[0].history.length).toBe(1);
  });

  it("should group two distinct accounts affected by the same rule into ONE canonical issue with two recorded occurrences", () => {
    const eventAccountA: TriageEvent = {
      occurrence: {
        ...baseOccurrence,
        runId: 20101,
        accountScope: "sub-prod-eastus-01",
      },
      rootCause: { ...baseRootCause },
      conclusion: "failure",
    };

    const eventAccountB: TriageEvent = {
      occurrence: {
        ...baseOccurrence,
        runId: 20102,
        accountScope: "sub-prod-westus-02",
      },
      rootCause: { ...baseRootCause },
      conclusion: "failure",
    };

    const decisionA = evaluateTriageEvent(eventAccountA, store);
    const decisionB = evaluateTriageEvent(eventAccountB, store);

    expect(decisionA.action).toBe("CREATE_CANONICAL");
    expect(decisionB.action).toBe("UPDATE_CANONICAL");

    const issues = store.getAll();
    expect(issues.length).toBe(1);
    expect(issues[0].recordedAccounts.size).toBe(2);
    expect(issues[0].recordedAccounts.has("sub-prod-eastus-01")).toBe(true);
    expect(issues[0].recordedAccounts.has("sub-prod-westus-02")).toBe(true);
    expect(issues[0].occurrences.size).toBe(2);
  });

  it("should NOT skip a new run on the SAME commit SHA (new runId or attempt)", () => {
    const initialRun: TriageEvent = {
      occurrence: {
        ...baseOccurrence,
        runId: 30101,
        runAttempt: 1,
      },
      rootCause: { ...baseRootCause },
      conclusion: "failure",
    };

    const rerunOnSameSha: TriageEvent = {
      occurrence: {
        ...baseOccurrence,
        runId: 30101,
        runAttempt: 2, // New attempt on the same SHA
      },
      rootCause: { ...baseRootCause },
      conclusion: "failure",
    };

    const decision1 = evaluateTriageEvent(initialRun, store);
    const decision2 = evaluateTriageEvent(rerunOnSameSha, store);

    expect(decision1.action).toBe("CREATE_CANONICAL");
    expect(decision2.action).toBe("UPDATE_CANONICAL"); // NOT skipped!

    const issues = store.getAll();
    expect(issues.length).toBe(1);
    expect(issues[0].occurrences.size).toBe(2);
    expect(issues[0].history.length).toBe(2);
  });

  it("should produce distinct Occurrence Keys for different run attempts on the same commit SHA", () => {
    const keyAttempt1 = computeOccurrenceKey({
      ...baseOccurrence,
      runAttempt: 1,
    });

    const keyAttempt2 = computeOccurrenceKey({
      ...baseOccurrence,
      runAttempt: 2,
    });

    expect(keyAttempt1).not.toBe(keyAttempt2);
  });
});
