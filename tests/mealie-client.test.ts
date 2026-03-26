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

    it("throws timeout error when fetch is aborted", async () => {
      const fetchMock = vi.fn().mockRejectedValue(
        Object.assign(new Error("The operation was aborted"), { name: "AbortError" })
      );
      vi.stubGlobal("fetch", fetchMock);

      await expect(client.getRecipe("test")).rejects.toThrow(MealieClientError);
      await expect(client.getRecipe("test")).rejects.toThrow("timed out");
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
    it("fetches existing recipe then sends PUT with merged data", async () => {
      const existingRecipe = {
        slug: "pasta",
        name: "Pasta",
        description: "Original",
        recipeIngredient: [],
        recipeInstructions: [],
      };
      const updatedRecipe = { slug: "pasta", name: "Updated Pasta" };

      const fetchMock = vi.fn()
        // First call: GET existing recipe
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          json: vi.fn().mockResolvedValue(existingRecipe),
          text: vi.fn().mockResolvedValue(""),
          headers: { get: vi.fn().mockReturnValue("application/json") },
        })
        // Second call: PUT merged recipe
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          json: vi.fn().mockResolvedValue(updatedRecipe),
          text: vi.fn().mockResolvedValue(""),
          headers: { get: vi.fn().mockReturnValue("application/json") },
        });
      vi.stubGlobal("fetch", fetchMock);

      const result = await client.updateRecipe("pasta", {
        name: "Updated Pasta",
        description: "A better pasta",
      });

      expect(result).toEqual(updatedRecipe);

      // First call: GET
      expect(fetchMock.mock.calls[0][0]).toBe(`${BASE_URL}/api/recipes/pasta`);
      expect(fetchMock.mock.calls[0][1].method).toBeUndefined(); // GET has no method

      // Second call: PUT with merged data
      expect(fetchMock.mock.calls[1][0]).toBe(`${BASE_URL}/api/recipes/pasta`);
      expect(fetchMock.mock.calls[1][1].method).toBe("PUT");
      const body = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(body.name).toBe("Updated Pasta");
      expect(body.description).toBe("A better pasta");
      // Preserves existing fields
      expect(body.slug).toBe("pasta");
    });

    it("adds ingredientReferences to instructions that lack them", async () => {
      const existingRecipe = {
        slug: "pasta",
        name: "Pasta",
        recipeIngredient: [],
        recipeInstructions: [],
      };

      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          json: vi.fn().mockResolvedValue(existingRecipe),
          text: vi.fn().mockResolvedValue(""),
          headers: { get: vi.fn().mockReturnValue("application/json") },
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          json: vi.fn().mockResolvedValue(existingRecipe),
          text: vi.fn().mockResolvedValue(""),
          headers: { get: vi.fn().mockReturnValue("application/json") },
        });
      vi.stubGlobal("fetch", fetchMock);

      await client.updateRecipe("pasta", {
        recipeInstructions: [
          { text: "Step 1" },
          { text: "Step 2" },
        ],
      });

      const body = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(body.recipeInstructions[0].ingredientReferences).toEqual([]);
      expect(body.recipeInstructions[1].ingredientReferences).toEqual([]);
    });

    it("resolves unit/food IDs by searching Mealie when missing", async () => {
      const existingRecipe = {
        slug: "pasta",
        name: "Pasta",
        recipeIngredient: [],
        recipeInstructions: [],
      };
      const cupsUnit = { id: "unit-cups-id", name: "cups" };
      const flourFood = { id: "food-flour-id", name: "flour" };

      const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        const jsonResponse = (data: unknown) => ({
          ok: true, status: 200, statusText: "OK",
          json: vi.fn().mockResolvedValue(data),
          text: vi.fn().mockResolvedValue(""),
          headers: { get: vi.fn().mockReturnValue("application/json") },
        });

        if (url.includes("/api/recipes/pasta") && !options?.method) {
          return Promise.resolve(jsonResponse(existingRecipe));
        }
        if (url.includes("/api/units") && url.includes("search=cups")) {
          return Promise.resolve(jsonResponse({ items: [cupsUnit], page: 1, perPage: 10, total: 1, totalPages: 1 }));
        }
        if (url.includes("/api/foods") && url.includes("search=flour")) {
          return Promise.resolve(jsonResponse({ items: [flourFood], page: 1, perPage: 10, total: 1, totalPages: 1 }));
        }
        if (url.includes("/api/recipes/pasta") && options?.method === "PUT") {
          return Promise.resolve(jsonResponse(existingRecipe));
        }
        return Promise.resolve(jsonResponse({}));
      });
      vi.stubGlobal("fetch", fetchMock);

      await client.updateRecipe("pasta", {
        recipeIngredient: [
          { quantity: 2, unit: { name: "cups" }, food: { name: "flour" }, note: "sifted" },
          { quantity: 1, unit: { id: "u1", name: "tsp" }, food: { id: "f1", name: "salt" } },
        ],
      });

      // Find the PUT call
      const putCall = fetchMock.mock.calls.find(
        ([, opts]: [string, RequestInit | undefined]) => opts?.method === "PUT"
      );
      const body = JSON.parse(putCall![1].body as string);
      // First ingredient: resolved IDs from search
      expect(body.recipeIngredient[0].unit).toEqual(cupsUnit);
      expect(body.recipeIngredient[0].food).toEqual(flourFood);
      expect(body.recipeIngredient[0].quantity).toBe(2);
      expect(body.recipeIngredient[0].note).toBe("sifted");
      // Second ingredient: already had IDs, unchanged
      expect(body.recipeIngredient[1].unit).toEqual({ id: "u1", name: "tsp" });
      expect(body.recipeIngredient[1].food).toEqual({ id: "f1", name: "salt" });
      expect(body.recipeIngredient[1].quantity).toBe(1);
    });

    it("creates units/foods when not found in Mealie", async () => {
      const existingRecipe = {
        slug: "pasta",
        name: "Pasta",
        recipeIngredient: [],
        recipeInstructions: [],
      };
      const newUnit = { id: "new-unit-id", name: "cups" };
      const newFood = { id: "new-food-id", name: "flour" };

      const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        const jsonResponse = (data: unknown) => ({
          ok: true, status: 200, statusText: "OK",
          json: vi.fn().mockResolvedValue(data),
          text: vi.fn().mockResolvedValue(""),
          headers: { get: vi.fn().mockReturnValue("application/json") },
        });

        if (url.includes("/api/recipes/pasta") && !options?.method) {
          return Promise.resolve(jsonResponse(existingRecipe));
        }
        // Search returns empty — unit not found
        if (url.includes("/api/units") && !options?.method) {
          return Promise.resolve(jsonResponse({ items: [], page: 1, perPage: 10, total: 0, totalPages: 0 }));
        }
        // Create unit
        if (url.includes("/api/units") && options?.method === "POST") {
          return Promise.resolve(jsonResponse(newUnit));
        }
        // Search returns empty — food not found
        if (url.includes("/api/foods") && !options?.method) {
          return Promise.resolve(jsonResponse({ items: [], page: 1, perPage: 10, total: 0, totalPages: 0 }));
        }
        // Create food
        if (url.includes("/api/foods") && options?.method === "POST") {
          return Promise.resolve(jsonResponse(newFood));
        }
        if (url.includes("/api/recipes/pasta") && options?.method === "PUT") {
          return Promise.resolve(jsonResponse(existingRecipe));
        }
        return Promise.resolve(jsonResponse({}));
      });
      vi.stubGlobal("fetch", fetchMock);

      await client.updateRecipe("pasta", {
        recipeIngredient: [
          { quantity: 2, unit: { name: "cups" }, food: { name: "flour" } },
        ],
      });

      // Verify unit and food were created
      const unitPostCall = fetchMock.mock.calls.find(
        ([u, opts]: [string, RequestInit | undefined]) => u.includes("/api/units") && opts?.method === "POST"
      );
      expect(unitPostCall).toBeDefined();
      expect(JSON.parse(unitPostCall![1].body as string)).toEqual({ name: "cups" });

      const foodPostCall = fetchMock.mock.calls.find(
        ([u, opts]: [string, RequestInit | undefined]) => u.includes("/api/foods") && opts?.method === "POST"
      );
      expect(foodPostCall).toBeDefined();
      expect(JSON.parse(foodPostCall![1].body as string)).toEqual({ name: "flour" });

      // Verify PUT body uses the new IDs
      const putCall = fetchMock.mock.calls.find(
        ([, opts]: [string, RequestInit | undefined]) => opts?.method === "PUT"
      );
      const body = JSON.parse(putCall![1].body as string);
      expect(body.recipeIngredient[0].unit).toEqual(newUnit);
      expect(body.recipeIngredient[0].food).toEqual(newFood);
      expect(body.recipeIngredient[0].quantity).toBe(2);
    });

    it("caches resolved units/foods across ingredients", async () => {
      const existingRecipe = {
        slug: "pasta",
        name: "Pasta",
        recipeIngredient: [],
        recipeInstructions: [],
      };
      const cupsUnit = { id: "unit-cups-id", name: "cups" };

      const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        const jsonResponse = (data: unknown) => ({
          ok: true, status: 200, statusText: "OK",
          json: vi.fn().mockResolvedValue(data),
          text: vi.fn().mockResolvedValue(""),
          headers: { get: vi.fn().mockReturnValue("application/json") },
        });

        if (url.includes("/api/recipes/pasta") && !options?.method) {
          return Promise.resolve(jsonResponse(existingRecipe));
        }
        if (url.includes("/api/units") && url.includes("search=cups")) {
          return Promise.resolve(jsonResponse({ items: [cupsUnit], page: 1, perPage: 10, total: 1, totalPages: 1 }));
        }
        if (url.includes("/api/foods")) {
          return Promise.resolve(jsonResponse({ items: [], page: 1, perPage: 10, total: 0, totalPages: 0 }));
        }
        if (options?.method === "POST" && url.includes("/api/foods")) {
          const body = JSON.parse(options.body as string);
          return Promise.resolve(jsonResponse({ id: `food-${body.name}-id`, name: body.name }));
        }
        if (url.includes("/api/recipes/pasta") && options?.method === "PUT") {
          return Promise.resolve(jsonResponse(existingRecipe));
        }
        return Promise.resolve(jsonResponse({}));
      });
      vi.stubGlobal("fetch", fetchMock);

      await client.updateRecipe("pasta", {
        recipeIngredient: [
          { quantity: 2, unit: { name: "cups" }, food: { name: "flour" } },
          { quantity: 1, unit: { name: "cups" }, food: { name: "sugar" } },
        ],
      });

      // "cups" should only be searched once (cached)
      const unitSearchCalls = fetchMock.mock.calls.filter(
        ([u, opts]: [string, RequestInit | undefined]) => u.includes("/api/units") && !opts?.method
      );
      expect(unitSearchCalls).toHaveLength(1);
    });

    it("handles note-only ingredients (no unit, no food, no quantity)", async () => {
      const existingRecipe = {
        slug: "pasta",
        name: "Pasta",
        recipeIngredient: [],
        recipeInstructions: [],
      };

      const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        const jsonResponse = (data: unknown) => ({
          ok: true, status: 200, statusText: "OK",
          json: vi.fn().mockResolvedValue(data),
          text: vi.fn().mockResolvedValue(""),
          headers: { get: vi.fn().mockReturnValue("application/json") },
        });
        if (url.includes("/api/recipes/pasta") && !options?.method) {
          return Promise.resolve(jsonResponse(existingRecipe));
        }
        if (url.includes("/api/recipes/pasta") && options?.method === "PUT") {
          return Promise.resolve(jsonResponse(existingRecipe));
        }
        return Promise.resolve(jsonResponse({}));
      });
      vi.stubGlobal("fetch", fetchMock);

      await client.updateRecipe("pasta", {
        recipeIngredient: [
          { note: "salt to taste" },
          { note: "a pinch of pepper" },
        ],
      });

      const putCall = fetchMock.mock.calls.find(
        ([, opts]: [string, RequestInit | undefined]) => opts?.method === "PUT"
      );
      const body = JSON.parse(putCall![1].body as string);
      expect(body.recipeIngredient[0].note).toBe("salt to taste");
      expect(body.recipeIngredient[1].note).toBe("a pinch of pepper");
      // No unit/food searches should have been made
      const unitCalls = fetchMock.mock.calls.filter(
        ([u]: [string]) => u.includes("/api/units") || u.includes("/api/foods")
      );
      expect(unitCalls).toHaveLength(0);
    });

    it("handles ingredients with null unit and food", async () => {
      const existingRecipe = {
        slug: "pasta",
        name: "Pasta",
        recipeIngredient: [],
        recipeInstructions: [],
      };
      const eggsFood = { id: "food-eggs-id", name: "eggs" };

      const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        const jsonResponse = (data: unknown) => ({
          ok: true, status: 200, statusText: "OK",
          json: vi.fn().mockResolvedValue(data),
          text: vi.fn().mockResolvedValue(""),
          headers: { get: vi.fn().mockReturnValue("application/json") },
        });
        if (url.includes("/api/recipes/pasta") && !options?.method) {
          return Promise.resolve(jsonResponse(existingRecipe));
        }
        if (url.includes("/api/foods") && url.includes("search=eggs")) {
          return Promise.resolve(jsonResponse({ items: [eggsFood], page: 1, perPage: 10, total: 1, totalPages: 1 }));
        }
        if (url.includes("/api/recipes/pasta") && options?.method === "PUT") {
          return Promise.resolve(jsonResponse(existingRecipe));
        }
        return Promise.resolve(jsonResponse({}));
      });
      vi.stubGlobal("fetch", fetchMock);

      await client.updateRecipe("pasta", {
        recipeIngredient: [
          { quantity: null, unit: null, food: null, note: "salt to taste" },
          { quantity: 2, unit: null, food: { name: "eggs" }, note: "" },
        ],
      });

      const putCall = fetchMock.mock.calls.find(
        ([, opts]: [string, RequestInit | undefined]) => opts?.method === "PUT"
      );
      const body = JSON.parse(putCall![1].body as string);
      // First: all null, passes through unchanged
      expect(body.recipeIngredient[0].note).toBe("salt to taste");
      expect(body.recipeIngredient[0].unit).toBeNull();
      expect(body.recipeIngredient[0].food).toBeNull();
      // Second: food resolved to real ID, quantity preserved
      expect(body.recipeIngredient[1].food).toEqual(eggsFood);
      expect(body.recipeIngredient[1].quantity).toBe(2);
      expect(body.recipeIngredient[1].unit).toBeNull();
    });

    it("handles empty ingredient objects", async () => {
      const existingRecipe = {
        slug: "pasta",
        name: "Pasta",
        recipeIngredient: [],
        recipeInstructions: [],
      };

      const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        const jsonResponse = (data: unknown) => ({
          ok: true, status: 200, statusText: "OK",
          json: vi.fn().mockResolvedValue(data),
          text: vi.fn().mockResolvedValue(""),
          headers: { get: vi.fn().mockReturnValue("application/json") },
        });
        if (url.includes("/api/recipes/pasta") && !options?.method) {
          return Promise.resolve(jsonResponse(existingRecipe));
        }
        if (url.includes("/api/recipes/pasta") && options?.method === "PUT") {
          return Promise.resolve(jsonResponse(existingRecipe));
        }
        return Promise.resolve(jsonResponse({}));
      });
      vi.stubGlobal("fetch", fetchMock);

      await client.updateRecipe("pasta", {
        recipeIngredient: [{}],
      });

      const putCall = fetchMock.mock.calls.find(
        ([, opts]: [string, RequestInit | undefined]) => opts?.method === "PUT"
      );
      const body = JSON.parse(putCall![1].body as string);
      expect(body.recipeIngredient).toHaveLength(1);
    });

    it("preserves existing ingredientReferences on instructions", async () => {
      const existingRecipe = {
        slug: "pasta",
        name: "Pasta",
        recipeIngredient: [],
        recipeInstructions: [],
      };

      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          json: vi.fn().mockResolvedValue(existingRecipe),
          text: vi.fn().mockResolvedValue(""),
          headers: { get: vi.fn().mockReturnValue("application/json") },
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          json: vi.fn().mockResolvedValue(existingRecipe),
          text: vi.fn().mockResolvedValue(""),
          headers: { get: vi.fn().mockReturnValue("application/json") },
        });
      vi.stubGlobal("fetch", fetchMock);

      await client.updateRecipe("pasta", {
        recipeInstructions: [
          { text: "Step 1", ingredientReferences: [{ referenceId: "abc-123" }] },
        ],
      });

      const body = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(body.recipeInstructions[0].ingredientReferences).toEqual([{ referenceId: "abc-123" }]);
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
