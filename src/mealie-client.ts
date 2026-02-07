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

    const response = await fetch(url, { ...options, headers });

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
    return this.request<Recipe>(
      `/recipes/${encodeURIComponent(slug)}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      }
    );
  }

  async scrapeRecipeFromUrl(input: ScrapeRecipeInput): Promise<string> {
    return this.request<string>("/recipes/create/url", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
}
