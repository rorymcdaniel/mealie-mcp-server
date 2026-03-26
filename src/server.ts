import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MealieClient } from "./mealie-client.js";
import { registerGetRecipeTool } from "./tools/get-recipe.js";
import { registerSearchRecipesTool } from "./tools/search-recipes.js";
import { registerCreateRecipeTool } from "./tools/create-recipe.js";
import { registerImportRecipeTool } from "./tools/import-recipe.js";
import { registerUpdateRecipeTool } from "./tools/update-recipe.js";

export interface ServerConfig {
  mealieUrl: string;
  mealieApiToken: string;
}

export function createServer(config: ServerConfig): McpServer {
  const server = new McpServer({
    name: "mealie-mcp-server",
    version: "1.0.0",
  });

  const client = new MealieClient(config.mealieUrl, config.mealieApiToken);

  registerGetRecipeTool(server, client);
  registerSearchRecipesTool(server, client);
  registerCreateRecipeTool(server, client);
  registerImportRecipeTool(server, client);
  registerUpdateRecipeTool(server, client);

  return server;
}
