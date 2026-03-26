#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

function main(): void {
  const mealieUrl = process.env.MEALIE_URL;
  const mealieApiToken = process.env.MEALIE_API_TOKEN;

  if (!mealieUrl) {
    console.error(
      "Error: MEALIE_URL environment variable is required.\n" +
        "Set it to your Mealie instance URL (e.g. http://localhost:9925)"
    );
    process.exit(1);
  }

  if (!mealieApiToken) {
    console.error(
      "Error: MEALIE_API_TOKEN environment variable is required.\n" +
        "Generate one at: <your-mealie-url>/user/profile/api-tokens"
    );
    process.exit(1);
  }

  const server = createServer({ mealieUrl, mealieApiToken });
  const transport = new StdioServerTransport();

  server.connect(transport).then(() => {
    console.error("Mealie MCP server running on stdio");
  }).catch((error: unknown) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });
}

main();
