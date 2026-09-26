import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  DeploymentPolicyInputSchema,
  ServiceOwnershipInputSchema,
  ApprovedSkusInputSchema,
  ChangeWindowInputSchema,
  PolicyToolResponseEnvelope,
} from "./types.js";
import {
  ToolContext,
  createDefaultToolContext,
  executeGetDeploymentPolicy,
  executeGetServiceOwnership,
  executeGetApprovedSkus,
  executeGetChangeWindow,
  buildErrorEnvelope,
} from "./policies.js";

export const APPROVED_POLICY_TOOLS = [
  "get_deployment_policy",
  "get_service_ownership",
  "get_approved_skus",
  "get_change_window",
] as const;

export type ApprovedPolicyTool = typeof APPROVED_POLICY_TOOLS[number];

// Maximum response payload size in characters to prevent unbounded memory usage
const MAX_RESPONSE_PAYLOAD_CHARS = 32768;

function safeSerialize(envelope: PolicyToolResponseEnvelope): string {
  const serialized = JSON.stringify(envelope, null, 2);
  if (serialized.length > MAX_RESPONSE_PAYLOAD_CHARS) {
    throw new Error(`Response envelope size (${serialized.length} chars) exceeded maximum limit of ${MAX_RESPONSE_PAYLOAD_CHARS} chars`);
  }
  return serialized;
}

export function createGovernedPolicyServer(contextOverrides?: Partial<ToolContext>): {
  server: McpServer;
  context: ToolContext;
  toolNames: readonly ApprovedPolicyTool[];
} {
  const context = createDefaultToolContext(contextOverrides);

  const server = new McpServer({
    name: "governed-azure-policy-mcp-server",
    version: "1.0.0",
  });

  // 1. get_deployment_policy
  server.tool(
    "get_deployment_policy",
    {
      environment: z.any().optional().describe("Deployment environment, e.g. production, staging, development"),
      resourceType: z.any().optional().describe("Azure resource type, e.g. Microsoft.Web/sites, Microsoft.Storage/storageAccounts"),
    },
    async (params) => {
      const parsed = DeploymentPolicyInputSchema.safeParse(params);
      if (!parsed.success) {
        const errorEnvelope = buildErrorEnvelope(
          "get_deployment_policy",
          params as Record<string, unknown>,
          "INVALID_INPUT",
          `Input validation failed: ${parsed.error.message}`,
          false,
          context
        );
        return {
          content: [
            {
              type: "text",
              text: safeSerialize(errorEnvelope),
            },
          ],
        };
      }
      const result = await executeGetDeploymentPolicy(parsed.data, context);
      return {
        content: [
          {
            type: "text",
            text: safeSerialize(result),
          },
        ],
      };
    }
  );

  // 2. get_service_ownership
  server.tool(
    "get_service_ownership",
    {
      service: z.any().optional().describe("Service identifier or component name"),
    },
    async (params) => {
      const parsed = ServiceOwnershipInputSchema.safeParse(params);
      if (!parsed.success) {
        const errorEnvelope = buildErrorEnvelope(
          "get_service_ownership",
          params as Record<string, unknown>,
          "INVALID_INPUT",
          `Input validation failed: ${parsed.error.message}`,
          false,
          context
        );
        return {
          content: [
            {
              type: "text",
              text: safeSerialize(errorEnvelope),
            },
          ],
        };
      }
      const result = await executeGetServiceOwnership(parsed.data, context);
      return {
        content: [
          {
            type: "text",
            text: safeSerialize(result),
          },
        ],
      };
    }
  );

  // 3. get_approved_skus
  server.tool(
    "get_approved_skus",
    {
      environment: z.any().optional().describe("Target environment, e.g. production or development"),
    },
    async (params) => {
      const parsed = ApprovedSkusInputSchema.safeParse(params);
      if (!parsed.success) {
        const errorEnvelope = buildErrorEnvelope(
          "get_approved_skus",
          params as Record<string, unknown>,
          "INVALID_INPUT",
          `Input validation failed: ${parsed.error.message}`,
          false,
          context
        );
        return {
          content: [
            {
              type: "text",
              text: safeSerialize(errorEnvelope),
            },
          ],
        };
      }
      const result = await executeGetApprovedSkus(parsed.data, context);
      return {
        content: [
          {
            type: "text",
            text: safeSerialize(result),
          },
        ],
      };
    }
  );

  // 4. get_change_window
  server.tool(
    "get_change_window",
    {
      service: z.any().optional().describe("Service identifier or component name"),
    },
    async (params) => {
      const parsed = ChangeWindowInputSchema.safeParse(params);
      if (!parsed.success) {
        const errorEnvelope = buildErrorEnvelope(
          "get_change_window",
          params as Record<string, unknown>,
          "INVALID_INPUT",
          `Input validation failed: ${parsed.error.message}`,
          false,
          context
        );
        return {
          content: [
            {
              type: "text",
              text: safeSerialize(errorEnvelope),
            },
          ],
        };
      }
      const result = await executeGetChangeWindow(parsed.data, context);
      return {
        content: [
          {
            type: "text",
            text: safeSerialize(result),
          },
        ],
      };
    }
  );

  return {
    server,
    context,
    toolNames: APPROVED_POLICY_TOOLS,
  };
}

export async function runStdioServer(): Promise<void> {
  const { server } = createGovernedPolicyServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("Governed Azure Policy MCP Server active via Stdio\n");
}

if (process.argv[1] && process.argv[1].endsWith("server.js")) {
  runStdioServer().catch((err) => {
    process.stderr.write(`Fatal MCP Error: ${err}\n`);
    process.exit(1);
  });
}
