import { describe, it, expect, vi, beforeEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";

describe("MCP Server", () => {
  let client: Client;

  beforeEach(async () => {
    vi.restoreAllMocks();

    // Stub fetch so tools don't fail
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: vi.fn().mockResolvedValue({}),
        text: vi.fn().mockResolvedValue(""),
        headers: { get: vi.fn().mockReturnValue("application/json") },
      })
    );

    const server = createServer({
      mealieUrl: "http://mealie.local",
      mealieApiToken: "test-token",
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client({ name: "test-client", version: "1.0.0" });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  });

  it("exposes server info", async () => {
    const info = client.getServerVersion();
    expect(info).toMatchObject({
      name: "mealie-mcp-server",
      version: "1.0.0",
    });
  });

  it("registers all expected tools", async () => {
    const { tools } = await client.listTools();
    const toolNames = tools.map((t) => t.name).sort();

    expect(toolNames).toEqual([
      "create_recipe",
      "get_recipe",
      "import_recipe",
      "search_recipes",
      "update_recipe",
    ]);
  });

  it("each tool has a description", async () => {
    const { tools } = await client.listTools();

    for (const tool of tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.description!.length).toBeGreaterThan(10);
    }
  });

  it("each tool has an input schema", async () => {
    const { tools } = await client.listTools();

    for (const tool of tools) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe("object");
    }
  });
});
