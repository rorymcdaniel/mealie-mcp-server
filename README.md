# Mealie MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that connects Claude and other MCP clients to your [Mealie](https://mealie.io) recipe manager instance. Search, create, import, and update recipes through natural language.

## Features

- **Get Recipe** — Retrieve full recipe details by slug or ID
- **Search Recipes** — Free-text search with filtering by category, tag, food, and tool
- **Create Recipe** — Create recipes from structured data (name, ingredients, instructions, etc.)
- **Import Recipe** — Import recipes by URL (Mealie scrapes the page automatically)
- **Update Recipe** — Modify any field on an existing recipe

## Prerequisites

- [Mealie](https://mealie.io) v1+ instance running and accessible
- A Mealie API token (generate at `<your-mealie-url>/user/profile/api-tokens`)
- Node.js 20+ (for local usage) or Docker

## Configuration

The server requires two environment variables:

| Variable | Description |
|---|---|
| `MEALIE_URL` | Base URL of your Mealie instance (e.g. `http://localhost:9925`) |
| `MEALIE_API_TOKEN` | Your Mealie API token |

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

## Usage

### With Claude Desktop

Add to your `claude_desktop_config.json`:

**Using Docker:**
```json
{
  "mcpServers": {
    "mealie": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "MEALIE_URL",
        "-e", "MEALIE_API_TOKEN",
        "mealie-mcp-server"
      ],
      "env": {
        "MEALIE_URL": "http://your-mealie-instance:9925",
        "MEALIE_API_TOKEN": "your-api-token"
      }
    }
  }
}
```

**Using Node.js directly:**
```json
{
  "mcpServers": {
    "mealie": {
      "command": "node",
      "args": ["/path/to/mealie-mcp-server/build/index.js"],
      "env": {
        "MEALIE_URL": "http://your-mealie-instance:9925",
        "MEALIE_API_TOKEN": "your-api-token"
      }
    }
  }
}
```

### With Claude Code

```bash
claude mcp add mealie -- node /path/to/mealie-mcp-server/build/index.js \
  -e MEALIE_URL=http://your-mealie-instance:9925 \
  -e MEALIE_API_TOKEN=your-api-token
```

## Tools

### `get_recipe`

Get a recipe by its slug or ID.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `slug` | string | Yes | Recipe slug or UUID |

### `search_recipes`

Search and list recipes with optional filters.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `search` | string | No | Free-text search query |
| `categories` | string[] | No | Filter by category slugs or IDs |
| `tags` | string[] | No | Filter by tag slugs or IDs |
| `foods` | string[] | No | Filter by food slugs or IDs |
| `tools` | string[] | No | Filter by tool slugs or IDs |
| `requireAllCategories` | boolean | No | Require all specified categories |
| `requireAllTags` | boolean | No | Require all specified tags |
| `page` | number | No | Page number (default: 1) |
| `perPage` | number | No | Results per page (default: 50) |
| `orderBy` | string | No | Sort field (e.g. `createdAt`, `name`) |
| `orderDirection` | `asc` \| `desc` | No | Sort direction |

### `create_recipe`

Create a recipe from structured data.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Recipe name |
| `description` | string | No | Short description |
| `recipeYield` | string | No | Yield (e.g. "4 servings") |
| `prepTime` | string | No | Prep time |
| `cookTime` | string | No | Cook time |
| `totalTime` | string | No | Total time |
| `recipeIngredient` | object[] | No | Ingredients list |
| `recipeInstructions` | object[] | No | Instruction steps |
| `nutrition` | object | No | Nutritional info |
| `recipeCategory` | object[] | No | Categories |
| `tags` | object[] | No | Tags |
| `notes` | object[] | No | Recipe notes |

### `import_recipe`

Import a recipe by URL. Mealie scrapes the page and extracts recipe data.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `url` | string | Yes | URL of the recipe page |
| `includeTags` | boolean | No | Extract tags from the page |
| `includeCategories` | boolean | No | Extract categories from the page |

### `update_recipe`

Update fields on an existing recipe. Only provided fields are changed.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `slug` | string | Yes | Recipe slug or UUID to update |
| `name` | string | No | New name |
| `description` | string | No | New description |
| `recipeYield` | string | No | New yield |
| `prepTime` | string | No | New prep time |
| `cookTime` | string | No | New cook time |
| `recipeIngredient` | object[] | No | Replacement ingredients |
| `recipeInstructions` | object[] | No | Replacement instructions |
| `nutrition` | object | No | Nutritional info |
| `recipeCategory` | object[] | No | Categories |
| `tags` | object[] | No | Tags |
| `notes` | object[] | No | Notes |

## Development

### Setup

```bash
npm install
```

### Build

```bash
npm run build
```

### Run in development

```bash
MEALIE_URL=http://localhost:9925 MEALIE_API_TOKEN=your-token npm run dev
```

### Test

```bash
npm test

# With coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Docker

```bash
# Build the image
docker build -t mealie-mcp-server .

# Run
docker run -i --rm \
  -e MEALIE_URL=http://your-mealie:9925 \
  -e MEALIE_API_TOKEN=your-token \
  mealie-mcp-server
```

## Architecture

```
src/
├── index.ts              # Entry point — validates env vars, starts stdio transport
├── server.ts             # Creates MCP server and registers all tools
├── mealie-client.ts      # HTTP client for the Mealie REST API
├── types.ts              # TypeScript type definitions for Mealie API shapes
└── tools/
    ├── get-recipe.ts     # get_recipe tool
    ├── search-recipes.ts # search_recipes tool
    ├── create-recipe.ts  # create_recipe tool
    ├── import-recipe.ts  # import_recipe tool
    └── update-recipe.ts  # update_recipe tool
```

The server uses **stdio transport**, which is the standard for MCP servers used with Claude Desktop and Claude Code. It communicates via stdin/stdout using JSON-RPC 2.0 messages.

## License

MIT
