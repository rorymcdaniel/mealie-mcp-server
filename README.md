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

## Transports

The server supports two transports:

| Transport | Use case | Entry point |
|---|---|---|
| **stdio** (default) | Claude Desktop, Claude Code, local MCP clients | `build/index.js` |
| **Streamable HTTP** | Web clients, remote access, multi-user | `build/http.js` |

## Configuration

The server requires two environment variables:

| Variable | Required | Description |
|---|---|---|
| `MEALIE_URL` | Yes | Base URL of your Mealie instance (e.g. `http://localhost:9925`) |
| `MEALIE_API_TOKEN` | Yes | Your Mealie API token |
| `MCP_AUTH_TOKEN` | No | Bearer token to authenticate MCP clients (HTTP mode, recommended) |
| `PORT` | No | HTTP server port (default: `3000`, HTTP mode only) |
| `TRANSPORT` | No | Set to `http` for HTTP mode in Docker (default: `stdio`) |

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

### HTTP Transport (Web / Remote)

For web clients or remote access, use the HTTP transport with Streamable HTTP:

**Using Node.js:**
```bash
MEALIE_URL=http://your-mealie:9925 \
MEALIE_API_TOKEN=your-api-token \
MCP_AUTH_TOKEN=your-secret-auth-token \
node build/http.js
```

The MCP endpoint will be available at `http://localhost:3000/mcp`.

**Using Docker:**
```bash
docker run --rm \
  -p 3000:3000 \
  -e TRANSPORT=http \
  -e MEALIE_URL=http://your-mealie:9925 \
  -e MEALIE_API_TOKEN=your-api-token \
  -e MCP_AUTH_TOKEN=your-secret-auth-token \
  mealie-mcp-server
```

**Using Docker Compose:**
```bash
# Set env vars in .env file, then:
docker compose up mealie-mcp-server-http
```

**Connecting MCP clients to the HTTP endpoint:**

Point your MCP client at `http://your-host:3000/mcp` using the Streamable HTTP transport. If `MCP_AUTH_TOKEN` is set, include it as a bearer token in the `Authorization` header.

A health check endpoint is available at `GET /health`.

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
# stdio transport
MEALIE_URL=http://localhost:9925 MEALIE_API_TOKEN=your-token npm run dev

# HTTP transport
MEALIE_URL=http://localhost:9925 MEALIE_API_TOKEN=your-token npm run dev:http
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

# Run (stdio)
docker run -i --rm \
  -e MEALIE_URL=http://your-mealie:9925 \
  -e MEALIE_API_TOKEN=your-token \
  mealie-mcp-server

# Run (HTTP)
docker run --rm -p 3000:3000 \
  -e TRANSPORT=http \
  -e MEALIE_URL=http://your-mealie:9925 \
  -e MEALIE_API_TOKEN=your-token \
  -e MCP_AUTH_TOKEN=your-auth-token \
  mealie-mcp-server
```

## Architecture

```
src/
├── index.ts              # stdio entry point
├── http.ts               # HTTP entry point (Streamable HTTP transport)
├── server.ts             # Creates MCP server and registers all tools (transport-agnostic)
├── mealie-client.ts      # HTTP client for the Mealie REST API
├── types.ts              # TypeScript type definitions for Mealie API shapes
└── tools/
    ├── get-recipe.ts     # get_recipe tool
    ├── search-recipes.ts # search_recipes tool
    ├── create-recipe.ts  # create_recipe tool
    ├── import-recipe.ts  # import_recipe tool
    └── update-recipe.ts  # update_recipe tool
```

The server core (`server.ts`) is **transport-agnostic** — it builds the MCP server and registers tools without knowing which transport will be used. The two entry points (`index.ts` for stdio, `http.ts` for HTTP) each wire in their respective transport.

- **stdio** communicates via stdin/stdout using JSON-RPC 2.0. Standard for Claude Desktop and local MCP clients.
- **Streamable HTTP** exposes a single `/mcp` endpoint supporting POST (requests), GET (SSE stream), and DELETE (session termination). Uses stateful sessions with `Mcp-Session-Id` headers.

## License

MIT
