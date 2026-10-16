import * as fs from "node:fs";
import { describe, expect, it } from "vitest";

type Job = { result: string; outputs: Record<string, string> };
type Needs = Record<string, Job>;
const observed = JSON.parse(fs.readFileSync("tests/fixtures/shared-review-skipped-jobs.json", "utf8"));
const workflow = fs.readFileSync(".github/workflows/shared-module-investigator.lock.yml", "utf8");
const start = workflow.indexOf("\n  agent:\n");
if (start < 0) throw new Error("Compiled agent job missing");
const afterStart = workflow.slice(start + "\n  agent:\n".length);
const nextJob = afterStart.search(/^  [a-z_]+:/m);
const agent = nextJob < 0 ? afterStart : afterStart.slice(0, nextJob);
const dependencies = [...(agent.match(/^    needs:\n((?:      - [a-z_]+\n)+)/m)?.[1] || "")
  .matchAll(/- ([a-z_]+)/g)].map(match => match[1]);
const expression = agent.match(/^    if: ([\s\S]*?)\n    runs-on:/m)?.[1]
  .replace(/^>\s*\n/, "").split("\n").map(line => line.trim()).join(" ").trim();
if (!expression || !dependencies.length) throw new Error("Unrecognized compiled job header");

// This bounded model covers the boolean predicate used by this compiled job.
// It is not a GitHub runner emulator; the live end-to-end run remains a release gate.
// GitHub adds success() when an if expression contains no status-check function.
function eligible(condition: string, needs: Needs, cancelled = false): boolean {
  if (!/^[A-Za-z0-9_.\s'()!<=>&|]+$/.test(condition)) throw new Error("Unsupported condition syntax");
  const success = () => dependencies.every(name => needs[name]?.result === "success");
  if (!/\b(?:always|cancelled|success|failure)\s*\(/.test(condition) && !success()) return false;
  return Boolean(Function("needs", "always", "cancelled", "success", `"use strict"; return (${condition});`)(
    needs, () => true, () => cancelled, success));
}
const fresh = (): Needs => structuredClone(observed.needs);

describe("Compiled shared-module workflow gating", () => {
  it("reproduces the live failure caused by implicit success on skipped optional jobs", () => {
    expect(eligible(observed.previousCompiledCondition, fresh())).toBe(false);
  });

  it("starts a verified finding when optional status and recovery jobs intentionally skip", () => {
    expect(dependencies).toContain("activation");
    expect(dependencies).toContain("select_review");
    expect(eligible(expression!, fresh())).toBe(true);
  });

  it.each(["failure", "skipped", "cancelled"])("does not bypass %s activation", result => {
    const needs = fresh(); needs.activation.result = result;
    expect(eligible(expression!, needs)).toBe(false);
  });

  it.each(["failure", "skipped", "cancelled"])("does not bypass %s evidence selection", result => {
    const needs = fresh(); needs.select_review.result = result;
    expect(eligible(expression!, needs)).toBe(false);
  });

  it.each(["false", ""])("skips model execution without an affirmative finding (%s)", investigate => {
    const needs = fresh(); needs.select_review.outputs.investigate = investigate;
    expect(eligible(expression!, needs)).toBe(false);
  });

  it("preserves the compiler's daily credit guard", () => {
    const needs = fresh(); needs.activation.outputs.daily_ai_credits_exceeded = "true";
    expect(eligible(expression!, needs)).toBe(false);
  });

  it("does not start model execution on cancellation", () => {
    expect(eligible(expression!, fresh(), true)).toBe(false);
  });
});
