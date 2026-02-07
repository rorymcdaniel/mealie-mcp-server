import { describe, it, expect, vi, beforeEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";

const importedRecipe = {
  id: "imp-123",
  name: "Imported Recipe",
  slug: "imported-recipe",
  description: "Scraped from the web",
  recipeCategory: [],
  tags: [],
  tools: [],
  rating: null,
  dateAdded: "2024-03-01",
  dateUpdated: null,
  createdAt: "2024-03-01T00:00:00Z",
  updatedAt: null,
  recipeServings: 4,
  recipeYield: "4 servings",
  totalTime: "45 minutes",
  prepTime: "15 minutes",
  cookTime: "30 minutes",
  performTime: null,
  orgURL: "https://example.com/recipe",
  recipeIngredient: [
    {
      quantity: 1,
      unit: null,
      food: null,
      note: "onion, diced",
      display: "1 onion, diced",
      title: null,
      originalText: "1 onion, diced",
      referenceId: "ref-1",
    },
  ],
  recipeInstructions: [
    { id: "s1", title: null, text: "Dice the onion" },
  ],
  nutrition: null,
  settings: null,
  notes: [],
  extras: {},
};

describe("import_recipe tool", () => {
  let client: Client;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.restoreAllMocks();

    fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      // POST /api/recipes/create/url -> returns slug
      if (options?.method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 201,
          statusText: "Created",
          json: vi.fn().mockResolvedValue("imported-recipe"),
          text: vi.fn().mockResolvedValue("imported-recipe"),
          headers: {
            get: vi.fn().mockReturnValue("text/plain"),
          },
        });
      }
      // GET /api/recipes/{slug} -> returns recipe
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: vi.fn().mockResolvedValue(importedRecipe),
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

  it("imports a recipe from URL", async () => {
    const result = await client.callTool({
      name: "import_recipe",
      arguments: { url: "https://example.com/recipe" },
    });

    expect(result.isError).toBeUndefined();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("imported successfully");
    expect(content[0].text).toContain("Imported Recipe");

    // Verify the scrape request
    const postCall = fetchMock.mock.calls[0];
    expect(postCall[0]).toContain("/api/recipes/create/url");
    expect(postCall[1].method).toBe("POST");
    const body = JSON.parse(postCall[1].body);
    expect(body.url).toBe("https://example.com/recipe");
  });

  it("passes includeTags and includeCategories", async () => {
    await client.callTool({
      name: "import_recipe",
      arguments: {
        url: "https://example.com/recipe",
        includeTags: true,
        includeCategories: true,
      },
    });

    const postCall = fetchMock.mock.calls[0];
    const body = JSON.parse(postCall[1].body);
    expect(body.includeTags).toBe(true);
    expect(body.includeCategories).toBe(true);
  });

  it("returns error when scrape fails", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: vi.fn().mockResolvedValue("Could not scrape URL"),
      headers: {
        get: vi.fn().mockReturnValue("text/plain"),
      },
    });

    const result = await client.callTool({
      name: "import_recipe",
      arguments: { url: "https://example.com/not-a-recipe" },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("Failed to import recipe");
  });
});
