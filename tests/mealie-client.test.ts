import { describe, it, expect, vi, beforeEach } from "vitest";
import { MealieClient, MealieClientError } from "../src/mealie-client.js";

const BASE_URL = "http://mealie.local";
const TOKEN = "test-token";

function mockFetch(response: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  json?: unknown;
  text?: string;
  contentType?: string;
}) {
  return vi.fn().mockResolvedValue({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    statusText: response.statusText ?? "OK",
    json: vi.fn().mockResolvedValue(response.json),
    text: vi.fn().mockResolvedValue(response.text ?? ""),
    headers: {
      get: vi.fn().mockImplementation((name: string) => {
        if (name === "content-type") {
          return response.contentType ?? "application/json";
        }
        return null;
      }),
    },
  });
}

describe("MealieClient", () => {
  let client: MealieClient;

  beforeEach(() => {
    client = new MealieClient(BASE_URL, TOKEN);
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("strips trailing slashes from base URL", () => {
      const c = new MealieClient("http://mealie.local///", TOKEN);
      const fetchMock = mockFetch({ json: { slug: "test" } });
      vi.stubGlobal("fetch", fetchMock);

      c.getRecipe("test");

      expect(fetchMock).toHaveBeenCalledWith(
        "http://mealie.local/api/recipes/test",
        expect.any(Object)
      );
    });
  });

  describe("request headers", () => {
    it("sends Authorization and Content-Type headers", async () => {
      const fetchMock = mockFetch({ json: {} });
      vi.stubGlobal("fetch", fetchMock);

      await client.getRecipe("test-recipe");

      const [, options] = fetchMock.mock.calls[0];
      expect(options.headers).toMatchObject({
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      });
    });
  });

  describe("error handling", () => {
    it("throws MealieClientError on non-OK responses", async () => {
      const fetchMock = mockFetch({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: "Recipe not found",
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(client.getRecipe("nonexistent")).rejects.toThrow(
        MealieClientError
      );

      try {
        await client.getRecipe("nonexistent");
      } catch (e) {
        const err = e as MealieClientError;
        expect(err.status).toBe(404);
        expect(err.statusText).toBe("Not Found");
        expect(err.message).toContain("404");
        expect(err.message).toContain("Recipe not found");
      }
    });

    it("handles error responses with no body", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: vi.fn().mockRejectedValue(new Error("no body")),
        headers: {
          get: vi.fn().mockReturnValue(null),
        },
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(client.getRecipe("test")).rejects.toThrow(
        MealieClientError
      );
    });
  });

  describe("getRecipe", () => {
    it("fetches a recipe by slug", async () => {
      const recipe = { slug: "pasta", name: "Pasta", recipeIngredient: [] };
      const fetchMock = mockFetch({ json: recipe });
      vi.stubGlobal("fetch", fetchMock);

      const result = await client.getRecipe("pasta");

      expect(result).toEqual(recipe);
      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/api/recipes/pasta`,
        expect.any(Object)
      );
    });

    it("encodes special characters in slug", async () => {
      const fetchMock = mockFetch({ json: {} });
      vi.stubGlobal("fetch", fetchMock);

      await client.getRecipe("my recipe/special");

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/api/recipes/my%20recipe%2Fspecial`,
        expect.any(Object)
      );
    });
  });

  describe("searchRecipes", () => {
    it("fetches all recipes with no params", async () => {
      const response = { page: 1, perPage: 50, total: 0, totalPages: 0, items: [] };
      const fetchMock = mockFetch({ json: response });
      vi.stubGlobal("fetch", fetchMock);

      const result = await client.searchRecipes();

      expect(result).toEqual(response);
      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/api/recipes`,
        expect.any(Object)
      );
    });

    it("builds search query params correctly", async () => {
      const fetchMock = mockFetch({
        json: { page: 1, perPage: 10, total: 1, totalPages: 1, items: [] },
      });
      vi.stubGlobal("fetch", fetchMock);

      await client.searchRecipes({
        search: "pasta",
        page: 2,
        perPage: 10,
        orderBy: "name",
        orderDirection: "asc",
      });

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("search=pasta");
      expect(url).toContain("page=2");
      expect(url).toContain("perPage=10");
      expect(url).toContain("orderBy=name");
      expect(url).toContain("orderDirection=asc");
    });

    it("handles array filter params (categories, tags)", async () => {
      const fetchMock = mockFetch({
        json: { page: 1, perPage: 50, total: 0, totalPages: 0, items: [] },
      });
      vi.stubGlobal("fetch", fetchMock);

      await client.searchRecipes({
        categories: ["dinner", "lunch"],
        tags: ["quick"],
        requireAllCategories: true,
        requireAllTags: true,
      });

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("categories=dinner");
      expect(url).toContain("categories=lunch");
      expect(url).toContain("tags=quick");
      expect(url).toContain("requireAllCategories=true");
      expect(url).toContain("requireAllTags=true");
    });

    it("handles foods and tools array filters", async () => {
      const fetchMock = mockFetch({
        json: { page: 1, perPage: 50, total: 0, totalPages: 0, items: [] },
      });
      vi.stubGlobal("fetch", fetchMock);

      await client.searchRecipes({
        foods: ["chicken", "rice"],
        tools: ["oven"],
        requireAllFoods: true,
        requireAllTools: true,
      });

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("foods=chicken");
      expect(url).toContain("foods=rice");
      expect(url).toContain("tools=oven");
      expect(url).toContain("requireAllFoods=true");
      expect(url).toContain("requireAllTools=true");
    });
  });

  describe("createRecipe", () => {
    it("creates a recipe and returns slug", async () => {
      const fetchMock = mockFetch({
        text: "my-new-recipe",
        contentType: "text/plain",
      });
      vi.stubGlobal("fetch", fetchMock);

      const slug = await client.createRecipe("My New Recipe");

      expect(slug).toBe("my-new-recipe");
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/api/recipes`);
      expect(options.method).toBe("POST");
      expect(JSON.parse(options.body)).toEqual({ name: "My New Recipe" });
    });

    it("handles JSON response for slug", async () => {
      // Some Mealie versions return the slug as JSON string
      const fetchMock = mockFetch({
        json: "my-new-recipe",
        contentType: "application/json",
      });
      vi.stubGlobal("fetch", fetchMock);

      const slug = await client.createRecipe("My New Recipe");
      expect(slug).toBe("my-new-recipe");
    });
  });

  describe("updateRecipe", () => {
    it("sends PATCH request with update data", async () => {
      const updatedRecipe = { slug: "pasta", name: "Updated Pasta" };
      const fetchMock = mockFetch({ json: updatedRecipe });
      vi.stubGlobal("fetch", fetchMock);

      const result = await client.updateRecipe("pasta", {
        name: "Updated Pasta",
        description: "A better pasta",
      });

      expect(result).toEqual(updatedRecipe);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/api/recipes/pasta`);
      expect(options.method).toBe("PATCH");
      expect(JSON.parse(options.body)).toEqual({
        name: "Updated Pasta",
        description: "A better pasta",
      });
    });
  });

  describe("scrapeRecipeFromUrl", () => {
    it("sends scrape request and returns slug", async () => {
      const fetchMock = mockFetch({
        text: "scraped-recipe",
        contentType: "text/plain",
      });
      vi.stubGlobal("fetch", fetchMock);

      const slug = await client.scrapeRecipeFromUrl({
        url: "https://example.com/recipe",
        includeTags: true,
        includeCategories: false,
      });

      expect(slug).toBe("scraped-recipe");
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/api/recipes/create/url`);
      expect(options.method).toBe("POST");
      expect(JSON.parse(options.body)).toEqual({
        url: "https://example.com/recipe",
        includeTags: true,
        includeCategories: false,
      });
    });
  });
});
