import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MealieClient } from "../mealie-client.js";

export function registerSearchRecipesTool(
  server: McpServer,
  client: MealieClient
): void {
  server.tool(
    "search_recipes",
    "Search and list recipes in Mealie. Supports free-text search, filtering by tags/categories/foods/tools, and pagination. Returns recipe summaries (not full details — use get_recipe for that).",
    {
      search: z
        .string()
        .optional()
        .describe(
          "Free-text search query (searches name, description, ingredients)"
        ),
      categories: z
        .array(z.string())
        .optional()
        .describe("Filter by category slugs or IDs"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Filter by tag slugs or IDs"),
      foods: z
        .array(z.string())
        .optional()
        .describe("Filter by food slugs or IDs"),
      tools: z
        .array(z.string())
        .optional()
        .describe("Filter by tool slugs or IDs"),
      requireAllCategories: z
        .boolean()
        .optional()
        .describe("If true, recipe must have ALL specified categories (default: any)"),
      requireAllTags: z
        .boolean()
        .optional()
        .describe("If true, recipe must have ALL specified tags (default: any)"),
      page: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Page number (1-indexed, default: 1)"),
      perPage: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Results per page (default: 50, use -1 for all)"),
      orderBy: z
        .string()
        .optional()
        .describe("Field to sort by (e.g. 'createdAt', 'name', 'rating')"),
      orderDirection: z
        .enum(["asc", "desc"])
        .optional()
        .describe("Sort direction (default: desc)"),
    },
    async (params) => {
      console.error(`[search_recipes] Called with params=${JSON.stringify(Object.keys(params))}`);
      try {
        const result = await client.searchRecipes(params);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        console.error("[search_recipes] Error:", error);
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to search recipes: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
