import * as fs from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

type Json = Record<string, any>;

// This is a deliberately scoped offline contract check, not an ARM interpreter
// or an Azure provisioning result. Unsupported expressions must fail closed.
function resolveString(value: unknown, parameters: Json): string {
  if (typeof value !== "string") throw new Error("Expected a string address prefix");
  const parameter = /^\[parameters\('([^']+)'\)\]$/.exec(value);
  if (parameter) {
    const resolved = parameters[parameter[1]];
    if (typeof resolved !== "string" || resolved.startsWith("[")) {
      throw new Error(`Unresolved address parameter: ${parameter[1]}`);
    }
    return resolved;
  }
  if (value.startsWith("[")) throw new Error("Unsupported address expression");
  return value;
}

function ipv4Range(cidr: string): { first: number; last: number } {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(cidr);
  if (!match) throw new Error(`Unsupported IPv4 CIDR: ${cidr}`);
  const octets = match.slice(1, 5).map(Number);
  const prefix = Number(match[5]);
  if (octets.some(octet => octet > 255) || prefix > 32) throw new Error(`Invalid CIDR: ${cidr}`);
  const address = octets.reduce((value, octet) => value * 256 + octet, 0);
  const size = 2 ** (32 - prefix);
  const first = Math.floor(address / size) * size;
  if (address !== first) throw new Error(`CIDR has nonzero host bits: ${cidr}`);
  return { first, last: first + size - 1 };
}

export function inspectNetworkPreflight(template: Json, active: Json) {
  if (active.parameters?.enablePrivateNetworking?.value === false) {
    return {
      mode: "offline-network-preflight", azureRequestMade: false,
      scope: "IPv4 subnet containment in the compiled networkDeployment module only",
      status: "NOT_APPLICABLE", code: "OFFLINE_PRIVATE_NETWORKING_DISABLED",
      failuresCount: 0, operations: [],
    };
  }
  if (active.parameters?.enablePrivateNetworking?.value !== true) {
    throw new Error("Missing or invalid private networking activation parameter");
  }
  const deployment = template.resources?.find((r: Json) =>
    r.type === "Microsoft.Resources/deployments" && r.name === "networkDeployment");
  const network = deployment?.properties?.template;
  if (!network) throw new Error("Missing compiled networkDeployment module");

  const parameters: Json = {};
  for (const [key, definition] of Object.entries(network.parameters || {})) {
    parameters[key] = (definition as Json).defaultValue;
  }
  // Resolve address overrides from the parent template without evaluating code.
  for (const [key, supplied] of Object.entries(deployment.properties.parameters || {})) {
    const value = (supplied as Json).value;
    const parent = typeof value === "string" && /^\[parameters\('([^']+)'\)\]$/.exec(value);
    parameters[key] = parent
      ? active.parameters?.[parent[1]]?.value ?? template.parameters?.[parent[1]]?.defaultValue
      : value;
  }

  const vnets = network.resources?.filter((r: Json) => r.type === "Microsoft.Network/virtualNetworks");
  if (!vnets?.length) throw new Error("No VNet found in compiled networkDeployment");
  const operations = vnets.map((vnet: Json) => {
    const prefixes = vnet.properties?.addressSpace?.addressPrefixes;
    const subnets = vnet.properties?.subnets;
    if (!Array.isArray(prefixes) || !prefixes.length || !Array.isArray(subnets) || !subnets.length) {
      throw new Error("Missing VNet address space or subnet evidence");
    }
    const addressPrefixes = prefixes.map((value: unknown) => resolveString(value, parameters));
    const ranges = addressPrefixes.map(ipv4Range);
    return {
      deployment: "networkDeployment",
      resourceType: "Microsoft.Network/virtualNetworks",
      addressPrefixes,
      subnets: subnets.map((subnet: Json) => {
        const addressPrefix = resolveString(subnet.properties?.addressPrefix, parameters);
        const range = ipv4Range(addressPrefix);
        const contained = ranges.some((parent: { first: number; last: number }) =>
          range.first >= parent.first && range.last <= parent.last);
        return {
          name: subnet.name,
          addressPrefix,
          status: contained ? "PASSED" : "FAILED",
          code: contained ? "OFFLINE_SUBNET_VALID" : "OFFLINE_SUBNET_OUTSIDE_VNET",
        };
      }),
    };
  });
  const failuresCount = operations.flatMap((operation: Json) => operation.subnets)
    .filter((subnet: Json) => subnet.status === "FAILED").length;
  return {
    mode: "offline-network-preflight",
    azureRequestMade: false,
    scope: "IPv4 subnet containment in the compiled networkDeployment module only",
    status: failuresCount ? "FAILED" : "PASSED",
    code: failuresCount ? "OFFLINE_NETWORK_VALIDATION_FAILED" : "OFFLINE_NETWORK_VALIDATION_PASSED",
    failuresCount,
    operations,
  };
}

function main() {
  const [templateFile = "compiled-template.json", parameterFile = "infra/parameters/active.json",
    outputFile = "provisioning-result.json"] = process.argv.slice(2);
  let exitCode = 2;
  let result: Json;
  try {
    const template = fs.readFileSync(templateFile);
    const parameters = fs.readFileSync(parameterFile);
    result = {
      ...inspectNetworkPreflight(JSON.parse(template.toString()), JSON.parse(parameters.toString())),
      source: {
        repository: process.env.GITHUB_REPOSITORY || "local",
        runId: process.env.GITHUB_RUN_ID || "local",
        runAttempt: process.env.GITHUB_RUN_ATTEMPT || "1",
        headSha: process.env.SOURCE_HEAD_SHA || process.env.GITHUB_SHA || "local",
        testedSha: process.env.GITHUB_SHA || "local",
        templateFile,
        templateDigest: createHash("sha256").update(template).digest("hex"),
        parameterFile,
        parameterDigest: createHash("sha256").update(parameters).digest("hex"),
      },
    };
    exitCode = ["PASSED", "NOT_APPLICABLE"].includes(result.status) ? 0 : 1;
  } catch (error) {
    result = {
      mode: "offline-network-preflight", azureRequestMade: false, status: "ERROR",
      code: "OFFLINE_PREFLIGHT_EVIDENCE_INVALID",
      message: error instanceof Error ? error.message : String(error),
    };
  }
  fs.writeFileSync(outputFile, JSON.stringify(result, null, 2) + "\n");
  if (process.env.GITHUB_STEP_SUMMARY) {
    const cell = (value: unknown) => String(value).replace(/[\r\n|<>]/g, " ");
    const rows = (result.operations || []).flatMap((operation: Json) => operation.subnets.map((subnet: Json) =>
      `| ${cell(subnet.name)} | ${cell(subnet.addressPrefix)} | ${cell(operation.addressPrefixes.join(", "))} | ${cell(subnet.status)} |`));
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
      "## Infrastructure preflight", "",
      `**${cell(result.status)}** — offline IPv4 subnet containment; no Azure deployment attempted.`, "",
      "| Subnet | Subnet range | VNet range | Result |",
      "|---|---|---|---|", ...rows, "",
      result.status === "NOT_APPLICABLE" ? "Private networking is disabled; no network containment validation was performed. Organization policy is evaluated separately." :
      result.status === "ERROR" ? `Evidence error: ${cell(result.message)}` :
        "A failed row means the subnet is outside the VNet address space. Correct the ranges independently of any SKU policy finding.",
      "", "Detailed operations and input digests: `provisioning-evidence/provisioning-result.json`.", "",
    ].join("\n") + "\n");
  }
  if (exitCode) {
    console.error(`::error::${result.code}: nested network preflight did not pass. Operation details: provisioning-evidence/${outputFile}. Offline check; no Azure deployment was attempted.`);
  } else {
    console.log(result.status === "NOT_APPLICABLE"
      ? "Offline network preflight not applicable: private networking disabled; policy is checked separately."
      : "Offline network preflight passed (subnet containment only; no Azure request).");
  }
  process.exitCode = exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
