import { createHash } from "node:crypto";

/**
 * Event Identity: Binds strictly to repository + CI run ID + run attempt.
 * Used to detect exact event replays.
 */
export interface EventIdentityInput {
  repository: string;
  runId: number;
  runAttempt: number;
}

/**
 * Root-Cause Identity: Binds to versioned policy/checker identity + affected resource + violations.
 * Used to group incidents under canonical tracking.
 */
export interface RootCauseIdentityInput {
  policyVersion: string;
  checkerVersion: string;
  resourceType: string;
  violations: string[]; // e.g. ["POL-AZ-NET-001", "POL-AZ-SKU-003"]
}

export interface TriageEvent {
  eventIdentity: EventIdentityInput;
  rootCauseIdentity: RootCauseIdentityInput;
  headSha: string;
  conclusion: "success" | "failure" | "cancelled" | "timed_out";
  accountScope?: string;
}

export interface CanonicalIssue {
  id: string;
  title: string;
  state: "open" | "closed";
  labels: string[];
  rootCauseIdentityKey: string;
  recordedEvents: Set<string>; // Event Identity keys
  comments: Array<{
    id: string;
    eventKey: string;
    body: string;
    createdAt: string;
  }>;
}

export type TriageDecision =
  | { action: "SKIP_CANCELLED"; reason: string }
  | { action: "SKIP_EXACT_EVENT_REPLAY"; reason: string; eventKey: string }
  | { action: "REJECT_INVALID_TARGET"; reason: string; issueId: string }
  | { action: "CREATE_CANONICAL"; canonicalId: string; eventKey: string; rootCauseKey: string }
  | { action: "ADD_COMMENT"; canonicalId: string; eventKey: string; commentId: string };

/**
 * Computes deterministic Event Identity key: sha256(repository + runId + attempt).
 */
export function computeEventIdentity(input: EventIdentityInput): string {
  const payload = [
    input.repository.toLowerCase().trim(),
    input.runId,
    input.runAttempt,
  ].join("::");
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Computes deterministic Root-Cause Identity key: sha256(policyVersion + checkerVersion + resourceType + sortedViolations).
 */
export function computeRootCauseIdentity(input: RootCauseIdentityInput): string {
  const sortedViolations = [...input.violations].sort().join(",");
  const payload = [
    input.policyVersion.trim(),
    input.checkerVersion.trim(),
    input.resourceType.toLowerCase().trim(),
    sortedViolations,
  ].join("::");
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Simulated GitHub Issue Store with Safe-Output policy enforcement.
 */
export class IssueStore {
  private issues = new Map<string, CanonicalIssue>();
  private rootCauseIndex = new Map<string, string>();
  private nextIssueNumber = 1;
  private nextCommentId = 100;

  public get(id: string): CanonicalIssue | undefined {
    return this.issues.get(id);
  }

  public getAll(): CanonicalIssue[] {
    return Array.from(this.issues.values());
  }

  public getByRootCause(rootCauseKey: string): CanonicalIssue | undefined {
    const issueId = this.rootCauseIndex.get(rootCauseKey);
    if (!issueId) return undefined;
    return this.issues.get(issueId);
  }

  public createCanonicalIssue(
    rootCauseKey: string,
    eventKey: string,
    title: string,
    labels: string[] = ["ci-failure", "governance"]
  ): CanonicalIssue {
    const id = `#${this.nextIssueNumber++}`;
    const issue: CanonicalIssue = {
      id,
      title: title.startsWith("[CI Failure] ") ? title : `[CI Failure] ${title}`,
      state: "open",
      labels,
      rootCauseIdentityKey: rootCauseKey,
      recordedEvents: new Set([eventKey]),
      comments: [],
    };
    this.issues.set(id, issue);
    this.rootCauseIndex.set(rootCauseKey, id);
    return issue;
  }

  public addCommentToIssue(
    issueId: string,
    eventKey: string,
    body: string,
    constraints?: { requiredTitlePrefix?: string; requiredLabels?: string[] }
  ): { success: boolean; commentId?: string; error?: string } {
    const issue = this.issues.get(issueId);
    if (!issue) {
      return { success: false, error: `Issue ${issueId} not found` };
    }

    if (issue.state !== "open") {
      return { success: false, error: `Target issue ${issueId} is closed` };
    }

    if (constraints?.requiredTitlePrefix && !issue.title.startsWith(constraints.requiredTitlePrefix)) {
      return {
        success: false,
        error: `Target issue ${issueId} title "${issue.title}" does not start with required prefix "${constraints.requiredTitlePrefix}"`,
      };
    }

    if (constraints?.requiredLabels && constraints.requiredLabels.length > 0) {
      const hasAllLabels = constraints.requiredLabels.every((label) => issue.labels.includes(label));
      if (!hasAllLabels) {
        return {
          success: false,
          error: `Target issue ${issueId} lacks required labels: ${constraints.requiredLabels.join(", ")}`,
        };
      }
    }

    if (issue.recordedEvents.has(eventKey)) {
      return { success: false, error: `Event ${eventKey.substring(0, 10)} already recorded on ${issueId}` };
    }

    const commentId = `comment-${this.nextCommentId++}`;
    issue.recordedEvents.add(eventKey);
    issue.comments.push({
      id: commentId,
      eventKey,
      body,
      createdAt: new Date().toISOString(),
    });

    return { success: true, commentId };
  }

  public closeIssue(id: string): void {
    const issue = this.issues.get(id);
    if (issue) issue.state = "closed";
  }

  public modifyTitle(id: string, newTitle: string): void {
    const issue = this.issues.get(id);
    if (issue) issue.title = newTitle;
  }

  public removeLabel(id: string, labelToRemove: string): void {
    const issue = this.issues.get(id);
    if (issue) issue.labels = issue.labels.filter((l) => l !== labelToRemove);
  }
}

/**
 * Evaluates an incoming triage event against the safe-output handler rules.
 */
export function evaluateTriageEvent(
  event: TriageEvent,
  store: IssueStore,
  constraints: { requiredTitlePrefix: string; requiredLabels: string[] } = {
    requiredTitlePrefix: "[CI Failure] ",
    requiredLabels: ["ci-failure"],
  }
): TriageDecision {
  if (event.conclusion === "cancelled") {
    return {
      action: "SKIP_CANCELLED",
      reason: `Workflow run #${event.eventIdentity.runId} (attempt #${event.eventIdentity.runAttempt}) was cancelled; non-actionable.`,
    };
  }

  const eventKey = computeEventIdentity(event.eventIdentity);
  const rootCauseKey = computeRootCauseIdentity(event.rootCauseIdentity);

  const existingIssue = store.getByRootCause(rootCauseKey);

  if (!existingIssue || existingIssue.state === "closed") {
    const newIssue = store.createCanonicalIssue(
      rootCauseKey,
      eventKey,
      `[CI Failure] Policy Regression: ${event.rootCauseIdentity.violations.join(", ")} in ${event.rootCauseIdentity.resourceType}`,
      ["ci-failure", "governance"]
    );
    return {
      action: "CREATE_CANONICAL",
      canonicalId: newIssue.id,
      eventKey,
      rootCauseKey,
    };
  }

  if (existingIssue.recordedEvents.has(eventKey)) {
    return {
      action: "SKIP_EXACT_EVENT_REPLAY",
      reason: `Exact event replay detected (Run #${event.eventIdentity.runId}, Attempt #${event.eventIdentity.runAttempt}). Already recorded on ${existingIssue.id}.`,
      eventKey,
    };
  }

  const commentResult = store.addCommentToIssue(
    existingIssue.id,
    eventKey,
    `New failure occurrence in Run #${event.eventIdentity.runId} (Attempt #${event.eventIdentity.runAttempt}) on ${event.headSha}`,
    constraints
  );

  if (!commentResult.success) {
    return {
      action: "REJECT_INVALID_TARGET",
      reason: commentResult.error || "Failed to add comment",
      issueId: existingIssue.id,
    };
  }

  return {
    action: "ADD_COMMENT",
    canonicalId: existingIssue.id,
    eventKey,
    commentId: commentResult.commentId!,
  };
}
