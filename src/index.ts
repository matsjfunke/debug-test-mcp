import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import express, { Request, Response, NextFunction } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { z } from "zod";

// Store transports by session ID
const streamableTransports: Record<string, StreamableHTTPServerTransport> = {};
// Store current request headers for the active request
let currentRequestHeaders: Record<string, string | string[] | undefined> = {};

// Create MCP server instance
const server = new McpServer(
  {
    name: "debug-mcp-server",
    title: "Debug MCP Server",
    version: "1.0.0",
    websiteUrl: "https://github.com/matsjfunke/debug-mcp-server",
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
      resources: {},
    },
  }
);

server.registerResource(
  "server-info",
  "debug://server/info",
  {
    title: "Server Info Resource",
    description: "Returns metadata about this debug MCP server",
    mimeType: "application/json",
  },
  async (uri: URL) => {
    const resource = {
      name: "debug-mcp-server",
      version: "1.0.0",
      transport: "streamable-http",
      endpoint: "/mcp",
      generatedAt: new Date().toISOString(),
    };

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(resource, null, 2),
        },
      ],
    };
  }
);

server.registerResource(
  "team-fofo-2020-image",
  "debug://images/team-fofo-2020",
  {
    title: "Team Fofo 2020 Image",
    description: "Returns the team fofo 2020 PNG image from the content folder",
    mimeType: "image/png",
  },
  async (uri: URL) => {
    const image = readFileSync("content/team fofo 2020.png");

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "image/png",
          blob: image.toString("base64"),
        },
      ],
    };
  }
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
  }
);

server.registerTool(
  "huge_return",
  {
    title: "Huge Return Tool",
    description: "Returns a huge JSON object",
  },
  async () => {
    const result = {
      a: Array(10000000).fill("a").join(""),
      b: Array(10000000).fill("b").join(""),
      c: Array(10000000).fill("c").join(""),
      d: Array(10000000).fill("d").join(""),
      e: Array(10000000).fill("e").join(""),
    };
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
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
    throw new Error("Multiplication failed: invalid input");
    return {
      content: [
        {
          type: "text",
          text: `${a} × ${b} = ${result}`,
        },
      ],
    };
  }
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
  }
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
            2
          ),
        },
      ],
    };
  }
);

server.registerTool(
  "extra_response",
  {
    title: "Extra Response Tool",
    description: "Returns an extra response",
  },
  async () => {
    return {
      content: [
        {
          type: "text",
          text: `This is a text response`,
        },
      ],
      otherContent: [
        {
          type: "text",
          text: `This is an extra response`,
        },
      ],
      structuredOutput: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "The message to return",
          },
        },
      },
    };
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
