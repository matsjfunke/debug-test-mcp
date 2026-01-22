import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import express, { Request, Response, NextFunction } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "crypto";
import { z } from "zod";

// Store transports by session ID
const streamableTransports: Record<string, StreamableHTTPServerTransport> = {};
// Store current request headers for the active request
let currentRequestHeaders: Record<string, string | string[] | undefined> = {};

// Create MCP server instance
const server = new McpServer(
  {
    name: "headers-mcp-server",
    title: "Header Test MCP Server",
    version: "1.0.0",
    websiteUrl: "https://github.com/matsjfunke/header-test-mcp",
    icons: [
      {
        src: "https://avatars.githubusercontent.com/u/125814808?v=4",
        mimeType: "image/png",
      },
    ],
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.registerTool(
  "get-request-headers",
  {
    title: "Request Headers Tool",
    description: "Get all headers that were sent with the current request",
    inputSchema: {
      headerName: z
        .string()
        .optional()
        .describe("Optional: specific header name to retrieve"),
    },
  },
  async ({ headerName }) => {
    try {
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
  },
);

server.registerTool(
  "multiply",
  {
    title: "Multiply Tool",
    description: "Multiply two numbers",
    inputSchema: {
      a: z.number().describe("First number"),
      b: z.number().describe("Second number"),
    },
  },
  async ({ a, b }) => {
    const result = a * b;
    return {
      content: [
        {
          type: "text",
          text: `${a} × ${b} = ${result}`,
        },
      ],
    };
  },
);

server.registerTool(
  "sleep_test",
  {
    title: "Sleep Test Tool",
    description:
      "Sleeps for a specified duration to test timeouts. Use 95+ seconds to trigger timeout.",
    inputSchema: {
      seconds: z.number().describe("Number of seconds to sleep"),
    },
  },
  async ({ seconds }) => {
    console.log(`Sleeping for ${seconds} seconds...`);
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));

    return {
      content: [
        {
          type: "text",
          text: `Successfully slept for ${seconds} seconds`,
        },
      ],
    };
  },
);

server.registerTool(
  "create-profile",
  {
    title: "Create User Profile",
    description:
      "Create a simple user profile with required and optional fields",
    inputSchema: {
      username: z.string().describe("Username (required)"),
      email: z.string().email().describe("Email address (required)"),
      age: z.number().min(0).optional().describe("Age in years (optional)"),
      bio: z.string().optional().describe("Short bio (optional)"),
    },
  },
  async ({ username, email, age, bio }) => {
    const profile = {
      username,
      email,
      age: age ?? "Not provided",
      bio: bio ?? "No bio provided",
      createdAt: new Date().toISOString(),
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              message: `Profile created for ${username}`,
              profile,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
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
      "Content-Type, Authorization, mcp-session-id",
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
