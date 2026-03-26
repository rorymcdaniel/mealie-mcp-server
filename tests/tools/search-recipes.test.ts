import { describe, it, expect, vi, beforeEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";

const paginatedResponse = {
  page: 1,
  perPage: 50,
  total: 2,
  totalPages: 1,
  items: [
    {
      id: "r1",
      name: "Spaghetti Carbonara",
      slug: "spaghetti-carbonara",
      description: "Classic Italian pasta",
      recipeCategory: [{ id: "c1", name: "Dinner", slug: "dinner" }],
      tags: [{ id: "t1", name: "Italian", slug: "italian" }],
      tools: [],
      rating: 5,
      dateAdded: "2024-01-01",
      dateUpdated: null,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: null,
      recipeServings: 4,
      recipeYield: "4 servings",
      totalTime: "30 minutes",
      prepTime: "10 minutes",
      cookTime: "20 minutes",
      performTime: null,
      orgURL: null,
    },
    {
      id: "r2",
      name: "Chicken Soup",
      slug: "chicken-soup",
      description: "Comforting soup",
      recipeCategory: [],
      tags: [],
      tools: [],
      rating: null,
      dateAdded: "2024-02-01",
      dateUpdated: null,
      createdAt: "2024-02-01T00:00:00Z",
      updatedAt: null,
      recipeServings: 6,
      recipeYield: "6 servings",
      totalTime: "1 hour",
      prepTime: "15 minutes",
      cookTime: "45 minutes",
      performTime: null,
      orgURL: null,
    },
  ],
  next: null,
  previous: null,
};

describe("search_recipes tool", () => {
  let client: Client;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.restoreAllMocks();

    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: vi.fn().mockResolvedValue(paginatedResponse),
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

  it("lists all recipes with no parameters", async () => {
    const result = await client.callTool({
      name: "search_recipes",
      arguments: {},
    });

    expect(result.isError).toBeUndefined();
    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);
    expect(data.items).toHaveLength(2);
    expect(data.total).toBe(2);
  });

  it("passes search query to API", async () => {
    await client.callTool({
      name: "search_recipes",
      arguments: { search: "pasta" },
    });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("search=pasta");
  });

  it("passes filter params to API", async () => {
    await client.callTool({
      name: "search_recipes",
      arguments: {
        categories: ["dinner"],
        tags: ["italian"],
        requireAllTags: true,
        page: 2,
        perPage: 10,
        orderBy: "name",
        orderDirection: "asc",
      },
    });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("categories=dinner");
    expect(url).toContain("tags=italian");
    expect(url).toContain("requireAllTags=true");
    expect(url).toContain("page=2");
    expect(url).toContain("perPage=10");
    expect(url).toContain("orderBy=name");
    expect(url).toContain("orderDirection=asc");
  });

  it("returns error on API failure", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: vi.fn().mockResolvedValue("server error"),
      headers: {
        get: vi.fn().mockReturnValue("text/plain"),
      },
    });

    const result = await client.callTool({
      name: "search_recipes",
      arguments: {},
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("Failed to search recipes");
  });
});
