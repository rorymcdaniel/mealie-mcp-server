import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MealieClient } from "../mealie-client.js";

export function registerImportRecipeTool(
  server: McpServer,
  client: MealieClient
): void {
  server.tool(
    "import_recipe",
    "Import a recipe from a URL into Mealie. Mealie will scrape the webpage and extract recipe data automatically. Works with most recipe websites that use schema.org/Recipe markup.",
    {
      url: z
        .string()
        .url()
        .describe("URL of the recipe page to import"),
      includeTags: z
        .boolean()
        .optional()
        .describe("Include tags extracted from the page (default: false)"),
      includeCategories: z
        .boolean()
        .optional()
        .describe(
          "Include categories extracted from the page (default: false)"
        ),
    },
    async ({ url, includeTags, includeCategories }) => {
      console.error(`[import_recipe] Called with url="${url}"`);
      try {
        const slug = await client.scrapeRecipeFromUrl({
          url,
          includeTags,
          includeCategories,
        });

        // Fetch the full recipe to return it
        const recipe = await client.getRecipe(slug);
        return {
          content: [
            {
              type: "text" as const,
              text: `Recipe "${recipe.name}" imported successfully from ${url}.\n\n${JSON.stringify(recipe, null, 2)}`,
            },
          ],
        };
      } catch (error) {
        console.error(`[import_recipe] Error importing "${url}":`, error);
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to import recipe from "${url}": ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
