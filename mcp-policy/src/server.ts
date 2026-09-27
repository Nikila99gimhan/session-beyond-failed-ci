import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import {
  DeploymentPolicyInputSchema,
  ServiceOwnershipInputSchema,
  ApprovedSkusInputSchema,
  ChangeWindowInputSchema,
  InvestigationContextInputSchema,
  PolicyToolResponseEnvelope,
} from "./types.js";
import {
  ToolContext,
  createDefaultToolContext,
  executeGetDeploymentPolicy,
  executeGetServiceOwnership,
  executeGetApprovedSkus,
  executeGetChangeWindow,
  executeGetInvestigationContext,
  buildErrorEnvelope,
} from "./policies.js";

export const APPROVED_POLICY_TOOLS = [
  "get_deployment_policy",
  "get_service_ownership",
  "get_approved_skus",
  "get_change_window",
  "get_investigation_context",
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

  // 5. get_investigation_context (Phase 2: Consolidated Batched Tool)
  server.tool(
    "get_investigation_context",
    {
      service: z.any().optional().describe("Service identifier or component name"),
      environment: z.any().optional().describe("Target environment, e.g. production or development"),
      accountScope: z.any().optional().describe("Optional subscription or account scope"),
      ruleIds: z.any().optional().describe("Optional list of violated rule IDs"),
      policyVersion: z.any().optional().describe("Policy catalog version"),
    },
    async (params) => {
      const parsed = InvestigationContextInputSchema.safeParse(params);
      if (!parsed.success) {
        const errorEnvelope = buildErrorEnvelope(
          "get_investigation_context",
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
      const result = await executeGetInvestigationContext(parsed.data, context);
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

export async function runHttpServer(port: number = 8765): Promise<http.Server> {
  const { server, context } = createGovernedPolicyServer();
  let sseTransport: SSEServerTransport | null = null;

  const httpServer = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");

    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }

    // 1. SSE Connection (GET /mcp or GET /sse)
    if (req.method === "GET" && (req.url === "/mcp" || req.url === "/sse" || req.url?.startsWith("/mcp?"))) {
      sseTransport = new SSEServerTransport("/messages", res);
      await server.connect(sseTransport);
      return;
    }

    // 2. SSE POST messages (/messages?sessionId=...)
    if (req.method === "POST" && req.url?.startsWith("/messages")) {
      if (sseTransport) {
        await sseTransport.handlePostMessage(req, res);
      } else {
        res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "No active SSE connection" }));
      }
      return;
    }

    // 3. Plain JSON-RPC or direct POST /mcp fallback
    if (req.method === "POST" && (req.url === "/mcp" || req.url === "/mcp/")) {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", async () => {
        try {
          const msg = JSON.parse(raw);
          if (msg.method === "initialize") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                jsonrpc: "2.0",
                id: msg.id,
                result: {
                  protocolVersion: "2024-11-05",
                  capabilities: { tools: {} },
                  serverInfo: { name: "governed-azure-policy-mcp-server", version: "1.0.0" },
                },
              })
            );
            return;
          }

          if (msg.method === "notifications/initialized") {
            res.writeHead(204).end();
            return;
          }

          if (msg.method === "tools/list") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                jsonrpc: "2.0",
                id: msg.id,
                result: {
                  tools: [
                    {
                      name: "get_investigation_context",
                      description: "Consolidated, read-only investigation context tool",
                      inputSchema: {
                        type: "object",
                        properties: {
                          service: { type: "string" },
                          environment: { type: "string" },
                          accountScope: { type: "string" },
                          ruleIds: { type: "array", items: { type: "string" } },
                          policyVersion: { type: "string" },
                        },
                        required: ["service", "environment"],
                      },
                    },
                    {
                      name: "get_deployment_policy",
                      description: "Read-only deployment policy evaluation tool",
                      inputSchema: {
                        type: "object",
                        properties: { environment: { type: "string" }, resourceType: { type: "string" } },
                        required: ["environment", "resourceType"],
                      },
                    },
                    {
                      name: "get_service_ownership",
                      description: "Read-only enterprise service ownership lookup",
                      inputSchema: {
                        type: "object",
                        properties: { service: { type: "string" } },
                        required: ["service"],
                      },
                    },
                    {
                      name: "get_approved_skus",
                      description: "Read-only approved hosting plan SKU tiers",
                      inputSchema: {
                        type: "object",
                        properties: { environment: { type: "string" } },
                        required: ["environment"],
                      },
                    },
                    {
                      name: "get_change_window",
                      description: "Read-only active change freeze window status",
                      inputSchema: {
                        type: "object",
                        properties: { service: { type: "string" } },
                        required: ["service"],
                      },
                    },
                  ],
                },
              })
            );
            return;
          }

          if (msg.method === "tools/call") {
            const toolName = msg.params?.name;
            const args = msg.params?.arguments || {};
            let toolResult: any;

            if (toolName === "get_investigation_context") {
              toolResult = await executeGetInvestigationContext(args, context);
            } else if (toolName === "get_deployment_policy") {
              toolResult = await executeGetDeploymentPolicy(args, context);
            } else if (toolName === "get_service_ownership") {
              toolResult = await executeGetServiceOwnership(args, context);
            } else if (toolName === "get_approved_skus") {
              toolResult = await executeGetApprovedSkus(args, context);
            } else if (toolName === "get_change_window") {
              toolResult = await executeGetChangeWindow(args, context);
            } else {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "Method not found" } }));
              return;
            }

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                jsonrpc: "2.0",
                id: msg.id,
                result: {
                  content: [{ type: "text", text: safeSerialize(toolResult) }],
                },
              })
            );
            return;
          }

          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32600, message: "Invalid Request" } }));
        } catch (err: any) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: String(err) } }));
        }
      });
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Not Found" }));
  });

  return new Promise((resolve, reject) => {
    httpServer.listen(port, "0.0.0.0", () => {
      process.stderr.write(`Governed Azure Policy MCP Server active via HTTP on 0.0.0.0:${port}/mcp\n`);
      resolve(httpServer);
    });
    httpServer.on("error", reject);
  });
}

if (process.argv[1] && process.argv[1].endsWith("server.js")) {
  const isHttp = process.argv.includes("--http") || Boolean(process.env.MCP_PORT);
  const portArgIdx = process.argv.indexOf("--http");
  const port = portArgIdx !== -1 && process.argv[portArgIdx + 1] ? Number(process.argv[portArgIdx + 1]) : Number(process.env.MCP_PORT || 8765);

  if (isHttp) {
    runHttpServer(port).catch((err) => {
      process.stderr.write(`Fatal HTTP MCP Error: ${err}\n`);
      process.exit(1);
    });
  } else {
    runStdioServer().catch((err) => {
      process.stderr.write(`Fatal Stdio MCP Error: ${err}\n`);
      process.exit(1);
    });
  }
}
