import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MealieClient } from "../mealie-client.js";

const ingredientSchema = z.object({
  quantity: z.number().nullable().optional().describe("Amount (e.g. 2, 0.5)"),
  unit: z
    .object({ name: z.string() })
    .nullable()
    .optional()
    .describe('Unit of measurement (e.g. { name: "cups" })'),
  food: z
    .object({ name: z.string() })
    .nullable()
    .optional()
    .describe('Food item (e.g. { name: "flour" })'),
  note: z
    .string()
    .nullable()
    .optional()
    .describe("Additional notes (e.g. 'finely chopped')"),
  title: z
    .string()
    .nullable()
    .optional()
    .describe("Section heading (e.g. 'For the sauce')"),
  originalText: z
    .string()
    .nullable()
    .optional()
    .describe("Original ingredient text as written in the source recipe"),
});

const instructionSchema = z.object({
  title: z
    .string()
    .nullable()
    .optional()
    .describe("Section heading (e.g. 'Prepare the dough')"),
  text: z.string().describe("The instruction step text"),
});

const nutritionSchema = z.object({
  calories: z.string().nullable().optional(),
  carbohydrateContent: z.string().nullable().optional(),
  fatContent: z.string().nullable().optional(),
  fiberContent: z.string().nullable().optional(),
  proteinContent: z.string().nullable().optional(),
  sodiumContent: z.string().nullable().optional(),
  sugarContent: z.string().nullable().optional(),
});

const noteSchema = z.object({
  title: z.string().describe("Note title"),
  text: z.string().describe("Note content"),
});

export function registerCreateRecipeTool(
  server: McpServer,
  client: MealieClient
): void {
  server.tool(
    "create_recipe",
    "Create a new recipe in Mealie from structured data. Creates the recipe with a name, then updates it with full details (ingredients, instructions, etc.).",
    {
      name: z.string().describe("Recipe name"),
      description: z
        .string()
        .optional()
        .describe("Short description of the recipe"),
      recipeYield: z
        .string()
        .optional()
        .describe("Yield description (e.g. '4 servings', '12 cookies')"),
      totalTime: z
        .string()
        .optional()
        .describe("Total time (e.g. '1 hour 30 minutes')"),
      prepTime: z
        .string()
        .optional()
        .describe("Prep time (e.g. '20 minutes')"),
      cookTime: z
        .string()
        .optional()
        .describe("Cook time (e.g. '45 minutes')"),
      performTime: z
        .string()
        .optional()
        .describe("Perform/active time"),
      recipeIngredient: z
        .array(ingredientSchema)
        .optional()
        .describe("List of ingredients"),
      recipeInstructions: z
        .array(instructionSchema)
        .optional()
        .describe("List of instruction steps"),
      nutrition: nutritionSchema
        .optional()
        .describe("Nutritional information"),
      recipeCategory: z
        .array(z.object({ name: z.string() }))
        .optional()
        .describe("Categories (e.g. [{ name: 'Dinner' }])"),
      tags: z
        .array(z.object({ name: z.string() }))
        .optional()
        .describe("Tags (e.g. [{ name: 'Quick' }, { name: 'Healthy' }])"),
      notes: z
        .array(noteSchema)
        .optional()
        .describe("Recipe notes"),
    },
    async ({ name, ...details }) => {
      try {
        // Step 1: Create the recipe (returns slug)
        const slug = await client.createRecipe(name);

        // Step 2: Update with full details if any were provided
        const hasDetails = Object.values(details).some(
          (v) => v !== undefined
        );
        if (hasDetails) {
          const updated = await client.updateRecipe(slug, details);
          return {
            content: [
              {
                type: "text" as const,
                text: `Recipe "${updated.name}" created successfully.\n\n${JSON.stringify(updated, null, 2)}`,
              },
            ],
          };
        }

        // If only name was provided, fetch the created recipe to return it
        const recipe = await client.getRecipe(slug);
        return {
          content: [
            {
              type: "text" as const,
              text: `Recipe "${recipe.name}" created successfully.\n\n${JSON.stringify(recipe, null, 2)}`,
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to create recipe "${name}": ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
