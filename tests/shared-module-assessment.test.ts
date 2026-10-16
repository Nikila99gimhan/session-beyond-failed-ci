import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  assessSharedModule, inspectConsumerTemplate, verifyDefaultOnlyModuleChange,
  verifySharedModuleAssessment, SharedModuleAssessmentSchema,
  type AssessmentSource,
} from "../scripts/assess-shared-module.js";

const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const registryFile = path.resolve("fixtures/shared-module-consumers/registry.json");
const registryBytes = fs.readFileSync(registryFile);
// A stable contract fixture keeps application/unit tests independent of the deliberate
// infrastructure default regression demonstrated on a feature branch.
const baselineBytes = Buffer.from(`param location string
param hostingPlanName string
param skuName string = 'EP1'
param zoneRedundant bool = true
resource hostingPlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: hostingPlanName
  location: location
  sku: { name: skuName, tier: 'ElasticPremium' }
  properties: { reserved: true, zoneRedundant: zoneRedundant }
}
`);
const source: AssessmentSource = {
  repository: "owner/repo", runId: "1234", runAttempt: "2",
  headSha: "1".repeat(40), testedSha: "2".repeat(40), baselineSha: "3".repeat(40),
};
const directories: string[] = [];
afterEach(() => directories.splice(0).forEach(directory => fs.rmSync(directory, { recursive: true, force: true })));

function template(defaultValue = true, supplied: unknown = undefined) {
  return {
    resources: [{
      type: "Microsoft.Resources/deployments", name: "sampleHostingPlan",
      properties: {
        parameters: supplied === undefined ? {} : { zoneRedundant: { value: supplied } },
        template: {
          parameters: { zoneRedundant: { type: "bool", defaultValue } },
          resources: [{ type: "Microsoft.Web/serverfarms", properties: { zoneRedundant: "[parameters('zoneRedundant')]" } }],
        },
      },
    }],
  };
}

function setup(candidate = baselineBytes.toString().replace("param zoneRedundant bool = true", "param zoneRedundant bool = false")) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-test-"));
  directories.push(directory);
  const baselineModule = path.join(directory, "baseline.bicep");
  const candidateModule = path.join(directory, "candidate.bicep");
  const templatesDirectory = path.join(directory, "consumer-templates");
  fs.writeFileSync(baselineModule, baselineBytes);
  fs.writeFileSync(candidateModule, candidate);
  // The compiler adapter is stubbed here to test the contract resolver and evidence checks.
  // A separate local QA command exercises the real Bicep compiler against these wrappers.
  const compiler = (wrapperFile: string, outputFile: string) => {
    const module = fs.readFileSync(path.resolve(path.dirname(wrapperFile), "../module/hostingPlan.bicep"), "utf8");
    const wrapper = fs.readFileSync(wrapperFile, "utf8");
    const defaultValue = /param zoneRedundant bool = true/.test(module);
    fs.writeFileSync(outputFile, JSON.stringify(template(defaultValue, wrapper.includes("zoneRedundant: true") ? true : undefined)));
  };
  const options = { baselineModule, candidateModule, registryFile, source, templatesDirectory, compiler };
  const verification = () => ({
    registryBytes, baselineModule: baselineBytes, candidateModule: Buffer.from(candidate), source,
    templates: Object.fromEntries(["sample-explicit-zone", "sample-inherited-zone"].map(id => [id, {
      baseline: fs.readFileSync(path.join(templatesDirectory, "baseline", `${id}.json`)),
      candidate: fs.readFileSync(path.join(templatesDirectory, "candidate", `${id}.json`)),
    }])),
  });
  return { directory, options, verification };
}

describe("registered sample consumer assessment", () => {
  it("finds the inherited default regression and preserves the explicit true consumer", () => {
    const fixture = setup();
    const report = assessSharedModule(fixture.options);
    expect(report).toMatchObject({ status: "FAILED", failuresCount: 1, azureRequestMade: false });
    expect(report.consumers).toMatchObject([
      { id: "sample-explicit-zone", changed: false, status: "PASSED", candidate: { input: "explicit", effectiveZoneRedundant: true } },
      { id: "sample-inherited-zone", changed: true, status: "FAILED", baseline: { effectiveZoneRedundant: true }, candidate: { input: "inherited-default", effectiveZoneRedundant: false } },
    ]);
    expect(verifySharedModuleAssessment(report, fixture.verification())).toEqual(report);
  });

  it("passes both registered consumers when the reviewed module is unchanged", () => {
    const fixture = setup(baselineBytes.toString());
    const report = assessSharedModule(fixture.options);
    expect(report).toMatchObject({ status: "PASSED", failuresCount: 0 });
    expect(report.consumers.every(consumer => !consumer.changed)).toBe(true);
    expect(verifySharedModuleAssessment(report, fixture.verification()).status).toBe("PASSED");
  });

  it("honors an explicit false value rather than falling back to a true default", () => {
    expect(inspectConsumerTemplate(template(true, false), "a".repeat(64))).toMatchObject({
      input: "explicit", suppliedZoneRedundant: false, effectiveZoneRedundant: false,
    });
    const value = template(true, "[parameters('redundancy')]") as any;
    value.parameters = { redundancy: { type: "bool", defaultValue: false } };
    expect(inspectConsumerTemplate(value, "a".repeat(64)).effectiveZoneRedundant).toBe(false);
  });

  it("reports unknown evidence if compilation fails or no template is emitted", () => {
    const fixture = setup();
    for (const compiler of [() => { throw new Error("BCP052: invalid contract"); }, () => undefined]) {
      const result = assessSharedModule({ ...fixture.options, compiler });
      expect(result).toMatchObject({ status: "ERROR", code: "SHARED_MODULE_EVIDENCE_INVALID", consumers: [] });
      expect(result.unknowns).toHaveLength(1);
      expect(() => verifySharedModuleAssessment(result, { registryBytes, baselineModule: baselineBytes, candidateModule: baselineBytes, source, templates: {} })).toThrow("incomplete");
    }
  });

  it("rejects missing consumers, missing literal defaults, unsupported expressions and conditional resources", () => {
    expect(() => inspectConsumerTemplate({ resources: [] }, "a".repeat(64))).toThrow("exactly one");
    for (const unsupported of ["[not(parameters('redundancy'))]", "[variables('value')]", "false", null]) {
      expect(() => inspectConsumerTemplate(template(true, unsupported), "a".repeat(64))).toThrow("Unsupported");
    }
    const missingDefault: any = template();
    delete missingDefault.resources[0].properties.template.parameters.zoneRedundant.defaultValue;
    expect(() => inspectConsumerTemplate(missingDefault, "a".repeat(64))).toThrow("literal bool");
    const conditional: any = template();
    conditional.resources[0].condition = true;
    expect(() => inspectConsumerTemplate(conditional, "a".repeat(64))).toThrow("Conditional");
  });

  it("rejects changed trusted wrapper bytes before compiling a partial inventory", () => {
    const fixture = setup();
    const registry = JSON.parse(registryBytes.toString());
    fs.writeFileSync(path.join(fixture.directory, "registry.json"), registryBytes);
    for (const consumer of registry.consumers) {
      fs.copyFileSync(path.join(path.dirname(registryFile), consumer.wrapper), path.join(fixture.directory, consumer.wrapper));
    }
    fs.appendFileSync(path.join(fixture.directory, registry.consumers[0].wrapper), "// tampered\n");
    const report = assessSharedModule({ ...fixture.options, registryFile: path.join(fixture.directory, "registry.json") });
    expect(report.status).toBe("ERROR");
    expect(report.unknowns[0]).toContain("wrapper digest mismatch");
  });

  it("cannot report success when a registered wrapper is missing", () => {
    const fixture = setup();
    const registry = JSON.parse(registryBytes.toString());
    fs.writeFileSync(path.join(fixture.directory, "registry.json"), registryBytes);
    fs.copyFileSync(path.join(path.dirname(registryFile), registry.consumers[0].wrapper), path.join(fixture.directory, registry.consumers[0].wrapper));
    const report = assessSharedModule({ ...fixture.options, registryFile: path.join(fixture.directory, "registry.json") });
    expect(report).toMatchObject({ status: "ERROR", consumers: [expect.objectContaining({ id: "sample-explicit-zone" })] });
    expect(report.unknowns[0]).toContain("ENOENT");
  });

  it("rejects missing, extra and duplicate registered consumer evidence", () => {
    const fixture = setup();
    const report = assessSharedModule(fixture.options);
    const inputs = fixture.verification();
    delete inputs.templates["sample-inherited-zone"];
    expect(() => verifySharedModuleAssessment(report, inputs)).toThrow("Incomplete");
    const duplicate = structuredClone(report);
    duplicate.consumers[1] = duplicate.consumers[0];
    duplicate.failuresCount = 0;
    duplicate.status = "PASSED";
    duplicate.code = "SHARED_MODULE_ASSESSMENT_PASSED";
    expect(() => verifySharedModuleAssessment(duplicate, fixture.verification())).toThrow("Missing registered consumer");
  });

  it("verifies authenticated source identity, module bytes, registry and compiled artifact digests", () => {
    const fixture = setup();
    const report = assessSharedModule(fixture.options);
    expect(() => verifySharedModuleAssessment(report, { ...fixture.verification(), source: { ...source, headSha: "f".repeat(40) } })).toThrow("source binding");
    expect(() => verifySharedModuleAssessment(report, { ...fixture.verification(), candidateModule: baselineBytes })).toThrow("module digest");
    expect(() => verifySharedModuleAssessment(report, { ...fixture.verification(), registryBytes: Buffer.from(registryBytes.toString() + "\n") })).toThrow("registry binding");
    const inputs = fixture.verification();
    inputs.templates["sample-inherited-zone"].candidate = Buffer.from(JSON.stringify(template(true)));
    expect(() => verifySharedModuleAssessment(report, inputs)).toThrow("configuration mismatch");
  });

  it("rejects forged self-consistent template and report values by checking real source defaults and fixed caller inputs", () => {
    const fixture = setup();
    const report = assessSharedModule(fixture.options);
    const inputs = fixture.verification();
    const forgedBytes = Buffer.from(JSON.stringify(template(true)));
    inputs.templates["sample-inherited-zone"].candidate = forgedBytes;
    const forged = structuredClone(report);
    forged.status = "PASSED";
    forged.code = "SHARED_MODULE_ASSESSMENT_PASSED";
    forged.failuresCount = 0;
    Object.assign(forged.consumers[1], {
      changed: false, status: "PASSED", code: "SAMPLE_REQUIREMENT_SATISFIED",
      candidate: { input: "inherited-default", suppliedZoneRedundant: null, defaultZoneRedundant: true, effectiveZoneRedundant: true, templateDigest: hash(forgedBytes) },
    });
    expect(() => verifySharedModuleAssessment(forged, inputs)).toThrow("configuration mismatch");
    const explicitBytes = Buffer.from(JSON.stringify(template(false, true)));
    inputs.templates["sample-inherited-zone"].candidate = explicitBytes;
    forged.consumers[1].candidate = inspectConsumerTemplate(template(false, true), hash(explicitBytes));
    expect(() => verifySharedModuleAssessment(forged, inputs)).toThrow("consumer input");
  });

  it("marks broader module changes unsupported rather than making a fleet assessment claim", () => {
    const changed = baselineBytes.toString().replace("tier: 'ElasticPremium'", "tier: 'Other'");
    expect(verifyDefaultOnlyModuleChange(baselineBytes, Buffer.from(changed))).toBe(false);
    const fixture = setup(changed);
    const report = assessSharedModule(fixture.options);
    expect(report).toMatchObject({ status: "ERROR", consumers: [] });
    expect(report.unknowns[0]).toContain("manual review required");
  });

  it("rejects inconsistent success reports", () => {
    const fixture = setup();
    const report = assessSharedModule(fixture.options);
    expect(() => SharedModuleAssessmentSchema.parse({ ...report, status: "PASSED", failuresCount: 0 })).toThrow("Inconsistent");
  });
});
