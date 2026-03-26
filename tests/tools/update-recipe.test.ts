import { describe, it, expect, vi, beforeEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";

const existingRecipe = {
  id: "upd-123",
  name: "My Recipe",
  slug: "my-recipe",
  description: "Original description",
  recipeCategory: [],
  tags: [],
  tools: [],
  rating: null,
  dateAdded: "2024-01-01",
  dateUpdated: "2024-01-01",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  recipeServings: 4,
  recipeYield: "4 servings",
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

const updatedRecipe = {
  ...existingRecipe,
  name: "Updated Recipe",
  slug: "updated-recipe",
  description: "Now with new description",
  tags: [{ id: "t1", name: "Updated", slug: "updated" }],
  rating: 5,
  dateUpdated: "2024-03-01",
  updatedAt: "2024-03-01T00:00:00Z",
  totalTime: "1 hour",
  prepTime: "20 minutes",
  cookTime: "40 minutes",
};

describe("update_recipe tool", () => {
  let client: Client;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.restoreAllMocks();

    // updateRecipe does GET (existing), resolves unit/food IDs, then PUT (merged)
    fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      const jsonResponse = (data: unknown) => ({
        ok: true, status: 200, statusText: "OK",
        json: vi.fn().mockResolvedValue(data),
        text: vi.fn().mockResolvedValue(""),
        headers: { get: vi.fn().mockReturnValue("application/json") },
      });

      if (options?.method === "PUT") {
        return Promise.resolve(jsonResponse(updatedRecipe));
      }
      // Unit search
      if (url.includes("/api/units")) {
        const search = new URL(url).searchParams.get("search") ?? "";
        return Promise.resolve(jsonResponse({
          items: [{ id: `unit-${search}-id`, name: search }],
          page: 1, perPage: 10, total: 1, totalPages: 1,
        }));
      }
      // Food search
      if (url.includes("/api/foods")) {
        const search = new URL(url).searchParams.get("search") ?? "";
        return Promise.resolve(jsonResponse({
          items: [{ id: `food-${search}-id`, name: search }],
          page: 1, perPage: 10, total: 1, totalPages: 1,
        }));
      }
      // GET recipe: return existing
      return Promise.resolve(jsonResponse(existingRecipe));
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

  it("updates recipe name and description", async () => {
    const result = await client.callTool({
      name: "update_recipe",
      arguments: {
        slug: "my-recipe",
        name: "Updated Recipe",
        description: "Now with new description",
      },
    });

    expect(result.isError).toBeUndefined();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("updated successfully");

    // First call: GET existing recipe
    expect(fetchMock.mock.calls[0][0]).toContain("/api/recipes/my-recipe");

    // Find PUT call (may not be second due to unit/food resolution calls)
    const putCall = fetchMock.mock.calls.find(
      ([, opts]: [string, RequestInit | undefined]) => opts?.method === "PUT"
    );
    expect(putCall).toBeDefined();
    expect(putCall![0]).toContain("/api/recipes/my-recipe");
    const body = JSON.parse(putCall![1].body as string);
    expect(body.name).toBe("Updated Recipe");
    expect(body.description).toBe("Now with new description");
  });

  it("updates recipe ingredients and instructions", async () => {
    await client.callTool({
      name: "update_recipe",
      arguments: {
        slug: "my-recipe",
        recipeIngredient: [
          { quantity: 3, unit: { name: "cups" }, food: { name: "rice" } },
        ],
        recipeInstructions: [
          { text: "Cook the rice" },
          { text: "Serve warm" },
        ],
      },
    });

    // Find PUT call (after GET + unit/food resolution calls)
    const putCall = fetchMock.mock.calls.find(
      ([, opts]: [string, RequestInit | undefined]) => opts?.method === "PUT"
    );
    expect(putCall).toBeDefined();
    const body = JSON.parse(putCall![1].body as string);
    expect(body.recipeIngredient).toHaveLength(1);
    expect(body.recipeInstructions).toHaveLength(2);
    // ingredientReferences should be auto-added
    expect(body.recipeInstructions[0].ingredientReferences).toEqual([]);
    expect(body.recipeInstructions[1].ingredientReferences).toEqual([]);
    // Ingredient should have resolved unit/food IDs
    expect(body.recipeIngredient[0].unit.id).toBe("unit-cups-id");
    expect(body.recipeIngredient[0].food.id).toBe("food-rice-id");
    expect(body.recipeIngredient[0].quantity).toBe(3);
  });

  it("returns error when no update fields provided", async () => {
    const result = await client.callTool({
      name: "update_recipe",
      arguments: { slug: "my-recipe" },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("No fields provided");
    // Should not have called the API
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns error on API failure", async () => {
    // GET fails (recipe not found)
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: vi.fn().mockResolvedValue("Recipe not found"),
      headers: {
        get: vi.fn().mockReturnValue("text/plain"),
      },
    });

    const result = await client.callTool({
      name: "update_recipe",
      arguments: {
        slug: "nonexistent",
        name: "New Name",
      },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("Failed to update recipe");
  });
});
