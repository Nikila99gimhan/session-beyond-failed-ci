import { createHash } from "node:crypto";

export interface OccurrenceInput {
  repository: string;
  runId: number;
  runAttempt: number;
  headSha: string;
  failedJob: string;
  policyVersion: string;
  accountScope?: string;
}

export interface RootCauseInput {
  organization: string;
  service: string;
  environment: string;
  ruleIds: string[];
  policyVersion: string;
}

export interface TriageEvent {
  occurrence: OccurrenceInput;
  rootCause: RootCauseInput;
  conclusion: "success" | "failure" | "cancelled" | "timed_out";
}

export interface CanonicalIssue {
  id: string;
  rootCauseFingerprint: string;
  occurrences: Set<string>;
  recordedAccounts: Set<string>;
  history: Array<{
    occurrenceKey: string;
    runId: number;
    runAttempt: number;
    headSha: string;
    accountScope?: string;
    recordedAt: string;
  }>;
}

export type TriageDecision =
  | { action: "SKIP_CANCELLED"; reason: string }
  | { action: "SKIP_EXACT_REPLAY"; reason: string; occurrenceKey: string }
  | { action: "CREATE_CANONICAL"; canonicalId: string; occurrenceKey: string; rootCauseFingerprint: string }
  | { action: "UPDATE_CANONICAL"; canonicalId: string; occurrenceKey: string; rootCauseFingerprint: string; isNewAccount: boolean };

/**
 * Computes a unique, deterministic Occurrence Key.
 * Binds strictly to repository + run_id + run_attempt + head_sha + failed_job + policy_version.
 * An exact replay of the same run attempt produces the identical key.
 * A new run on the same headSha produces a DIFFERENT occurrence key.
 */
export function computeOccurrenceKey(input: OccurrenceInput): string {
  const payload = [
    input.repository.toLowerCase(),
    input.runId,
    input.runAttempt,
    input.headSha.toLowerCase(),
    input.failedJob.toLowerCase(),
    input.policyVersion,
    input.accountScope || "default",
  ].join("::");
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Computes a Root-Cause Fingerprint for grouping canonical incidents across runs and accounts.
 * Binds to organization + service + environment + sorted rule IDs + policy version.
 */
export function computeRootCauseFingerprint(input: RootCauseInput): string {
  const sortedRules = [...input.ruleIds].sort().join(",");
  const payload = [
    input.organization.toLowerCase(),
    input.service.toLowerCase(),
    input.environment.toLowerCase(),
    sortedRules,
    input.policyVersion,
  ].join("::");
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * In-memory thread-safe issue store simulating GitHub Issues canonical storage.
 */
export class IssueStore {
  private issues = new Map<string, CanonicalIssue>();
  private nextId = 1;

  public getByFingerprint(fingerprint: string): CanonicalIssue | undefined {
    return this.issues.get(fingerprint);
  }

  public getAll(): CanonicalIssue[] {
    return Array.from(this.issues.values());
  }

  public create(fingerprint: string, occurrenceKey: string, occurrence: OccurrenceInput): CanonicalIssue {
    const issue: CanonicalIssue = {
      id: `ISSUE-${this.nextId++}`,
      rootCauseFingerprint: fingerprint,
      occurrences: new Set([occurrenceKey]),
      recordedAccounts: new Set(occurrence.accountScope ? [occurrence.accountScope] : []),
      history: [
        {
          occurrenceKey,
          runId: occurrence.runId,
          runAttempt: occurrence.runAttempt,
          headSha: occurrence.headSha,
          accountScope: occurrence.accountScope,
          recordedAt: new Date().toISOString(),
        },
      ],
    };
    this.issues.set(fingerprint, issue);
    return issue;
  }

  public addOccurrence(fingerprint: string, occurrenceKey: string, occurrence: OccurrenceInput): boolean {
    const issue = this.issues.get(fingerprint);
    if (!issue) return false;
    if (issue.occurrences.has(occurrenceKey)) {
      return false; // Already present
    }
    issue.occurrences.add(occurrenceKey);
    if (occurrence.accountScope) {
      issue.recordedAccounts.add(occurrence.accountScope);
    }
    issue.history.push({
      occurrenceKey,
      runId: occurrence.runId,
      runAttempt: occurrence.runAttempt,
      headSha: occurrence.headSha,
      accountScope: occurrence.accountScope,
      recordedAt: new Date().toISOString(),
    });
    return true;
  }
}

/**
 * Evaluates an incoming CI triage event with strict idempotency and deterministic skip gates.
 */
export function evaluateTriageEvent(event: TriageEvent, store: IssueStore): TriageDecision {
  // Gate 1: Deterministic skip for cancelled runs
  if (event.conclusion === "cancelled") {
    return {
      action: "SKIP_CANCELLED",
      reason: `Workflow run #${event.occurrence.runId} (attempt #${event.occurrence.runAttempt}) was cancelled by user; non-actionable.`,
    };
  }

  // Gate 2: Compute cryptographic keys
  const occurrenceKey = computeOccurrenceKey(event.occurrence);
  const fingerprint = computeRootCauseFingerprint(event.rootCause);

  const existingIssue = store.getByFingerprint(fingerprint);

  if (!existingIssue) {
    const created = store.create(fingerprint, occurrenceKey, event.occurrence);
    return {
      action: "CREATE_CANONICAL",
      canonicalId: created.id,
      occurrenceKey,
      rootCauseFingerprint: fingerprint,
    };
  }

  // Gate 3: Exact replay check (same run ID + attempt)
  if (existingIssue.occurrences.has(occurrenceKey)) {
    return {
      action: "SKIP_EXACT_REPLAY",
      reason: `Exact replay detected for occurrence key ${occurrenceKey.substring(0, 12)} (Run #${event.occurrence.runId}, attempt #${event.occurrence.runAttempt}). Already recorded in ${existingIssue.id}.`,
      occurrenceKey,
    };
  }

  // Gate 4: New occurrence for existing root cause (e.g. rerun, new attempt, or distinct account)
  const isNewAccount = event.occurrence.accountScope
    ? !existingIssue.recordedAccounts.has(event.occurrence.accountScope)
    : false;

  store.addOccurrence(fingerprint, occurrenceKey, event.occurrence);

  return {
    action: "UPDATE_CANONICAL",
    canonicalId: existingIssue.id,
    occurrenceKey,
    rootCauseFingerprint: fingerprint,
    isNewAccount,
  };
}
