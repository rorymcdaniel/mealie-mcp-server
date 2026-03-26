/** Mealie API type definitions for the v1/v2+ stable recipe API. */

export interface PaginatedResponse<T> {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  items: T[];
  next: string | null;
  previous: string | null;
}

export interface RecipeCategory {
  id: string | null;
  name: string;
  slug: string;
}

export interface RecipeTag {
  id: string | null;
  name: string;
  slug: string;
}

export interface RecipeTool {
  id: string;
  name: string;
  slug: string;
}

export interface IngredientUnit {
  id: string | null;
  name: string;
  pluralName: string | null;
  abbreviation: string;
  pluralAbbreviation: string | null;
  description: string;
  fraction: boolean;
  useAbbreviation: boolean;
}

export interface IngredientFood {
  id: string | null;
  name: string;
  pluralName: string | null;
  description: string;
}

export interface RecipeIngredient {
  quantity: number | null;
  unit: IngredientUnit | null;
  food: IngredientFood | null;
  note: string | null;
  display: string;
  title: string | null;
  originalText: string | null;
  referenceId: string;
}

export interface IngredientReference {
  referenceId: string;
}

export interface RecipeStep {
  id: string | null;
  title: string | null;
  text: string;
  ingredientReferences: IngredientReference[];
}

export interface Nutrition {
  calories: string | null;
  carbohydrateContent: string | null;
  cholesterolContent: string | null;
  fatContent: string | null;
  fiberContent: string | null;
  proteinContent: string | null;
  saturatedFatContent: string | null;
  sodiumContent: string | null;
  sugarContent: string | null;
  transFatContent: string | null;
  unsaturatedFatContent: string | null;
}

export interface RecipeSettings {
  public: boolean;
  showNutrition: boolean;
  showAssets: boolean;
  landscapeView: boolean;
  disableComments: boolean;
  locked: boolean;
}

export interface RecipeNote {
  title: string;
  text: string;
}

export interface RecipeSummary {
  id: string | null;
  name: string | null;
  slug: string;
  description: string | null;
  recipeCategory: RecipeCategory[];
  tags: RecipeTag[];
  tools: RecipeTool[];
  rating: number | null;
  dateAdded: string | null;
  dateUpdated: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  recipeServings: number;
  recipeYield: string | null;
  totalTime: string | null;
  prepTime: string | null;
  cookTime: string | null;
  performTime: string | null;
  orgURL: string | null;
}

export interface Recipe extends RecipeSummary {
  recipeIngredient: RecipeIngredient[];
  recipeInstructions: RecipeStep[];
  nutrition: Nutrition | null;
  settings: RecipeSettings | null;
  notes: RecipeNote[];
  extras: Record<string, unknown>;
}

export interface CreateRecipeInput {
  name: string;
}

export interface ScrapeRecipeInput {
  url: string;
  includeTags?: boolean;
  includeCategories?: boolean;
}

export interface SearchRecipesParams {
  search?: string;
  categories?: string[];
  tags?: string[];
  foods?: string[];
  tools?: string[];
  requireAllCategories?: boolean;
  requireAllTags?: boolean;
  requireAllFoods?: boolean;
  requireAllTools?: boolean;
  page?: number;
  perPage?: number;
  orderBy?: string;
  orderDirection?: "asc" | "desc";
}
