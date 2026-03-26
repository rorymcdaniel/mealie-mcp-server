import { describe, it, expect, vi, beforeEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import type { Recipe } from "../../src/types.js";

const sampleRecipe: Recipe = {
  id: "abc-123",
  name: "Test Pasta",
  slug: "test-pasta",
  description: "A delicious test pasta",
  recipeCategory: [{ id: "cat-1", name: "Dinner", slug: "dinner" }],
  tags: [{ id: "tag-1", name: "Quick", slug: "quick" }],
  tools: [],
  rating: 4,
  dateAdded: "2024-01-01",
  dateUpdated: "2024-01-02",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-02T00:00:00Z",
  recipeServings: 4,
  recipeYield: "4 servings",
  totalTime: "30 minutes",
  prepTime: "10 minutes",
  cookTime: "20 minutes",
  performTime: null,
  orgURL: null,
  recipeIngredient: [
    {
      quantity: 200,
      unit: null,
      food: { id: "f1", name: "pasta", pluralName: null, description: "" },
      note: "any shape",
      display: "200g pasta",
      title: null,
      originalText: "200g pasta, any shape",
      referenceId: "ref-1",
    },
  ],
  recipeInstructions: [
    { id: "step-1", title: null, text: "Boil the pasta" },
  ],
  nutrition: { calories: "350", carbohydrateContent: null, cholesterolContent: null, fatContent: null, fiberContent: null, proteinContent: null, saturatedFatContent: null, sodiumContent: null, sugarContent: null, transFatContent: null, unsaturatedFatContent: null },
  settings: null,
  notes: [],
  extras: {},
};

describe("get_recipe tool", () => {
  let client: Client;

  beforeEach(async () => {
    vi.restoreAllMocks();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: vi.fn().mockResolvedValue(sampleRecipe),
      text: vi.fn().mockResolvedValue(""),
      headers: {
        get: vi.fn().mockReturnValue("application/json"),
      },
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

  it("returns full recipe data for a valid slug", async () => {
    const result = await client.callTool({
      name: "get_recipe",
      arguments: { slug: "test-pasta" },
    });

    expect(result.isError).toBeUndefined();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content).toHaveLength(1);
    expect(content[0].type).toBe("text");

    const recipe = JSON.parse(content[0].text);
    expect(recipe.name).toBe("Test Pasta");
    expect(recipe.slug).toBe("test-pasta");
    expect(recipe.recipeIngredient).toHaveLength(1);
    expect(recipe.recipeInstructions).toHaveLength(1);
  });

  it("returns error for non-existent recipe", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: vi.fn().mockResolvedValue("Not found"),
      headers: {
        get: vi.fn().mockReturnValue("text/plain"),
      },
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.callTool({
      name: "get_recipe",
      arguments: { slug: "nonexistent" },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("Failed to get recipe");
    expect(content[0].text).toContain("nonexistent");
  });
});
