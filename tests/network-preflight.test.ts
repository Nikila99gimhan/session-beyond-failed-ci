import { describe, expect, it } from "vitest";
import { inspectNetworkPreflight } from "../scripts/validate-network-preflight.js";

const active = { parameters: { enablePrivateNetworking: { value: true } } };

function compiled(prefix = "10.0.0.0/16") {
  return {
    resources: [{
      type: "Microsoft.Resources/deployments", name: "networkDeployment",
      properties: {
        parameters: {} as Record<string, { value: string }>,
        template: {
          parameters: { addressPrefix: { defaultValue: prefix } },
          resources: [{
            type: "Microsoft.Network/virtualNetworks",
            properties: {
              addressSpace: { addressPrefixes: ["[parameters('addressPrefix')]"] },
              subnets: [
                { name: "outbound", properties: { addressPrefix: "10.0.1.0/24" } },
                { name: "endpoints", properties: { addressPrefix: "10.0.2.0/24" } },
              ],
            },
          }],
        },
      },
    }],
  };
}

describe("Offline compiled Bicep network preflight", () => {
  it("accepts subnets contained in the original VNet", () => {
    expect(inspectNetworkPreflight(compiled(), active)).toMatchObject({
      status: "PASSED", failuresCount: 0, azureRequestMade: false,
    });
  });

  it("finds both independent subnet failures after the VNet shrinks", () => {
    const result = inspectNetworkPreflight(compiled("10.0.0.0/24"), active);
    expect(result).toMatchObject({ status: "FAILED", failuresCount: 2 });
    expect(result.operations[0].subnets.map((s: { code: string }) => s.code))
      .toEqual(["OFFLINE_SUBNET_OUTSIDE_VNET", "OFFLINE_SUBNET_OUTSIDE_VNET"]);
  });

  it("evaluates ranges rather than requiring the original /16", () => {
    expect(inspectNetworkPreflight(compiled("10.0.0.0/22"), active).status).toBe("PASSED");
    expect(inspectNetworkPreflight(compiled("10.0.0.0/23"), active).failuresCount).toBe(1);
  });

  it("honors a supplied module parameter instead of its default", () => {
    const template = compiled();
    template.resources[0].properties.parameters.addressPrefix = { value: "[parameters('networkCidr')]" };
    expect(inspectNetworkPreflight(template, {
      parameters: { ...active.parameters, networkCidr: { value: "10.0.0.0/24" } },
    }).failuresCount).toBe(2);
  });

  it("rejects invalid or unresolved address evidence instead of passing", () => {
    for (const prefix of ["10.999.0.0/16", "10.0.0.1/24", "[variables('unknown')]", "::/64"]) {
      expect(() => inspectNetworkPreflight(compiled(prefix), active)).toThrow();
    }
    expect(() => inspectNetworkPreflight({ resources: [] }, active)).toThrow("Missing compiled");
  });

  it("does not claim a validation result for an inactive network path", () => {
    expect(() => inspectNetworkPreflight(compiled(), {
      parameters: { enablePrivateNetworking: { value: false } },
    })).toThrow("active private networking path");
  });
});
