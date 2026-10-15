# Mixed infrastructure and policy failure demo

This branch is an intentionally failing test fixture. Do not merge it into main.
No Azure resources are provisioned. The network check evaluates one IPv4 subnet
containment contract in the compiled Bicep template; it is not full ARM validation.

## Independent findings

- The network module's VNet default changes from `10.0.0.0/16` to `10.0.0.0/24`.
  Bicep compilation succeeds, but the existing `10.0.1.0/24` outbound subnet and
  `10.0.2.0/24` endpoint subnet are outside that address space. The offline
  preflight fails based on the actual compiled template. Its top-level log gives
  a generic nested failure; the `provisioning-evidence` artifact contains the
  resolved ranges, subnet operation results, input digests, and tested identity.
- Active parameters change the plan from EP1 to EP3. Policy v2026.2 reports only
  `POL-AZ-SKU-003`. Public ingress, authentication, and private networking remain
  compliant. This governance failure does not cause the subnet failure.

The policy job runs independently of Bicep validation so both findings survive
in one failed CI run. All three existing required checks retain their names and
failure semantics. The investigator and its permissions are unchanged. The new
`baseline` branch uses an existing default-branch investigator allowlist entry.

## Acceptance evidence

1. Application tests pass; Bicep compilation passes.
2. Network preflight fails with two out-of-range subnets. Reverting the VNet
   default alone makes this preflight pass while the EP3 policy still fails.
3. Policy check fails with one SKU violation. Using compliant parameters alone
   clears the policy finding while the network preflight still fails.
4. Inspect the actual investigator handoff: does it identify both independent
   problems, cite their evidence, explain the module regression, and distinguish
   the offline result from an Azure provider response? Do not count issue
   creation alone as a successful diagnosis.

Known test limits: the current investigator asks for exactly one classification
and does not automatically download `provisioning-evidence`. It must retrieve
that artifact through its existing read tools or clearly label a diff/log-based
hypothesis. PR policy bundles also have a known merge-SHA versus head-SHA binding
gap; the push run provides an unambiguous branch-head evidence path. Push and PR
events can each produce a source CI run and an investigation occurrence.
