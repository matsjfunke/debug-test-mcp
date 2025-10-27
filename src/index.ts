import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import express, { Request, Response, NextFunction } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "crypto";
import { z } from "zod";

// Store transports by session ID
const streamableTransports: Record<string, StreamableHTTPServerTransport> = {};
// Store current request headers for the active request
let currentRequestHeaders: Record<string, string | string[] | undefined> = {};

// Create MCP server instance
const server = new Server(
  {
    name: "headers-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool handlers
server.setRequestHandler(
  z.object({ method: z.literal("tools/list") }),
  async () => {
    return {
      tools: [
        {
          name: "get-request-headers",
          description:
            "Get all headers that were sent with the current request",
          inputSchema: {
            type: "object",
            properties: {
              headerName: {
                type: "string",
                description: "Optional: specific header name to retrieve",
              },
            },
          },
        },
      ],
    };
  }
);

server.setRequestHandler(
  z.object({
    method: z.literal("tools/call"),
    params: z.object({
      name: z.string(),
      arguments: z.any().optional(),
    }),
  }),
  async (request, extra) => {
    if (request.params.name === "get-request-headers") {
      try {
        const args = request.params.arguments as
          | { headerName?: string }
          | undefined;
        const headerName = args?.headerName;
        console.log("headerName arg: ", headerName);

        let result: any;
        if (headerName) {
          // Return specific header if requested
          result = {
            success: true,
            header: headerName,
            value: currentRequestHeaders[headerName.toLowerCase()],
          };
        } else {
          // Return all headers
          result = {
            success: true,
            headers: currentRequestHeaders,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
        };
      }
    }

    throw new Error(`Unknown tool: ${request.params.name}`);
  }
);

async function runHttpServer(port: number = 3333) {
  const app = express();
  app.use(express.json());

  // Enable CORS with proper headers for MCP
  app.use((req: any, res: any, next: any) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, mcp-session-id"
    );
    res.header("Access-Control-Expose-Headers", "mcp-session-id");

    if (req.method === "OPTIONS") {
      res.status(200).end();
      return;
    }
    next();
  });

  // Handle POST requests for client-to-server communication (StreamableHTTP)
  app.post("/mcp", async (req: any, res: any) => {
    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      // Store all request headers for use in tool handlers
      currentRequestHeaders = req.headers;

      let transport: StreamableHTTPServerTransport;

      if (sessionId && streamableTransports[sessionId]) {
        transport = streamableTransports[sessionId];
        console.log(`🔄 Reusing existing session ${sessionId}`);
      } else {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: async (newSessionId: string) => {
            streamableTransports[newSessionId] = transport;
            console.log(`✅ Session ${newSessionId} initialized`);
          },
          // DNS rebinding protection is disabled by default for backwards compatibility
          enableDnsRebindingProtection: true,
        });

        transport.onclose = () => {
          if (transport.sessionId) {
            delete streamableTransports[transport.sessionId];
            console.log(`🧹 Cleaned up session ${transport.sessionId}`);
          }
        };

        await server.connect(transport);
      }
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("❌ MCP request error:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.listen(port, () => {
    console.log(`MCP server running on http://localhost:${port}`);
  });
}

// Start the server
runHttpServer().catch(console.error);
