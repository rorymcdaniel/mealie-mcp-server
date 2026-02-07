#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createServer, type ServerConfig } from "./server.js";

interface TransportEntry {
  transport: StreamableHTTPServerTransport;
  createdAt: number;
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

function createAuthMiddleware(token: string) {
  return (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ): void => {
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${token}`) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Unauthorized" },
        id: null,
      });
      return;
    }
    next();
  };
}

export function createHttpApp(config: ServerConfig, authToken?: string) {
  const app = express();
  app.use(express.json());

  if (authToken) {
    app.use("/mcp", createAuthMiddleware(authToken));
  }

  const sessions = new Map<string, TransportEntry>();

  app.post("/mcp", async (req, res) => {
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
  const authToken = process.env.MCP_AUTH_TOKEN;
  const port = parseInt(process.env.PORT ?? "3000", 10);

  if (!authToken) {
    console.warn(
      "Warning: MCP_AUTH_TOKEN not set. The HTTP endpoint is unauthenticated.\n" +
        "Set MCP_AUTH_TOKEN to require bearer token auth on all MCP requests."
    );
  }

  const app = createHttpApp(config, authToken);

  app.listen(port, () => {
    console.error(`Mealie MCP server (HTTP) listening on port ${port}`);
    console.error(`MCP endpoint: http://localhost:${port}/mcp`);
    console.error(
      `Auth: ${authToken ? "enabled (bearer token)" : "disabled"}`
    );
  });
}

// Only run when executed directly (not when imported for testing)
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
/* v8 ignore stop */
