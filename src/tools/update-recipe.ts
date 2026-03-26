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
    .describe("Original ingredient text"),
});

const instructionSchema = z.object({
  title: z
    .string()
    .nullable()
    .optional()
    .describe("Section heading"),
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

export function registerUpdateRecipeTool(
  server: McpServer,
  client: MealieClient
): void {
  server.tool(
    "update_recipe",
    "Update an existing recipe in Mealie. Only the fields you provide will be changed; omitted fields remain unchanged.",
    {
      slug: z
        .string()
        .describe("The recipe slug or UUID to update"),
      name: z.string().optional().describe("New recipe name"),
      description: z.string().optional().describe("New description"),
      recipeYield: z
        .string()
        .optional()
        .describe("Yield description (e.g. '4 servings')"),
      totalTime: z.string().optional().describe("Total time"),
      prepTime: z.string().optional().describe("Prep time"),
      cookTime: z.string().optional().describe("Cook time"),
      performTime: z.string().optional().describe("Perform/active time"),
      recipeIngredient: z
        .array(ingredientSchema)
        .optional()
        .describe("Full replacement ingredient list"),
      recipeInstructions: z
        .array(instructionSchema)
        .optional()
        .describe("Full replacement instruction list"),
      nutrition: nutritionSchema.optional().describe("Nutritional information"),
      recipeCategory: z
        .array(z.object({ name: z.string() }))
        .optional()
        .describe("Categories"),
      tags: z
        .array(z.object({ name: z.string() }))
        .optional()
        .describe("Tags"),
      notes: z
        .array(noteSchema)
        .optional()
        .describe("Recipe notes"),
      lastMade: z
        .string()
        .optional()
        .describe(
          "ISO 8601 datetime string for when the recipe was last made (e.g. '2026-03-14T12:00:00+00:00'). Sets the 'I Made This' date in Mealie."
        ),
    },
    async ({ slug, ...updates }) => {
      console.error(`[update_recipe] Called with slug="${slug}" updates=${JSON.stringify(Object.keys(updates))}`);
      try {
        const hasUpdates = Object.values(updates).some(
          (v) => v !== undefined
        );
        if (!hasUpdates) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: "No fields provided to update. Please specify at least one field to change.",
              },
            ],
          };
        }

        const recipe = await client.updateRecipe(slug, updates);
        return {
          content: [
            {
              type: "text" as const,
              text: `Recipe "${recipe.name}" updated successfully.\n\n${JSON.stringify(recipe, null, 2)}`,
            },
          ],
        };
      } catch (error) {
        console.error(`[update_recipe] Error updating "${slug}":`, error);
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to update recipe "${slug}": ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
