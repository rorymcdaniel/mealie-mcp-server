import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createHttpApp } from "../src/http.js";

const config = {
  mealieUrl: "http://mealie.local",
  mealieApiToken: "test-token",
};

const initializeRequest = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "test-client", version: "1.0.0" },
  },
};

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: vi.fn().mockResolvedValue({}),
      text: vi.fn().mockResolvedValue(""),
      headers: { get: vi.fn().mockReturnValue("application/json") },
    })
  );
}

describe("HTTP transport", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    stubFetch();
  });

  describe("health endpoint", () => {
    it("returns ok status", async () => {
      const app = createHttpApp(config);
      const res = await request(app).get("/health");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: "ok", sessions: 0 });
    });
  });

  describe("session lifecycle", () => {
    it("creates a session on initialize", async () => {
      const app = createHttpApp(config);
      const res = await request(app)
        .post("/mcp")
        .set("Accept", "application/json, text/event-stream")
        .send(initializeRequest);

      // StreamableHTTP responds with SSE stream or JSON
      expect([200, 201]).toContain(res.status);
      // Should have a session ID header
      const sessionId = res.headers["mcp-session-id"];
      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe("string");
    });

    it("rejects POST without session ID after init", async () => {
      const app = createHttpApp(config);

      // Non-initialize request without session ID
      const res = await request(app)
        .post("/mcp")
        .set("Accept", "application/json, text/event-stream")
        .send({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
          params: {},
        });

      expect(res.status).toBe(400);
    });

    it("rejects GET without session ID", async () => {
      const app = createHttpApp(config);
      const res = await request(app)
        .get("/mcp")
        .set("Accept", "text/event-stream");

      expect(res.status).toBe(400);
    });

    it("rejects DELETE without session ID", async () => {
      const app = createHttpApp(config);
      const res = await request(app).delete("/mcp");

      expect(res.status).toBe(400);
    });

    it("rejects GET with invalid session ID", async () => {
      const app = createHttpApp(config);
      const res = await request(app)
        .get("/mcp")
        .set("Accept", "text/event-stream")
        .set("mcp-session-id", "nonexistent");

      expect(res.status).toBe(400);
    });

    it("rejects DELETE with invalid session ID", async () => {
      const app = createHttpApp(config);
      const res = await request(app)
        .delete("/mcp")
        .set("mcp-session-id", "nonexistent");

      expect(res.status).toBe(400);
    });
  });

  describe("authentication", () => {
    let app: Express;

    beforeEach(() => {
      app = createHttpApp(config, "secret-token");
    });

    it("rejects requests without auth token", async () => {
      const res = await request(app).post("/mcp").send(initializeRequest);

      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe("Unauthorized");
    });

    it("rejects requests with wrong auth token", async () => {
      const res = await request(app)
        .post("/mcp")
        .set("Authorization", "Bearer wrong-token")
        .send(initializeRequest);

      expect(res.status).toBe(401);
    });

    it("allows requests with correct auth token", async () => {
      const res = await request(app)
        .post("/mcp")
        .set("Authorization", "Bearer secret-token")
        .set("Accept", "application/json, text/event-stream")
        .send(initializeRequest);

      expect([200, 201]).toContain(res.status);
    });

    it("does not require auth on /health", async () => {
      const res = await request(app).get("/health");

      expect(res.status).toBe(200);
    });
  });

  describe("no auth configured", () => {
    it("allows requests without token when auth not set", async () => {
      const app = createHttpApp(config);
      const res = await request(app)
        .post("/mcp")
        .set("Accept", "application/json, text/event-stream")
        .send(initializeRequest);

      expect([200, 201]).toContain(res.status);
    });
  });

  describe("full tool call flow", () => {
    it("can initialize and call a tool", async () => {
      const sampleRecipe = {
        id: "r1",
        name: "Pasta",
        slug: "pasta",
        description: "Delicious",
        recipeCategory: [],
        tags: [],
        tools: [],
        rating: null,
        dateAdded: null,
        dateUpdated: null,
        createdAt: null,
        updatedAt: null,
        recipeServings: 4,
        recipeYield: null,
        totalTime: null,
        prepTime: null,
        cookTime: null,
        performTime: null,
        orgURL: null,
        recipeIngredient: [],
        recipeInstructions: [],
        nutrition: null,
        settings: null,
        notes: [],
        extras: {},
      };

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          statusText: "OK",
          json: vi.fn().mockResolvedValue(sampleRecipe),
          text: vi.fn().mockResolvedValue(""),
          headers: { get: vi.fn().mockReturnValue("application/json") },
        })
      );

      const app = createHttpApp(config);

      // Step 1: Initialize
      const initRes = await request(app)
        .post("/mcp")
        .set("Accept", "application/json, text/event-stream")
        .send(initializeRequest);

      const sessionId = initRes.headers["mcp-session-id"] as string;
      expect(sessionId).toBeDefined();

      // Step 2: Send initialized notification
      await request(app)
        .post("/mcp")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          method: "notifications/initialized",
        });

      // Step 3: Call a tool
      const toolRes = await request(app)
        .post("/mcp")
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: {
            name: "get_recipe",
            arguments: { slug: "pasta" },
          },
        });

      expect(toolRes.status).toBe(200);

      // Response is SSE stream containing the JSON-RPC result
      const contentType = toolRes.headers["content-type"] as string;
      if (contentType?.includes("text/event-stream")) {
        // SSE response — parse data lines to find the JSON-RPC result
        const dataLine = toolRes.text
          .split("\n")
          .find((line: string) => line.startsWith("data: "));
        expect(dataLine).toBeDefined();
        const jsonRpcResult = JSON.parse(dataLine!.replace("data: ", ""));
        expect(jsonRpcResult.id).toBe(3);
        expect(jsonRpcResult.result.content[0].text).toContain("Pasta");
      } else {
        // JSON response
        expect(toolRes.body.result.content[0].text).toContain("Pasta");
      }
    });
  });
});
