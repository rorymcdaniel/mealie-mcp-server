import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createHttpApp, type HttpAppOptions } from "../src/http.js";

const options: HttpAppOptions = {
  config: {
    mealieUrl: "http://mealie.local",
    mealieApiToken: "test-token",
  },
  serverUrl: "https://recipes.example.com",
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

/**
 * Helper: registers an OAuth client, authorizes with Mealie credentials,
 * and exchanges the auth code for an access token.
 */
async function getAccessToken(app: ReturnType<typeof createHttpApp>): Promise<string> {
  // Mock Mealie returning success for login
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, status: 200 })
  );

  // Step 1: Dynamic client registration
  const regRes = await request(app)
    .post("/register")
    .send({
      redirect_uris: ["https://claude.ai/callback"],
      client_name: "test-client",
    });

  expect(regRes.status).toBe(201);
  const clientId = regRes.body.client_id;
  const clientSecret = regRes.body.client_secret;

  // Step 2: Authorize (POST with credentials)
  const authorizeRes = await request(app)
    .post("/authorize")
    .type("form")
    .send({
      client_id: clientId,
      redirect_uri: "https://claude.ai/callback",
      response_type: "code",
      code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
      code_challenge_method: "S256",
      state: "test-state",
      username: "user@test.com",
      password: "valid-password",
    });

  expect(authorizeRes.status).toBe(302);
  const redirectUrl = new URL(authorizeRes.headers.location);
  const code = redirectUrl.searchParams.get("code")!;

  // Step 3: Exchange code for tokens
  // The PKCE code_verifier that matches the challenge above
  const tokenRes = await request(app)
    .post("/token")
    .type("form")
    .send({
      grant_type: "authorization_code",
      code,
      // code_verifier that when SHA-256'd and base64url'd gives the challenge above
      code_verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: "https://claude.ai/callback",
    });

  expect(tokenRes.status).toBe(200);
  return tokenRes.body.access_token;
}

describe("HTTP transport", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("health endpoint", () => {
    it("returns ok status without auth", async () => {
      const app = createHttpApp(options);
      const res = await request(app).get("/health");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: "ok", sessions: 0 });
    });
  });

  describe("OAuth metadata discovery", () => {
    it("serves protected resource metadata", async () => {
      const app = createHttpApp(options);
      const res = await request(app).get("/.well-known/oauth-protected-resource/mcp");

      expect(res.status).toBe(200);
      expect(res.body.resource).toBe("https://recipes.example.com/mcp");
      expect(res.body.authorization_servers).toContain("https://recipes.example.com/");
    });

    it("serves authorization server metadata", async () => {
      const app = createHttpApp(options);
      const res = await request(app).get("/.well-known/oauth-authorization-server");

      expect(res.status).toBe(200);
      expect(res.body.issuer).toBe("https://recipes.example.com/");
      expect(res.body.authorization_endpoint).toContain("/authorize");
      expect(res.body.token_endpoint).toContain("/token");
      expect(res.body.registration_endpoint).toContain("/register");
      expect(res.body.response_types_supported).toContain("code");
      expect(res.body.code_challenge_methods_supported).toContain("S256");
    });
  });

  describe("OAuth client registration", () => {
    it("dynamically registers a client", async () => {
      const app = createHttpApp(options);
      const res = await request(app)
        .post("/register")
        .send({
          redirect_uris: ["https://claude.ai/callback"],
          client_name: "Claude Web",
        });

      expect(res.status).toBe(201);
      expect(res.body.client_id).toBeDefined();
      expect(res.body.redirect_uris).toEqual(["https://claude.ai/callback"]);
    });
  });

  describe("OAuth authorization", () => {
    it("shows login page on GET /authorize", async () => {
      const app = createHttpApp(options);

      // Register a client first
      const regRes = await request(app)
        .post("/register")
        .send({
          redirect_uris: ["https://claude.ai/callback"],
          client_name: "test",
        });
      const clientId = regRes.body.client_id;

      const res = await request(app)
        .get("/authorize")
        .query({
          client_id: clientId,
          redirect_uri: "https://claude.ai/callback",
          response_type: "code",
          code_challenge: "test-challenge",
          code_challenge_method: "S256",
        });

      expect(res.status).toBe(200);
      expect(res.text).toContain("Sign in with your Mealie account");
    });
  });

  describe("MCP endpoint authentication", () => {
    it("rejects MCP requests without auth token", async () => {
      const app = createHttpApp(options);
      const res = await request(app)
        .post("/mcp")
        .send(initializeRequest);

      expect(res.status).toBe(401);
    });

    it("rejects MCP requests with invalid auth token", async () => {
      const app = createHttpApp(options);
      const res = await request(app)
        .post("/mcp")
        .set("Authorization", "Bearer invalid-token")
        .send(initializeRequest);

      expect(res.status).toBe(401);
    });

    it("accepts MCP requests with valid OAuth token", async () => {
      const app = createHttpApp(options);
      const token = await getAccessToken(app);

      const res = await request(app)
        .post("/mcp")
        .set("Authorization", `Bearer ${token}`)
        .set("Accept", "application/json, text/event-stream")
        .send(initializeRequest);

      expect([200, 201]).toContain(res.status);
      expect(res.headers["mcp-session-id"]).toBeDefined();
    });
  });

  describe("session lifecycle", () => {
    it("rejects POST without session ID for non-init requests", async () => {
      const app = createHttpApp(options);
      const token = await getAccessToken(app);

      const res = await request(app)
        .post("/mcp")
        .set("Authorization", `Bearer ${token}`)
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
      const app = createHttpApp(options);
      const token = await getAccessToken(app);

      const res = await request(app)
        .get("/mcp")
        .set("Authorization", `Bearer ${token}`)
        .set("Accept", "text/event-stream");

      expect(res.status).toBe(400);
    });

    it("rejects DELETE without session ID", async () => {
      const app = createHttpApp(options);
      const token = await getAccessToken(app);

      const res = await request(app)
        .delete("/mcp")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(400);
    });
  });

  describe("full tool call flow", () => {
    it("can initialize and call a tool with OAuth", async () => {
      const app = createHttpApp(options);
      const token = await getAccessToken(app);

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

      // Override fetch for recipe API calls
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

      // Step 1: Initialize
      const initRes = await request(app)
        .post("/mcp")
        .set("Authorization", `Bearer ${token}`)
        .set("Accept", "application/json, text/event-stream")
        .send(initializeRequest);

      const sessionId = initRes.headers["mcp-session-id"] as string;
      expect(sessionId).toBeDefined();

      // Step 2: Send initialized notification
      await request(app)
        .post("/mcp")
        .set("Authorization", `Bearer ${token}`)
        .set("Accept", "application/json, text/event-stream")
        .set("mcp-session-id", sessionId)
        .send({
          jsonrpc: "2.0",
          method: "notifications/initialized",
        });

      // Step 3: Call a tool
      const toolRes = await request(app)
        .post("/mcp")
        .set("Authorization", `Bearer ${token}`)
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
        const dataLine = toolRes.text
          .split("\n")
          .find((line: string) => line.startsWith("data: "));
        expect(dataLine).toBeDefined();
        const jsonRpcResult = JSON.parse(dataLine!.replace("data: ", ""));
        expect(jsonRpcResult.id).toBe(3);
        expect(jsonRpcResult.result.content[0].text).toContain("Pasta");
      } else {
        expect(toolRes.body.result.content[0].text).toContain("Pasta");
      }
    });
  });
});
