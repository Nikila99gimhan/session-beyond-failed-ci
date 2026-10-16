# When CI Fails — onstage cue sheet

**35 minutes · Nikila Fernando · 16 October 2026**  
Use with `SESSION-EVENT-FLOW.md` and `SESSION-SPEAKER-NOTES.md`.

## Before the audience arrives

- Open the final deck and six bookmark groups: source PRs, CI, investigations, issue/PR delivery, evidence/MCP, module consumers.
- Verify both PR heads match the prepared evidence ledger.
- Use completed runs. Keep same-run screenshots/artifacts available offline.
- Keep the intentional changes on separate feature branches; leave required CI protection active.
- Check the slide notes, browser zoom and time display. No dependency downloads or fresh paid runs onstage.

## 00:00–06:00 — establish the question

- **1 · Title:** “Keep CI deterministic. Investigate selected questions.”
- **2 · Problem:** tests/logs/context are scattered; engineers often copy fragments into chat.
- **3 · Map:** two cases: red CI with two causes; green root with a shared-default question.
- **4 · Flow:** PR → deterministic checks → selected investigation → controlled handoff.
- **5 · Source:** CI YAML executes checks. Investigator Markdown defines the agent task and capabilities. `gh aw compile` creates executable `.lock.yml`; it does not create runtime logs.
- **Say:** The compiler's message can already be useful. The agent must earn its cost by answering a remaining question.

## 06:00–14:00 — Demo 1

- **6 · Diff:** renamed Bicep output; unchanged caller; separate public-access change.
- **7 · Checks:** application **unit tests** pass; Bicep **compilation** fails; independent policy fails.
- Point to the actual compiler diagnostic. Do not call this an Azure provisioning failure.
- If compilation failed, offline preflight did not prove anything about the template; identify it as skipped.
- **8 · Findings:** two causes, two repairs.
  - Restore/update the output contract consistently.
  - Restore `publicNetworkAccess` to `Disabled` for the sample production requirement.
  - Verify compile + policy; retain app tests.
- Show issue → same PR's managed comment → `CI Investigation` check.
- **Say:** Successful report delivery leaves the failed required CI checks failed.

## 14:00–19:00 — explain the mechanism

- **9 · Binding:** repository, run, attempt, source head, tested merge and input digests.
- A digest checks matching bytes; it does not establish trusted origin by itself.
- Trusted automation reads candidate artifacts as data. Privileged jobs do not execute the candidate's code.
- **10 · MCP:** relevant rules/ownership/version through a bounded read interface. The catalog is a **local sample**.
- MCP grants no enterprise knowledge, policy approval or caller entitlement.
- **11 · Delivery:** read-only agent → proposed output → detection/validation → limited writer → verified PR link.
- Missing context is uncertainty. A valid schema does not prove a true conclusion.

## 19:00–26:00 — Demo 2

- **12 · Green root:** shared default `true → false`; root explicitly passes `true`.
- Show ordinary CI green. Ask: “What about registered callers that omit this input?”
- **13 · Comparison:** consumer A explicit `true` stays true; consumer B omitted input becomes false.
- Point to baseline/candidate compiled evidence and sample requirement `SAMPLE-ZONE-001`.
- **14 · Selection:** sensitive-module route runs before model inference. Read exact check semantics from the verified run.
- Show `Shared Module Review` and its linked `[Module Review]` handoff. Success means delivery, not approval; it is informational. Baseline CI remains green.
- **Say:** “Two registered sample consumers evaluated.” No enterprise-wide discovery or live-cloud-impact claim.
- Supported edit: literal default only; unsupported changes become unknown/error.
- Repair: preserve the default or deliberately review a contract/migration change.

## 26:00–31:00 — cost, adoption, close

- **15 · Cost:** deterministic routing, bounded evidence, relevant context, replay handling.
- Known rule + known remedy often needs a deterministic message, not an agent.
- Measure agent and detection credits separately. Agent's 120-AIC setting is not a total-workflow cap.
- No percentage-saving or ROI claim without measurements.
- **16 · Adoption:** start with one useful question and an accepted handoff. Broader coverage needs authorized inventory, resolved versions, inputs and deployment evidence.
- **17 · Close:** deterministic gate; selected evidence; governed handoff.
- **Stop the demo by 30:00. Close by 31:00. Questions until 35:00.**

## If something goes wrong

- **Queued:** use prepared run; identify its revision.
- **Network unavailable:** use captured outputs; say they are captured.
- **MCP unavailable:** observed failure stays valid; enrichment is unknown.
- **Incomplete report:** identify the omission. Never claim a full investigation.
- **Running late:** skip internal logs/transport details; retain both examples and the limits.
- **Do not:** disable CI, merge broken fixtures, approve exceptions, repeat paid runs without new evidence.

## Quick answers

- **Why AI if the error is clear?** Sometimes it is unnecessary. Here it gathers independent evidence, distinguishes causes and produces a reviewable handoff.
- **Why MCP?** An explicit interface for selected facts. A direct API/function can be sufficient in a smaller system.
- **Is green CI safe?** Green for the checks and inputs evaluated. The extra consumer question needs extra evidence.
- **Does investigation success allow merge?** It reports delivery; required checks and repository policy control merge.
- **Does this inspect the whole organization?** No. Two registered sample consumers, compiled configuration, no deployment.
- **Why is consumer CI green with a finding?** The assessment records a review finding. The separate review is informational; the three required enforcement gates keep their existing semantics.
- **Does read-only prevent all harm?** It limits mutation. Data access and output destinations still require controls.
- **Can it fix the code?** This demo proposes repairs; a developer reviews and commits them.
