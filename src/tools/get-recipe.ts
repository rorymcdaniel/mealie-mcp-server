import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MealieClient } from "../mealie-client.js";

export function registerGetRecipeTool(
  server: McpServer,
  client: MealieClient
): void {
  server.tool(
    "get_recipe",
    "Get a recipe by its slug or ID from Mealie. Returns full recipe details including ingredients, instructions, nutrition, and metadata.",
    {
      slug: z
        .string()
        .describe("The recipe slug (URL-friendly name) or UUID"),
    },
    async ({ slug }) => {
      console.error(`[get_recipe] Called with slug="${slug}"`);
      try {
        const recipe = await client.getRecipe(slug);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(recipe, null, 2) }],
        };
      } catch (error) {
        console.error(`[get_recipe] Error fetching "${slug}":`, error);
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to get recipe "${slug}": ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
