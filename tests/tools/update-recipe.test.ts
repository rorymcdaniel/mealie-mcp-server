import { describe, it, expect, vi, beforeEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";

const updatedRecipe = {
  id: "upd-123",
  name: "Updated Recipe",
  slug: "updated-recipe",
  description: "Now with new description",
  recipeCategory: [],
  tags: [{ id: "t1", name: "Updated", slug: "updated" }],
  tools: [],
  rating: 5,
  dateAdded: "2024-01-01",
  dateUpdated: "2024-03-01",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-03-01T00:00:00Z",
  recipeServings: 4,
  recipeYield: "4 servings",
  totalTime: "1 hour",
  prepTime: "20 minutes",
  cookTime: "40 minutes",
  performTime: null,
  orgURL: null,
  recipeIngredient: [],
  recipeInstructions: [],
  nutrition: null,
  settings: null,
  notes: [],
  extras: {},
};

describe("update_recipe tool", () => {
  let client: Client;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.restoreAllMocks();

    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: vi.fn().mockResolvedValue(updatedRecipe),
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

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/recipes/my-recipe");
    expect(options.method).toBe("PATCH");
    const body = JSON.parse(options.body);
    expect(body.name).toBe("Updated Recipe");
    expect(body.description).toBe("Now with new description");
    // slug should not be in the PATCH body
    expect(body.slug).toBeUndefined();
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

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.recipeIngredient).toHaveLength(1);
    expect(body.recipeInstructions).toHaveLength(2);
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
