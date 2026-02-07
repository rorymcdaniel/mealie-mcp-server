import { describe, it, expect, vi, beforeEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";

const createdRecipe = {
  id: "new-123",
  name: "Chocolate Cake",
  slug: "chocolate-cake",
  description: "Rich and moist",
  recipeCategory: [],
  tags: [],
  tools: [],
  rating: null,
  dateAdded: "2024-03-01",
  dateUpdated: null,
  createdAt: "2024-03-01T00:00:00Z",
  updatedAt: null,
  recipeServings: 8,
  recipeYield: "8 slices",
  totalTime: null,
  prepTime: null,
  cookTime: null,
  performTime: null,
  orgURL: null,
  recipeIngredient: [],
  recipeInstructions: [],
  nutrition: null,
  settings: null,
  notes: [],
  extras: {},
};

describe("create_recipe tool", () => {
  let client: Client;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.restoreAllMocks();

    let callCount = 0;
    fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      callCount++;
      // First call: POST /api/recipes -> returns slug
      if (options?.method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 201,
          statusText: "Created",
          json: vi.fn().mockResolvedValue("chocolate-cake"),
          text: vi.fn().mockResolvedValue("chocolate-cake"),
          headers: {
            get: vi.fn().mockReturnValue("text/plain"),
          },
        });
      }
      // PATCH call: returns updated recipe
      if (options?.method === "PATCH") {
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          json: vi.fn().mockResolvedValue(createdRecipe),
          text: vi.fn().mockResolvedValue(""),
          headers: {
            get: vi.fn().mockReturnValue("application/json"),
          },
        });
      }
      // GET call: returns recipe
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: vi.fn().mockResolvedValue(createdRecipe),
        text: vi.fn().mockResolvedValue(""),
        headers: {
          get: vi.fn().mockReturnValue("application/json"),
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

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

  it("creates a recipe with just a name", async () => {
    const result = await client.callTool({
      name: "create_recipe",
      arguments: { name: "Chocolate Cake" },
    });

    expect(result.isError).toBeUndefined();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("Chocolate Cake");
    expect(content[0].text).toContain("created successfully");

    // Should have called POST then GET (no PATCH since no details)
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall[0]).toContain("/api/recipes");
    expect(firstCall[1].method).toBe("POST");
  });

  it("creates a recipe with full details", async () => {
    const result = await client.callTool({
      name: "create_recipe",
      arguments: {
        name: "Chocolate Cake",
        description: "Rich and moist",
        recipeYield: "8 slices",
        prepTime: "20 minutes",
        cookTime: "35 minutes",
        recipeIngredient: [
          { quantity: 2, unit: { name: "cups" }, food: { name: "flour" } },
          { quantity: 1, unit: { name: "cup" }, food: { name: "sugar" } },
        ],
        recipeInstructions: [
          { text: "Preheat oven to 350°F" },
          { text: "Mix dry ingredients" },
        ],
        tags: [{ name: "Dessert" }],
        recipeCategory: [{ name: "Baking" }],
      },
    });

    expect(result.isError).toBeUndefined();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("created successfully");

    // Should have called POST then PATCH (with details)
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCall = fetchMock.mock.calls[1];
    expect(secondCall[1].method).toBe("PATCH");

    const patchBody = JSON.parse(secondCall[1].body);
    expect(patchBody.description).toBe("Rich and moist");
    expect(patchBody.recipeIngredient).toHaveLength(2);
    expect(patchBody.recipeInstructions).toHaveLength(2);
  });

  it("returns error when API fails", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: vi.fn().mockResolvedValue("Invalid recipe"),
      headers: {
        get: vi.fn().mockReturnValue("text/plain"),
      },
    });

    const result = await client.callTool({
      name: "create_recipe",
      arguments: { name: "Bad Recipe" },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("Failed to create recipe");
  });
});
