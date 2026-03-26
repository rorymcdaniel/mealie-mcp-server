import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Response, Request } from "express";
import { MealieOAuthProvider } from "../../src/auth/provider.js";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";

function createProvider(mealieUrl = "http://mealie.local") {
  return new MealieOAuthProvider({ mealieUrl });
}

function createMockClient(provider: MealieOAuthProvider): OAuthClientInformationFull {
  return provider.clientsStore.registerClient!({
    redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
    client_name: "Test Client",
  });
}

function createMockResponse(body?: Record<string, string>): Response {
  const res = {
    req: { body } as Request,
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    redirect: vi.fn(),
    setHeader: vi.fn(),
  } as unknown as Response;
  return res;
}

describe("MealieOAuthProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("clientsStore", () => {
    it("registers a client with dynamic registration", () => {
      const provider = createProvider();
      const client = createMockClient(provider);

      expect(client.client_id).toBeDefined();
      expect(client.client_id_issued_at).toBeDefined();
      expect(client.redirect_uris).toEqual(["https://claude.ai/api/mcp/auth_callback"]);
      expect(client.client_name).toBe("Test Client");
    });

    it("retrieves a registered client by ID", () => {
      const provider = createProvider();
      const client = createMockClient(provider);

      const retrieved = provider.clientsStore.getClient(client.client_id);
      expect(retrieved).toEqual(client);
    });

    it("returns undefined for unknown client ID", () => {
      const provider = createProvider();
      expect(provider.clientsStore.getClient("nonexistent")).toBeUndefined();
    });

    it("generates unique client IDs", () => {
      const provider = createProvider();
      const client1 = createMockClient(provider);
      const client2 = createMockClient(provider);
      expect(client1.client_id).not.toBe(client2.client_id);
    });
  });

  describe("authorize", () => {
    it("shows login page when no credentials submitted", async () => {
      const provider = createProvider();
      const client = createMockClient(provider);
      const res = createMockResponse();

      await provider.authorize(
        client,
        {
          redirectUri: "https://claude.ai/callback",
          codeChallenge: "test-challenge",
          state: "test-state",
          scopes: ["mealie:read"],
        },
        res
      );

      expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/html");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith(
        expect.stringContaining("Sign in with your Mealie account")
      );
    });

    it("shows login page with error on invalid credentials", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: false, status: 401 })
      );

      const provider = createProvider();
      const client = createMockClient(provider);
      const res = createMockResponse({ username: "bad", password: "bad" });

      await provider.authorize(
        client,
        {
          redirectUri: "https://claude.ai/callback",
          codeChallenge: "test-challenge",
          scopes: [],
        },
        res
      );

      expect(res.send).toHaveBeenCalledWith(
        expect.stringContaining("Invalid username or password")
      );
    });

    it("redirects with authorization code on valid credentials", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, status: 200 })
      );

      const provider = createProvider();
      const client = createMockClient(provider);
      const res = createMockResponse({ username: "user@test.com", password: "pass123" });

      await provider.authorize(
        client,
        {
          redirectUri: "https://claude.ai/callback",
          codeChallenge: "test-challenge",
          state: "my-state",
          scopes: ["mealie:read"],
        },
        res
      );

      expect(res.redirect).toHaveBeenCalledWith(
        302,
        expect.stringMatching(/^https:\/\/claude\.ai\/callback\?code=.+&state=my-state$/)
      );
    });

    it("validates credentials against Mealie API", async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal("fetch", mockFetch);

      const provider = createProvider("http://mealie.local:9000");
      const client = createMockClient(provider);
      const res = createMockResponse({ username: "user@test.com", password: "mypass" });

      await provider.authorize(
        client,
        {
          redirectUri: "https://claude.ai/callback",
          codeChallenge: "c",
          scopes: [],
        },
        res
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "http://mealie.local:9000/api/auth/token",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: "username=user%40test.com&password=mypass",
        })
      );
    });
  });

  describe("challengeForAuthorizationCode", () => {
    it("returns the challenge for a valid auth code", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, status: 200 })
      );

      const provider = createProvider();
      const client = createMockClient(provider);
      const res = createMockResponse({ username: "u", password: "p" });

      await provider.authorize(
        client,
        {
          redirectUri: "https://claude.ai/callback",
          codeChallenge: "my-challenge-123",
          scopes: [],
        },
        res
      );

      // Extract the code from redirect URL
      const redirectUrl = (res.redirect as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
      const code = new URL(redirectUrl).searchParams.get("code")!;

      const challenge = await provider.challengeForAuthorizationCode(client, code);
      expect(challenge).toBe("my-challenge-123");
    });

    it("throws for invalid auth code", async () => {
      const provider = createProvider();
      const client = createMockClient(provider);

      await expect(
        provider.challengeForAuthorizationCode(client, "invalid-code")
      ).rejects.toThrow("Invalid authorization code");
    });
  });

  describe("exchangeAuthorizationCode", () => {
    async function getAuthCode(provider: MealieOAuthProvider, client: OAuthClientInformationFull): Promise<string> {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, status: 200 })
      );
      const res = createMockResponse({ username: "u", password: "p" });
      await provider.authorize(
        client,
        {
          redirectUri: "https://claude.ai/callback",
          codeChallenge: "challenge",
          scopes: ["mealie:read"],
        },
        res
      );
      const redirectUrl = (res.redirect as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
      return new URL(redirectUrl).searchParams.get("code")!;
    }

    it("returns tokens for valid auth code", async () => {
      const provider = createProvider();
      const client = createMockClient(provider);
      const code = await getAuthCode(provider, client);

      const tokens = await provider.exchangeAuthorizationCode(client, code);

      expect(tokens.access_token).toBeDefined();
      expect(tokens.refresh_token).toBeDefined();
      expect(tokens.token_type).toBe("Bearer");
      expect(tokens.expires_in).toBe(3600);
      expect(tokens.scope).toBe("mealie:read");
    });

    it("consumes auth code (single use)", async () => {
      const provider = createProvider();
      const client = createMockClient(provider);
      const code = await getAuthCode(provider, client);

      await provider.exchangeAuthorizationCode(client, code);

      await expect(
        provider.exchangeAuthorizationCode(client, code)
      ).rejects.toThrow("Invalid authorization code");
    });

    it("rejects code issued to a different client", async () => {
      const provider = createProvider();
      const client1 = createMockClient(provider);
      const client2 = createMockClient(provider);
      const code = await getAuthCode(provider, client1);

      await expect(
        provider.exchangeAuthorizationCode(client2, code)
      ).rejects.toThrow("Authorization code was not issued to this client");
    });
  });

  describe("verifyAccessToken", () => {
    it("verifies a valid access token", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, status: 200 })
      );

      const provider = createProvider();
      const client = createMockClient(provider);
      const res = createMockResponse({ username: "u", password: "p" });

      await provider.authorize(
        client,
        {
          redirectUri: "https://claude.ai/callback",
          codeChallenge: "c",
          scopes: ["mealie:read"],
        },
        res
      );

      const redirectUrl = (res.redirect as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
      const code = new URL(redirectUrl).searchParams.get("code")!;

      const tokens = await provider.exchangeAuthorizationCode(client, code);
      const authInfo = await provider.verifyAccessToken(tokens.access_token);

      expect(authInfo.clientId).toBe(client.client_id);
      expect(authInfo.scopes).toEqual(["mealie:read"]);
      expect(authInfo.token).toBe(tokens.access_token);
      expect(authInfo.expiresAt).toBeDefined();
    });

    it("rejects invalid access token", async () => {
      const provider = createProvider();
      await expect(
        provider.verifyAccessToken("invalid-token")
      ).rejects.toThrow("Invalid access token");
    });
  });

  describe("exchangeRefreshToken", () => {
    it("issues new tokens from a valid refresh token", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, status: 200 })
      );

      const provider = createProvider();
      const client = createMockClient(provider);
      const res = createMockResponse({ username: "u", password: "p" });

      await provider.authorize(
        client,
        {
          redirectUri: "https://claude.ai/callback",
          codeChallenge: "c",
          scopes: ["mealie:read"],
        },
        res
      );

      const redirectUrl = (res.redirect as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
      const code = new URL(redirectUrl).searchParams.get("code")!;

      const tokens = await provider.exchangeAuthorizationCode(client, code);
      const newTokens = await provider.exchangeRefreshToken(
        client,
        tokens.refresh_token!
      );

      expect(newTokens.access_token).toBeDefined();
      expect(newTokens.access_token).not.toBe(tokens.access_token);
      expect(newTokens.refresh_token).toBeDefined();
      expect(newTokens.refresh_token).not.toBe(tokens.refresh_token);
    });

    it("invalidates old access token after refresh", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, status: 200 })
      );

      const provider = createProvider();
      const client = createMockClient(provider);
      const res = createMockResponse({ username: "u", password: "p" });

      await provider.authorize(
        client,
        {
          redirectUri: "https://claude.ai/callback",
          codeChallenge: "c",
          scopes: [],
        },
        res
      );

      const redirectUrl = (res.redirect as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
      const code = new URL(redirectUrl).searchParams.get("code")!;

      const tokens = await provider.exchangeAuthorizationCode(client, code);
      await provider.exchangeRefreshToken(client, tokens.refresh_token!);

      // Old access token should be revoked
      await expect(
        provider.verifyAccessToken(tokens.access_token)
      ).rejects.toThrow("Invalid access token");
    });

    it("rejects invalid refresh token", async () => {
      const provider = createProvider();
      const client = createMockClient(provider);

      await expect(
        provider.exchangeRefreshToken(client, "invalid")
      ).rejects.toThrow("Invalid refresh token");
    });

    it("rejects refresh token from different client", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, status: 200 })
      );

      const provider = createProvider();
      const client1 = createMockClient(provider);
      const client2 = createMockClient(provider);
      const res = createMockResponse({ username: "u", password: "p" });

      await provider.authorize(
        client1,
        {
          redirectUri: "https://claude.ai/callback",
          codeChallenge: "c",
          scopes: [],
        },
        res
      );

      const redirectUrl = (res.redirect as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
      const code = new URL(redirectUrl).searchParams.get("code")!;

      const tokens = await provider.exchangeAuthorizationCode(client1, code);

      await expect(
        provider.exchangeRefreshToken(client2, tokens.refresh_token!)
      ).rejects.toThrow("Refresh token was not issued to this client");
    });
  });

  describe("revokeToken", () => {
    it("revokes an access token and its linked refresh token", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, status: 200 })
      );

      const provider = createProvider();
      const client = createMockClient(provider);
      const res = createMockResponse({ username: "u", password: "p" });

      await provider.authorize(
        client,
        {
          redirectUri: "https://claude.ai/callback",
          codeChallenge: "c",
          scopes: [],
        },
        res
      );

      const redirectUrl = (res.redirect as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
      const code = new URL(redirectUrl).searchParams.get("code")!;

      const tokens = await provider.exchangeAuthorizationCode(client, code);

      await provider.revokeToken!(client, { token: tokens.access_token });

      await expect(
        provider.verifyAccessToken(tokens.access_token)
      ).rejects.toThrow("Invalid access token");
      await expect(
        provider.exchangeRefreshToken(client, tokens.refresh_token!)
      ).rejects.toThrow("Invalid refresh token");
    });

    it("does not throw for unknown tokens", async () => {
      const provider = createProvider();
      const client = createMockClient(provider);

      // Should silently succeed (per OAuth spec)
      await expect(
        provider.revokeToken!(client, { token: "nonexistent" })
      ).resolves.toBeUndefined();
    });
  });

  describe("validateMealieCredentials", () => {
    it("returns true for valid credentials", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, status: 200 })
      );

      const provider = createProvider();
      const result = await provider.validateMealieCredentials("user", "pass");
      expect(result).toBe(true);
    });

    it("returns false for invalid credentials", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: false, status: 401 })
      );

      const provider = createProvider();
      const result = await provider.validateMealieCredentials("user", "wrong");
      expect(result).toBe(false);
    });

    it("returns false on network error", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("Network error"))
      );

      const provider = createProvider();
      const result = await provider.validateMealieCredentials("user", "pass");
      expect(result).toBe(false);
    });
  });
});
