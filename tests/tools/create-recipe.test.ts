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

    fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      const jsonResponse = (data: unknown, contentType = "application/json") => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: vi.fn().mockResolvedValue(data),
        text: vi.fn().mockResolvedValue(typeof data === "string" ? data : ""),
        headers: { get: vi.fn().mockReturnValue(contentType) },
      });

      // POST /api/recipes -> returns slug
      if (url.includes("/api/recipes") && options?.method === "POST") {
        return Promise.resolve(jsonResponse("chocolate-cake", "text/plain"));
      }
      // PUT /api/recipes -> returns updated recipe
      if (url.includes("/api/recipes") && options?.method === "PUT") {
        return Promise.resolve(jsonResponse(createdRecipe));
      }
      // GET /api/units -> return matching unit
      if (url.includes("/api/units")) {
        const search = new URL(url).searchParams.get("search") ?? "";
        return Promise.resolve(jsonResponse({
          items: [{ id: `unit-${search}-id`, name: search }],
          page: 1, perPage: 10, total: 1, totalPages: 1,
        }));
      }
      // GET /api/foods -> return matching food
      if (url.includes("/api/foods")) {
        const search = new URL(url).searchParams.get("search") ?? "";
        return Promise.resolve(jsonResponse({
          items: [{ id: `food-${search}-id`, name: search }],
          page: 1, perPage: 10, total: 1, totalPages: 1,
        }));
      }
      // GET /api/recipes/slug -> returns recipe
      return Promise.resolve(jsonResponse(createdRecipe));
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

    // Find the PUT call (there are extra calls for unit/food resolution)
    const putCall = fetchMock.mock.calls.find(
      ([, opts]: [string, RequestInit | undefined]) => opts?.method === "PUT"
    );
    expect(putCall).toBeDefined();

    const putBody = JSON.parse(putCall![1].body as string);
    expect(putBody.description).toBe("Rich and moist");
    expect(putBody.recipeIngredient).toHaveLength(2);
    expect(putBody.recipeInstructions).toHaveLength(2);
    // ingredientReferences should be auto-added to instructions
    expect(putBody.recipeInstructions[0].ingredientReferences).toEqual([]);
    expect(putBody.recipeInstructions[1].ingredientReferences).toEqual([]);
    // Ingredients should have resolved IDs (not flattened to notes)
    expect(putBody.recipeIngredient[0].unit.id).toBeDefined();
    expect(putBody.recipeIngredient[0].food.id).toBeDefined();
    expect(putBody.recipeIngredient[0].quantity).toBe(2);
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
