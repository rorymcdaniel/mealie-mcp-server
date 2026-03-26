#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { createServer, type ServerConfig } from "./server.js";
import { MealieOAuthProvider } from "./auth/provider.js";

interface TransportEntry {
  transport: StreamableHTTPServerTransport;
  createdAt: number;
}

export interface HttpAppOptions {
  config: ServerConfig;
  /** Public URL of this server (e.g. https://mcp.your-domain.com) */
  serverUrl: string;
}

/* v8 ignore start -- CLI entry point, tested via integration */
function getMealieConfig(): ServerConfig {
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

  return { mealieUrl, mealieApiToken };
}
/* v8 ignore stop */

export function createHttpApp(options: HttpAppOptions) {
  const { config, serverUrl } = options;
  const app = express();

  const issuerUrl = new URL(serverUrl);
  const resourceServerUrl = new URL("/mcp", serverUrl);

  // Create the OAuth provider backed by Mealie credentials
  const oauthProvider = new MealieOAuthProvider({
    mealieUrl: config.mealieUrl,
  });

  // Mount the OAuth auth router (handles /authorize, /token, /register, /revoke,
  // /.well-known/oauth-authorization-server, /.well-known/oauth-protected-resource/mcp)
  app.use(
    mcpAuthRouter({
      provider: oauthProvider,
      issuerUrl,
      resourceServerUrl,
      scopesSupported: ["mealie:read", "mealie:write"],
      resourceName: "Mealie MCP Server",
      // Disable rate limiting — nginx/Cloudflare handle this at the edge
      authorizationOptions: { rateLimit: false },
      tokenOptions: { rateLimit: false },
      clientRegistrationOptions: { rateLimit: false },
      revocationOptions: { rateLimit: false },
    })
  );

  // Protect the /mcp endpoint with OAuth bearer auth
  const bearerAuth = requireBearerAuth({
    verifier: oauthProvider,
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resourceServerUrl),
  });
  app.use("/mcp", bearerAuth);

  // Parse JSON for MCP requests (after auth middleware)
  app.use("/mcp", express.json());

  // Log all /mcp requests for debugging
  app.use("/mcp", (req, _res, next) => {
    const method = req.method;
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const body = req.body;
    const rpcMethod = body?.method ?? "(no method)";
    const toolName = body?.params?.name ?? "";
    console.error(
      `[HTTP] ${method} /mcp session=${sessionId ?? "(none)"} rpc=${rpcMethod}${toolName ? ` tool=${toolName}` : ""}`
    );
    next();
  });

  const sessions = new Map<string, TransportEntry>();

  app.post("/mcp", async (req, res) => {
    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      if (sessionId && sessions.has(sessionId)) {
        const entry = sessions.get(sessionId)!;
        await entry.transport.handleRequest(req, res, req.body);
        return;
      }

      if (!sessionId && isInitializeRequest(req.body)) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            sessions.set(sid, { transport, createdAt: Date.now() });
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) sessions.delete(sid);
        };

        const server = createServer(config);
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      }

      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: No valid session ID" },
        id: null,
      });
    } catch (error) {
      console.error("[HTTP] Error handling POST /mcp:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  app.get("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    await sessions.get(sessionId)!.transport.handleRequest(req, res);
  });

  app.delete("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    await sessions.get(sessionId)!.transport.handleRequest(req, res);
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", sessions: sessions.size });
  });

  return app;
}

/* v8 ignore start -- CLI entry point, tested via integration */
function main(): void {
  const config = getMealieConfig();
  const serverUrl = process.env.MCP_SERVER_URL;
  const port = parseInt(process.env.PORT ?? "3000", 10);

  if (!serverUrl) {
    console.error(
      "Error: MCP_SERVER_URL environment variable is required.\n" +
        "Set it to the public URL of this server (e.g. https://mcp.your-domain.com)"
    );
    process.exit(1);
  }

  const app = createHttpApp({ config, serverUrl });

  app.listen(port, () => {
    console.error(`Mealie MCP server (HTTP) listening on port ${port}`);
    console.error(`MCP endpoint: http://localhost:${port}/mcp`);
    console.error(`OAuth issuer: ${serverUrl}`);
    console.error("Auth: OAuth 2.0 (Mealie credentials)");
  });
}

// Only run when executed directly (not when imported for testing)
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  // Log unhandled errors so Docker captures stack traces
  process.on("uncaughtException", (err) => {
    console.error("[FATAL] Uncaught exception:", err);
  });
  process.on("unhandledRejection", (reason) => {
    console.error("[FATAL] Unhandled rejection:", reason);
  });

  main();
}
/* v8 ignore stop */
