# Mealie MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js 20+](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)

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
| **Streamable HTTP** | Claude.ai web/mobile, remote access, multi-user | `build/http.js` |

## Authentication

There are two separate auth layers — one for the server to talk to Mealie, and one for clients to talk to the server:

```
Claude.ai ──OAuth 2.0──▶ MCP Server ──API Token──▶ Mealie
```

1. **Mealie API Token** (`MEALIE_API_TOKEN`) — The server's backend credential for accessing Mealie's REST API. Required for both transports. Generate one at `<your-mealie-url>/user/profile/api-tokens`.

2. **OAuth 2.0 + PKCE** (HTTP transport only) — How remote clients like Claude.ai authenticate to the MCP server. Users log in with their **Mealie username and password** via a browser-based flow. The server validates credentials against Mealie and issues OAuth tokens. Not used with stdio transport.

In short: the API token lets the server access recipes, and OAuth lets users prove who they are.

## Configuration

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `MEALIE_URL` | Yes | Base URL of your Mealie instance (e.g. `http://localhost:9925`) |
| `MEALIE_API_TOKEN` | Yes | Your Mealie API token |
| `MCP_SERVER_URL` | HTTP mode only | Public URL of this server (e.g. `https://mcp.your-domain.com`) — used as the OAuth issuer URL |
| `PORT` | No | HTTP server port (default: `3000`, HTTP mode only) |
| `TRANSPORT` | No | Set to `http` for HTTP mode in Docker (default: `stdio`) |

## Usage

### With Claude Desktop (stdio)

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

### With Claude Code (stdio)

```bash
claude mcp add mealie -- node /path/to/mealie-mcp-server/build/index.js \
  -e MEALIE_URL=http://your-mealie-instance:9925 \
  -e MEALIE_API_TOKEN=your-api-token
```

### HTTP Transport (Claude.ai web / remote access)

The HTTP transport uses **OAuth 2.0 with PKCE**, with Mealie credentials as the identity provider. Users authenticate via a login page using their Mealie username and password. This makes it compatible with Claude.ai (web and mobile), which requires OAuth-capable MCP servers.

**Requirements:** The server must be reachable at a public HTTPS URL (`MCP_SERVER_URL`).

**Using Node.js:**
```bash
MEALIE_URL=http://your-mealie:9925 \
MEALIE_API_TOKEN=your-api-token \
MCP_SERVER_URL=https://mcp.your-domain.com \
node build/http.js
```

**Using Docker:**
```bash
docker run --rm \
  -p 3000:3000 \
  -e TRANSPORT=http \
  -e MEALIE_URL=http://your-mealie:9925 \
  -e MEALIE_API_TOKEN=your-api-token \
  -e MCP_SERVER_URL=https://mcp.your-domain.com \
  mealie-mcp-server
```

**Using Docker Compose:**
```bash
# Set env vars in .env file, then:
docker compose up mealie-mcp-server-http
```

**Connecting Claude.ai to the HTTP endpoint:**

In Claude.ai settings, add a new MCP server pointing at `https://mcp.your-domain.com/mcp`. Claude.ai will discover the OAuth metadata automatically and prompt you to log in with your Mealie credentials.

**Nginx configuration:**

See [`nginx-mcp.conf.example`](./nginx-mcp.conf.example) for the location blocks needed to proxy MCP and OAuth traffic when running behind nginx.

A health check endpoint is available at `GET /health`.

**Note on auth state:** The HTTP server stores OAuth tokens in memory. Restarting the server invalidates all existing sessions and requires clients to re-authenticate.

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
MEALIE_URL=http://localhost:9925 MEALIE_API_TOKEN=your-token \
MCP_SERVER_URL=http://localhost:3000 npm run dev:http
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

# Run (HTTP with OAuth)
docker run --rm -p 3000:3000 \
  -e TRANSPORT=http \
  -e MEALIE_URL=http://your-mealie:9925 \
  -e MEALIE_API_TOKEN=your-token \
  -e MCP_SERVER_URL=https://mcp.your-domain.com \
  mealie-mcp-server
```

## Architecture

```
src/
├── index.ts              # stdio entry point
├── http.ts               # HTTP entry point (Streamable HTTP transport + OAuth)
├── server.ts             # Creates MCP server and registers all tools (transport-agnostic)
├── mealie-client.ts      # HTTP client for the Mealie REST API
├── types.ts              # TypeScript type definitions for Mealie API shapes
├── auth/
│   ├── provider.ts       # OAuth 2.0 provider (validates Mealie credentials, issues tokens)
│   └── login-page.ts     # HTML login page rendered during OAuth authorization flow
└── tools/
    ├── get-recipe.ts     # get_recipe tool
    ├── search-recipes.ts # search_recipes tool
    ├── create-recipe.ts  # create_recipe tool
    ├── import-recipe.ts  # import_recipe tool
    └── update-recipe.ts  # update_recipe tool
```

The server core (`server.ts`) is **transport-agnostic** — it builds the MCP server and registers tools without knowing which transport will be used. The two entry points (`index.ts` for stdio, `http.ts` for HTTP) each wire in their respective transport.

- **stdio** communicates via stdin/stdout using JSON-RPC 2.0. Standard for Claude Desktop and local MCP clients.
- **Streamable HTTP** exposes a `/mcp` endpoint supporting POST (requests), GET (SSE stream), and DELETE (session termination). Uses stateful sessions with `Mcp-Session-Id` headers. Full OAuth 2.0 + PKCE authentication using Mealie credentials as the identity provider.

## License

MIT
