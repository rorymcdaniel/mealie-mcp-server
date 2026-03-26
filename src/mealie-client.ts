import type {
  PaginatedResponse,
  Recipe,
  RecipeSummary,
  SearchRecipesParams,
  ScrapeRecipeInput,
} from "./types.js";

export type { PaginatedResponse, Recipe, RecipeSummary };

export class MealieClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public statusText: string
  ) {
    super(message);
    this.name = "MealieClientError";
  }
}

export class MealieClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    // Strip trailing slash for consistent URL building
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}/api${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...((options.headers as Record<string, string>) ?? {}),
    };

    // Abort after 30 seconds to avoid hanging the MCP tool call
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeout);
      if (
        (error instanceof DOMException && error.name === "AbortError") ||
        (error instanceof Error && error.name === "AbortError")
      ) {
        throw new MealieClientError(
          `Mealie API request timed out after 30s: ${options.method ?? "GET"} ${path}`,
          408,
          "Request Timeout"
        );
      }
      throw error;
    }
    clearTimeout(timeout);

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new MealieClientError(
        `Mealie API error: ${response.status} ${response.statusText}${body ? ` - ${body}` : ""}`,
        response.status,
        response.statusText
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return (await response.json()) as T;
    }
    // Some Mealie endpoints return plain text (e.g. slug on creation)
    return (await response.text()) as unknown as T;
  }

  async getRecipe(slug: string): Promise<Recipe> {
    return this.request<Recipe>(`/recipes/${encodeURIComponent(slug)}`);
  }

  async searchRecipes(
    params: SearchRecipesParams = {}
  ): Promise<PaginatedResponse<RecipeSummary>> {
    const searchParams = new URLSearchParams();

    if (params.search) searchParams.set("search", params.search);
    if (params.page) searchParams.set("page", String(params.page));
    if (params.perPage) searchParams.set("perPage", String(params.perPage));
    if (params.orderBy) searchParams.set("orderBy", params.orderBy);
    if (params.orderDirection)
      searchParams.set("orderDirection", params.orderDirection);
    if (params.requireAllCategories)
      searchParams.set("requireAllCategories", "true");
    if (params.requireAllTags)
      searchParams.set("requireAllTags", "true");
    if (params.requireAllFoods)
      searchParams.set("requireAllFoods", "true");
    if (params.requireAllTools)
      searchParams.set("requireAllTools", "true");

    // Mealie expects repeated query params for array filters
    for (const cat of params.categories ?? []) {
      searchParams.append("categories", cat);
    }
    for (const tag of params.tags ?? []) {
      searchParams.append("tags", tag);
    }
    for (const food of params.foods ?? []) {
      searchParams.append("foods", food);
    }
    for (const tool of params.tools ?? []) {
      searchParams.append("tools", tool);
    }

    const qs = searchParams.toString();
    const path = `/recipes${qs ? `?${qs}` : ""}`;
    return this.request<PaginatedResponse<RecipeSummary>>(path);
  }

  async createRecipe(name: string): Promise<string> {
    return this.request<string>("/recipes", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  async updateRecipe(slug: string, data: Record<string, unknown>): Promise<Recipe> {
    // Mealie's PATCH has server-side merge bugs (e.g. missing ingredientReferences
    // on instructions causes TypeError). Use GET-then-PUT for reliable updates.
    const existing = await this.getRecipe(slug);
    const merged: Record<string, unknown> = { ...existing, ...data };

    // Ensure every instruction has ingredientReferences (Mealie requires it)
    if (Array.isArray(merged.recipeInstructions)) {
      merged.recipeInstructions = (merged.recipeInstructions as Record<string, unknown>[]).map(
        (step) => ({
          ingredientReferences: [],
          ...step,
        })
      );
    }

    // Mealie's PUT requires unit/food objects to have an 'id' field.
    // When callers provide ingredients with only { name: "cups" } (no id),
    // resolve the ID by searching Mealie's units/foods (or creating them).
    if (Array.isArray(merged.recipeIngredient)) {
      merged.recipeIngredient = await this.resolveIngredientIds(
        merged.recipeIngredient as Record<string, unknown>[]
      );
    }

    return this.request<Recipe>(
      `/recipes/${encodeURIComponent(slug)}`,
      {
        method: "PUT",
        body: JSON.stringify(merged),
      }
    );
  }

  /**
   * Resolve IDs for ingredient unit/food objects that only have a name.
   * Searches Mealie by name, creates if not found. Caches within one call.
   */
  private async resolveIngredientIds(
    ingredients: Record<string, unknown>[]
  ): Promise<Record<string, unknown>[]> {
    const unitCache = new Map<string, Record<string, unknown>>();
    const foodCache = new Map<string, Record<string, unknown>>();

    const resolved: Record<string, unknown>[] = [];
    for (const ing of ingredients) {
      const unit = (typeof ing.unit === "object" && ing.unit !== null)
        ? ing.unit as Record<string, unknown>
        : null;
      const food = (typeof ing.food === "object" && ing.food !== null)
        ? ing.food as Record<string, unknown>
        : null;

      let resolvedUnit: Record<string, unknown> | null = unit;
      let resolvedFood: Record<string, unknown> | null = food;

      // Resolve unit ID if missing
      if (unit && !unit.id && typeof unit.name === "string") {
        const name = unit.name as string;
        if (unitCache.has(name.toLowerCase())) {
          resolvedUnit = unitCache.get(name.toLowerCase())!;
        } else {
          resolvedUnit = await this.findOrCreateUnit(name);
          unitCache.set(name.toLowerCase(), resolvedUnit);
        }
      }

      // Resolve food ID if missing
      if (food && !food.id && typeof food.name === "string") {
        const name = food.name as string;
        if (foodCache.has(name.toLowerCase())) {
          resolvedFood = foodCache.get(name.toLowerCase())!;
        } else {
          resolvedFood = await this.findOrCreateFood(name);
          foodCache.set(name.toLowerCase(), resolvedFood);
        }
      }

      resolved.push({
        ...ing,
        unit: resolvedUnit,
        food: resolvedFood,
      });
    }
    return resolved;
  }

  private async findOrCreateUnit(name: string): Promise<Record<string, unknown>> {
    // Search for existing unit by name (use large perPage to avoid missing exact matches
    // when fuzzy search ranks the exact match beyond the first page)
    const results = await this.request<PaginatedResponse<Record<string, unknown>>>(
      `/units?search=${encodeURIComponent(name)}&perPage=100`
    );
    const match = results.items.find(
      (u) => typeof u.name === "string" && u.name.toLowerCase() === name.toLowerCase()
    );
    if (match) return match;

    // Not found — create it
    return this.request<Record<string, unknown>>("/units", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  private async findOrCreateFood(name: string): Promise<Record<string, unknown>> {
    // Search for existing food by name (use large perPage to avoid missing exact matches
    // when fuzzy search ranks the exact match beyond the first page)
    const results = await this.request<PaginatedResponse<Record<string, unknown>>>(
      `/foods?search=${encodeURIComponent(name)}&perPage=100`
    );
    const match = results.items.find(
      (f) => typeof f.name === "string" && f.name.toLowerCase() === name.toLowerCase()
    );
    if (match) return match;

    // Not found — create it
    return this.request<Record<string, unknown>>("/foods", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  async scrapeRecipeFromUrl(input: ScrapeRecipeInput): Promise<string> {
    return this.request<string>("/recipes/create/url", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
}
