import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { z } from "zod";

type Json = Record<string, any>;
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const DigestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const ConsumerSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  sourceRef: z.string().min(1).max(256),
  wrapper: z.string().regex(/^[a-z][a-z0-9-]*\.bicep$/),
  wrapperDigest: DigestSchema,
  service: z.string().min(1).max(80),
  environment: z.enum(["production", "staging", "development"]),
  requirement: z.object({ id: z.literal("SAMPLE-ZONE-001"), zoneRedundant: z.literal(true) }).strict(),
}).strict();
export const ConsumerRegistrySchema = z.object({
  schemaVersion: z.literal("1.0"),
  registryVersion: z.literal("sample-2026.1"),
  modulePath: z.literal("infra/modules/hostingPlan.bicep"),
  scope: z.string().min(1).max(512),
  consumers: z.array(ConsumerSchema).min(1).max(8),
}).strict().superRefine((registry, context) => {
  if (new Set(registry.consumers.map(consumer => consumer.id)).size !== registry.consumers.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate registered consumer" });
  }
  if (new Set(registry.consumers.map(consumer => consumer.wrapper)).size !== registry.consumers.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate registered wrapper" });
  }
});
export type ConsumerRegistry = z.infer<typeof ConsumerRegistrySchema>;

export const AssessmentSourceSchema = z.object({
  repository: z.string().regex(/^(local|[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/),
  runId: z.string().regex(/^(local|[1-9][0-9]*)$/),
  runAttempt: z.string().regex(/^[1-9][0-9]*$/),
  headSha: z.string().regex(/^(local|[a-f0-9]{40})$/),
  testedSha: z.string().regex(/^(local|[a-f0-9]{40})$/),
  baselineSha: z.string().regex(/^(local|[a-f0-9]{40})$/),
}).strict();
export type AssessmentSource = z.infer<typeof AssessmentSourceSchema>;
const EffectiveConfigurationSchema = z.object({
  input: z.enum(["explicit", "inherited-default"]),
  suppliedZoneRedundant: z.boolean().nullable(),
  defaultZoneRedundant: z.boolean(),
  effectiveZoneRedundant: z.boolean(),
  templateDigest: DigestSchema,
}).strict();
const ResultConsumerSchema = ConsumerSchema.omit({ wrapper: true }).extend({
  baseline: EffectiveConfigurationSchema,
  candidate: EffectiveConfigurationSchema,
  changed: z.boolean(),
  status: z.enum(["PASSED", "FAILED"]),
  code: z.enum(["SAMPLE_REQUIREMENT_SATISFIED", "SAMPLE_ZONE_REDUNDANCY_REQUIRED"]),
}).strict();
export const SharedModuleAssessmentSchema = z.object({
  schemaVersion: z.literal("1.0"),
  mode: z.literal("registered-consumer-assessment"),
  azureRequestMade: z.literal(false),
  status: z.enum(["PASSED", "FAILED", "ERROR"]),
  code: z.enum(["SHARED_MODULE_ASSESSMENT_PASSED", "SHARED_MODULE_CONSUMER_REQUIREMENT_FAILED", "SHARED_MODULE_EVIDENCE_INVALID"]),
  source: AssessmentSourceSchema,
  module: z.object({
    path: z.literal("infra/modules/hostingPlan.bicep"),
    baselineDigest: DigestSchema,
    candidateDigest: DigestSchema,
  }).strict(),
  registry: z.object({ version: z.literal("sample-2026.1"), digest: DigestSchema, consumersCount: z.number().int().min(1).max(8) }).strict(),
  scope: z.string().min(1).max(512),
  unknowns: z.array(z.string().max(1024)).max(9),
  failuresCount: z.number().int().min(0).max(8),
  consumers: z.array(ResultConsumerSchema).max(8),
  compiler: z.string().max(512),
}).strict().superRefine((report, context) => {
  const failures = report.consumers.filter(consumer => consumer.status === "FAILED").length;
  const consistent = report.failuresCount === failures &&
    (report.status === "ERROR" || report.consumers.length === report.registry.consumersCount) &&
    (report.status !== "PASSED" || (failures === 0 && report.unknowns.length === 0 && report.code === "SHARED_MODULE_ASSESSMENT_PASSED")) &&
    (report.status !== "FAILED" || (failures > 0 && report.unknowns.length === 0 && report.code === "SHARED_MODULE_CONSUMER_REQUIREMENT_FAILED")) &&
    (report.status !== "ERROR" || (report.unknowns.length > 0 && report.code === "SHARED_MODULE_EVIDENCE_INVALID"));
  if (!consistent) context.addIssue({ code: z.ZodIssueCode.custom, message: "Inconsistent assessment result" });
  for (const consumer of report.consumers) {
    const failed = consumer.candidate.effectiveZoneRedundant !== consumer.requirement.zoneRedundant;
    const changed = consumer.baseline.effectiveZoneRedundant !== consumer.candidate.effectiveZoneRedundant;
    if ((consumer.status === "FAILED") !== failed || consumer.changed !== changed ||
      consumer.code !== (failed ? "SAMPLE_ZONE_REDUNDANCY_REQUIRED" : "SAMPLE_REQUIREMENT_SATISFIED")) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `Inconsistent consumer ${consumer.id}` });
    }
  }
});
export type SharedModuleAssessment = z.infer<typeof SharedModuleAssessmentSchema>;

/** Intentionally not an ARM interpreter: only booleans and direct parameter references. */
function resolveBoolean(value: unknown, parameters: Json): boolean {
  if (typeof value === "boolean") return value;
  const reference = typeof value === "string" && /^\[parameters\('([^']+)'\)\]$/.exec(value);
  if (reference && typeof parameters[reference[1]] === "boolean") return parameters[reference[1]];
  throw new Error("Unsupported or unresolved zoneRedundant expression");
}

export function inspectConsumerTemplate(template: Json, templateDigest: string) {
  const deployments = template.resources?.filter((resource: Json) =>
    resource.type === "Microsoft.Resources/deployments" && resource.name === "sampleHostingPlan");
  if (!Array.isArray(deployments) || deployments.length !== 1) {
    throw new Error("Expected exactly one compiled sampleHostingPlan deployment");
  }
  const deployment = deployments[0];
  if (deployment.condition !== undefined) throw new Error("Conditional sample consumer is outside the assessment scope");
  const module = deployment.properties?.template;
  const parameter = module?.parameters?.zoneRedundant;
  if (parameter?.type !== "bool" || typeof parameter.defaultValue !== "boolean") {
    throw new Error("Missing literal bool zoneRedundant module default");
  }
  const parentParameters: Json = {};
  for (const [name, definition] of Object.entries(template.parameters || {})) {
    parentParameters[name] = (definition as Json).defaultValue;
  }
  const supplied = deployment.properties?.parameters?.zoneRedundant;
  const explicit = supplied !== undefined;
  const effective = explicit ? resolveBoolean(supplied.value, parentParameters) : parameter.defaultValue;
  const plans = module.resources?.filter((resource: Json) => resource.type === "Microsoft.Web/serverfarms");
  if (!Array.isArray(plans) || plans.length !== 1) throw new Error("Expected exactly one compiled hosting plan");
  if (plans[0].condition !== undefined) throw new Error("Conditional hosting plan is outside the assessment scope");
  const emitted = resolveBoolean(plans[0].properties?.zoneRedundant, { zoneRedundant: effective });
  if (emitted !== effective) throw new Error("Hosting plan does not use the registered zoneRedundant parameter");
  return EffectiveConfigurationSchema.parse({
    input: explicit ? "explicit" : "inherited-default",
    suppliedZoneRedundant: explicit ? effective : null,
    defaultZoneRedundant: parameter.defaultValue,
    effectiveZoneRedundant: emitted,
    templateDigest,
  });
}

/** This demo can independently establish a single literal-default edit without interpreting Bicep. */
export function verifyDefaultOnlyModuleChange(baselineModule: Buffer, candidateModule: Buffer): boolean {
  const baseline = baselineModule.toString("utf8");
  const candidate = candidateModule.toString("utf8");
  const declaration = /^param zoneRedundant bool = (true|false)$/gm;
  const baselineDeclarations = [...baseline.matchAll(declaration)];
  const candidateDeclarations = [...candidate.matchAll(declaration)];
  if (baselineDeclarations.length !== 1 || candidateDeclarations.length !== 1) return false;
  return baseline.replace(declaration, "param zoneRedundant bool = <assessed-default>") ===
    candidate.replace(declaration, "param zoneRedundant bool = <assessed-default>");
}

export interface AssessmentVerificationInputs {
  registryBytes: Buffer;
  baselineModule: Buffer;
  candidateModule: Buffer;
  source: AssessmentSource;
  templates: Record<string, { baseline: Buffer; candidate: Buffer }>;
}

/** Recompute the bounded claim; callers must retrieve source bytes from the authenticated source run. */
export function verifySharedModuleAssessment(value: unknown, inputs: AssessmentVerificationInputs): SharedModuleAssessment {
  const report = SharedModuleAssessmentSchema.parse(value);
  const source = AssessmentSourceSchema.parse(inputs.source);
  const registry = ConsumerRegistrySchema.parse(JSON.parse(inputs.registryBytes.toString("utf8")));
  if (report.status === "ERROR") throw new Error("Assessment evidence is incomplete");
  if (JSON.stringify(report.source) !== JSON.stringify(source)) throw new Error("Assessment source binding mismatch");
  if (report.module.baselineDigest !== digest(inputs.baselineModule) ||
      report.module.candidateDigest !== digest(inputs.candidateModule)) throw new Error("Assessment module digest mismatch");
  if (report.registry.digest !== digest(inputs.registryBytes) || report.registry.version !== registry.registryVersion ||
      report.registry.consumersCount !== registry.consumers.length || report.scope !== registry.scope) {
    throw new Error("Assessment registry binding mismatch");
  }
  if (!verifyDefaultOnlyModuleChange(inputs.baselineModule, inputs.candidateModule)) {
    throw new Error("Unsupported module edit: only the literal zoneRedundant default is assessed");
  }
  if (Object.keys(inputs.templates).length !== registry.consumers.length) throw new Error("Incomplete or unexpected compiled consumer evidence");
  for (const registered of registry.consumers) {
    const recorded = report.consumers.find(consumer => consumer.id === registered.id);
    const templates = inputs.templates[registered.id];
    if (!recorded || !templates) throw new Error(`Missing registered consumer: ${registered.id}`);
    const { wrapper: _wrapper, ...expected } = registered;
    const { baseline: _baseline, candidate: _candidate, changed: _changed, status: _status, code: _code, ...actual } = recorded;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Registered consumer binding mismatch: ${registered.id}`);
    for (const variant of ["baseline", "candidate"] as const) {
      const bytes = templates[variant];
      if (!bytes || bytes.length > 2 * 1024 * 1024) throw new Error(`Invalid compiled consumer bytes: ${registered.id}`);
      const effective = inspectConsumerTemplate(JSON.parse(bytes.toString("utf8")), digest(bytes));
      const moduleSource = variant === "baseline" ? inputs.baselineModule : inputs.candidateModule;
      const sourceDefault = /^param zoneRedundant bool = (true|false)$/m.exec(moduleSource.toString("utf8"))?.[1] === "true";
      if (effective.defaultZoneRedundant !== sourceDefault || JSON.stringify(effective) !== JSON.stringify(recorded[variant])) {
        throw new Error(`Compiled consumer configuration mismatch: ${registered.id}/${variant}`);
      }
      // Wrappers are fixed trusted fixtures: A supplies true; B inherits the module default.
      // This independent expected input prevents a forged artifact inventing caller parameters.
      const expectedInput = registered.id === "sample-explicit-zone" ? "explicit" :
        registered.id === "sample-inherited-zone" ? "inherited-default" : undefined;
      if (!expectedInput || effective.input !== expectedInput ||
          (expectedInput === "explicit" && effective.suppliedZoneRedundant !== true)) {
        throw new Error(`Unsupported registered consumer input: ${registered.id}`);
      }
    }
  }
  return report;
}

type Compiler = (wrapperFile: string, outputFile: string) => void;
export function compileBicep(wrapperFile: string, outputFile: string): void {
  const executable = process.env.BICEP_BINARY || "az";
  const args = process.env.BICEP_BINARY
    ? ["build", wrapperFile, "--outfile", outputFile, "--no-restore"]
    : ["bicep", "build", "--file", wrapperFile, "--outfile", outputFile, "--no-restore"];
  const compiled = spawnSync(executable, args, { encoding: "utf8", timeout: 60_000, maxBuffer: 2 * 1024 * 1024 });
  if (compiled.error || compiled.status !== 0) {
    // Diagnostics can contain source text. Bound them and preserve them as data only.
    const message = compiled.error?.message || compiled.stderr || compiled.stdout || `exit ${compiled.status}`;
    throw new Error(`Bicep compilation failed: ${message.slice(0, 900)}`);
  }
  if (!fs.existsSync(outputFile)) throw new Error("Bicep compiler did not produce the consumer template");
}

export interface AssessmentOptions {
  baselineModule: string;
  candidateModule: string;
  registryFile: string;
  source: AssessmentSource;
  compiler?: Compiler;
  compilerDescription?: string;
  templatesDirectory?: string;
}

/** Compile only the trusted registered wrappers plus the two untrusted Bicep input files. */
export function assessSharedModule(options: AssessmentOptions): SharedModuleAssessment {
  const source = AssessmentSourceSchema.parse(options.source);
  const registryBytes = fs.readFileSync(options.registryFile);
  const registry = ConsumerRegistrySchema.parse(JSON.parse(registryBytes.toString("utf8")));
  const baselineModule = fs.readFileSync(options.baselineModule);
  const candidateModule = fs.readFileSync(options.candidateModule);
  const report: SharedModuleAssessment = {
    schemaVersion: "1.0", mode: "registered-consumer-assessment", azureRequestMade: false,
    status: "PASSED", code: "SHARED_MODULE_ASSESSMENT_PASSED", source,
    module: { path: registry.modulePath, baselineDigest: digest(baselineModule), candidateDigest: digest(candidateModule) },
    registry: { version: registry.registryVersion, digest: digest(registryBytes), consumersCount: registry.consumers.length },
    scope: registry.scope, unknowns: [], failuresCount: 0, consumers: [],
    compiler: options.compilerDescription || (process.env.BICEP_BINARY ? path.basename(process.env.BICEP_BINARY) : "az bicep build"),
  };
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "registered-consumers-"));
  try {
    if (!verifyDefaultOnlyModuleChange(baselineModule, candidateModule)) {
      throw new Error("Unsupported module edit: only the literal zoneRedundant default is assessed; manual review required");
    }
    // A copied module is isolated from its checkout. Additional modules or registry references
    // fail with --no-restore; this demo does not recursively execute or discover dependencies.
    for (const [variant, moduleBytes] of [["baseline", baselineModule], ["candidate", candidateModule]] as const) {
      fs.mkdirSync(path.join(temporary, variant, "module"), { recursive: true });
      fs.mkdirSync(path.join(temporary, variant, "consumers"), { recursive: true });
      fs.writeFileSync(path.join(temporary, variant, "module", "hostingPlan.bicep"), moduleBytes);
    }
    for (const consumer of registry.consumers) {
      const wrapper = fs.readFileSync(path.join(path.dirname(options.registryFile), consumer.wrapper));
      if (digest(wrapper) !== consumer.wrapperDigest) throw new Error(`Registered wrapper digest mismatch: ${consumer.id}`);
      const variants: Record<string, z.infer<typeof EffectiveConfigurationSchema>> = {};
      for (const variant of ["baseline", "candidate"]) {
        const wrapperFile = path.join(temporary, variant, "consumers", consumer.wrapper);
        const outputFile = path.join(temporary, variant, "consumers", `${consumer.id}.json`);
        fs.writeFileSync(wrapperFile, wrapper);
        (options.compiler || compileBicep)(wrapperFile, outputFile);
        const bytes = fs.readFileSync(outputFile);
        if (bytes.length > 2 * 1024 * 1024) throw new Error(`Compiled consumer template exceeds 2 MB: ${consumer.id}`);
        variants[variant] = inspectConsumerTemplate(JSON.parse(bytes.toString("utf8")), digest(bytes));
        if (options.templatesDirectory) {
          const destination = path.join(options.templatesDirectory, variant);
          fs.mkdirSync(destination, { recursive: true });
          fs.copyFileSync(outputFile, path.join(destination, `${consumer.id}.json`));
        }
      }
      const failed = variants.candidate.effectiveZoneRedundant !== consumer.requirement.zoneRedundant;
      const { wrapper: _wrapper, ...recorded } = consumer;
      report.consumers.push({
        ...recorded, baseline: variants.baseline, candidate: variants.candidate,
        changed: variants.baseline.effectiveZoneRedundant !== variants.candidate.effectiveZoneRedundant,
        status: failed ? "FAILED" : "PASSED",
        code: failed ? "SAMPLE_ZONE_REDUNDANCY_REQUIRED" : "SAMPLE_REQUIREMENT_SATISFIED",
      });
    }
    report.failuresCount = report.consumers.filter(consumer => consumer.status === "FAILED").length;
    if (report.failuresCount) {
      report.status = "FAILED";
      report.code = "SHARED_MODULE_CONSUMER_REQUIREMENT_FAILED";
    }
  } catch (error) {
    report.status = "ERROR";
    report.code = "SHARED_MODULE_EVIDENCE_INVALID";
    report.unknowns.push((error instanceof Error ? error.message : String(error)).slice(0, 1024));
    report.failuresCount = report.consumers.filter(consumer => consumer.status === "FAILED").length;
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  return SharedModuleAssessmentSchema.parse(report);
}

function sourceFromEnvironment(): AssessmentSource {
  const inCi = process.env.GITHUB_ACTIONS === "true";
  const required = (name: string, fallback = "local") => {
    const value = process.env[name];
    if (inCi && !value) throw new Error(`Missing source binding: ${name}`);
    return value || fallback;
  };
  return AssessmentSourceSchema.parse({
    repository: required("GITHUB_REPOSITORY"), runId: required("GITHUB_RUN_ID"),
    runAttempt: required("GITHUB_RUN_ATTEMPT", "1"), headSha: required("SOURCE_HEAD_SHA"),
    testedSha: required("GITHUB_SHA"), baselineSha: required("BASELINE_SHA"),
  });
}

function main(): void {
  const args = process.argv.slice(2);
  const values: Record<string, string> = {};
  const allowed = new Set(["--baseline-module", "--candidate-module", "--registry", "--output", "--templates-directory", "--templates-dir"]);
  for (let index = 0; index < args.length; index += 2) {
    if (!allowed.has(args[index]) || !args[index + 1] || args[index + 1].startsWith("--") || values[args[index]]) {
      throw new Error("Usage: assess-shared-module.ts --baseline-module FILE --candidate-module FILE [--registry FILE] [--output FILE] [--templates-directory DIR]");
    }
    values[args[index]] = args[index + 1];
  }
  if (!values["--baseline-module"] || !values["--candidate-module"]) throw new Error("Both module inputs are required");
  const outputFile = values["--output"] || "shared-module-assessment.json";
  const report = assessSharedModule({
    baselineModule: values["--baseline-module"], candidateModule: values["--candidate-module"],
    registryFile: values["--registry"] || "fixtures/shared-module-consumers/registry.json",
    source: sourceFromEnvironment(),
    templatesDirectory: values["--templates-dir"] || values["--templates-directory"] || path.join(path.dirname(outputFile), "consumer-templates"),
  });
  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2) + "\n");
  if (process.env.GITHUB_STEP_SUMMARY) {
    const cell = (value: unknown) => String(value).replace(/[\r\n|<>]/g, " ");
    const rows = report.consumers.map(consumer =>
      `| ${cell(consumer.id)} | ${consumer.candidate.input} | ${consumer.baseline.effectiveZoneRedundant} | ${consumer.candidate.effectiveZoneRedundant} | ${consumer.requirement.zoneRedundant} | ${consumer.status} |`);
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
      "## Shared Module Review", "", `**${report.status}** — ${cell(report.scope)}`, "",
      "| Registered sample | Candidate input | Baseline | Candidate | Required | Result |",
      "|---|---|---|---|---|---|", ...rows, "",
      ...report.unknowns.map(unknown => `Evidence incomplete: ${cell(unknown)}`), "",
      "No Azure deployment attempted. This assessment cannot establish live deployed state or discover unregistered consumers.", "",
    ].join("\n"));
  }
  console.log(`${report.code}: ${report.failuresCount} requirement violation(s) among ${report.consumers.length}/${report.registry.consumersCount} evaluated registered sample consumers.`);
  process.exitCode = report.status === "PASSED" ? 0 : report.status === "FAILED" ? 1 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}
