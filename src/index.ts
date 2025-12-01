import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import express, { Request, Response, NextFunction } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "crypto";
import { z } from "zod";

const allowedRarities = ["common", "uncommon", "rare", "legendary"] as const;
type RarityLevel = (typeof allowedRarities)[number];

const rarityBonusMap: Record<RarityLevel, number> = {
  common: 5,
  uncommon: 15,
  rare: 45,
  legendary: 120,
};

const knownAdventureFieldNames = new Set([
  "id",
  "title",
  "rarity",
  "powerLevel",
  "tags",
]);

const isRarityLevel = (value: unknown): value is RarityLevel => {
  return (
    typeof value === "string" && allowedRarities.includes(value as RarityLevel)
  );
};

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
        {
          name: "multiply",
          description: "Multiply two numbers",
          inputSchema: {
            type: "object",
            properties: {
              a: {
                type: "number",
                description: "First number",
              },
              b: {
                type: "number",
                description: "Second number",
              },
            },
            required: ["a", "b"],
          },
        },
        {
          name: "process-records",
          description: "Process an array of whimsical adventure records",
          inputSchema: {
            type: "object",
            properties: {
              records: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: {
                      type: "string",
                      description: "Unique identifier of the record",
                    },
                    title: {
                      type: "string",
                      description: "Optional display name for the record",
                    },
                    rarity: {
                      type: "string",
                      enum: ["common", "uncommon", "rare", "legendary"],
                      description: "How hard this record is to stumble upon",
                    },
                    powerLevel: {
                      type: "number",
                      minimum: 0,
                      maximum: 9000,
                      description: "Power level between 0 and 9000",
                    },
                    tags: {
                      type: "array",
                      items: {
                        type: "string",
                      },
                      description: "Any thematic tags you want to attach",
                    },
                  },
                  required: ["id"],
                  additionalProperties: true,
                },
                description:
                  "Array of records pulled from your latest side quest",
              },
            },
            required: ["records"],
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

    if (request.params.name === "multiply") {
      const args = request.params.arguments as { a: number; b: number };
      const result = args.a * args.b;
      return {
        content: [
          {
            type: "text",
            text: `${args.a} × ${args.b} = ${result}`,
          },
        ],
      };
    }

    if (request.params.name === "process-records") {
      const args = request.params.arguments as
        | { records?: unknown }
        | undefined;

      if (!args || !Array.isArray(args.records)) {
        throw new Error("records array is required");
      }

      const processedRecords = args.records.map((record, index) => {
        if (!record || typeof record !== "object") {
          throw new Error(`Record at index ${index} must be an object`);
        }

        const typedRecord = record as Record<string, unknown>;

        const idValue = typedRecord["id"];
        if (typeof idValue !== "string" || !idValue.trim()) {
          throw new Error(
            `Record at index ${index} must include a non-empty string id`
          );
        }
        const id = idValue.trim();

        const titleValue = typedRecord["title"];
        if (titleValue !== undefined && typeof titleValue !== "string") {
          throw new Error(`Record at index ${index} title must be a string`);
        }
        const title =
          typeof titleValue === "string" && titleValue.trim().length > 0
            ? titleValue.trim()
            : undefined;

        const rarityValue = typedRecord["rarity"];
        if (rarityValue !== undefined && typeof rarityValue !== "string") {
          throw new Error(`Record at index ${index} rarity must be a string`);
        }
        if (rarityValue !== undefined && !isRarityLevel(rarityValue)) {
          throw new Error(
            `Record at index ${index} rarity must be one of ${allowedRarities.join(
              ", "
            )}`
          );
        }
        const rarity: RarityLevel =
          typeof rarityValue === "string" && isRarityLevel(rarityValue)
            ? rarityValue
            : "common";

        const powerLevelValue = typedRecord["powerLevel"];
        if (
          powerLevelValue !== undefined &&
          (typeof powerLevelValue !== "number" ||
            Number.isNaN(powerLevelValue) ||
            powerLevelValue < 0 ||
            powerLevelValue > 9000)
        ) {
          throw new Error(
            `Record at index ${index} powerLevel must be a number between 0 and 9000`
          );
        }
        const powerLevel =
          typeof powerLevelValue === "number" && !Number.isNaN(powerLevelValue)
            ? powerLevelValue
            : undefined;

        const tagsValue = typedRecord["tags"];
        let tags: string[] | undefined;
        if (tagsValue !== undefined) {
          if (!Array.isArray(tagsValue)) {
            throw new Error(
              `Record at index ${index} tags must be an array of strings`
            );
          }
          const invalidTagIndex = tagsValue.findIndex(
            (tag) => typeof tag !== "string"
          );
          if (invalidTagIndex !== -1) {
            throw new Error(
              `Record at index ${index} tag at position ${invalidTagIndex} must be a string`
            );
          }
          tags = (tagsValue as string[])
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 0);
        }

        const additionalFields = Object.keys(typedRecord).filter(
          (key) => !knownAdventureFieldNames.has(key)
        );

        const energyScore =
          (powerLevel ?? 0) + (tags?.length ?? 0) * 7 + rarityBonusMap[rarity];
        const vibe =
          energyScore >= 200
            ? "mythic"
            : energyScore >= 120
            ? "heroic"
            : energyScore >= 40
            ? "adventurous"
            : "chill";

        return {
          id,
          title,
          rarity,
          powerLevel,
          tags,
          energyScore,
          vibe,
          additionalFieldCount: additionalFields.length,
          additionalFields,
        };
      });

      const totalEnergy = processedRecords.reduce(
        (sum, record) => sum + record.energyScore,
        0
      );

      const partyMood =
        totalEnergy >= 400
          ? "epic raid"
          : totalEnergy >= 200
          ? "heroic dungeon crawl"
          : totalEnergy >= 80
          ? "spirited side quest"
          : "cozy planning session";

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                processed: processedRecords.length,
                totalEnergy,
                partyMood,
                records: processedRecords,
              },
              null,
              2
            ),
          },
        ],
      };
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
