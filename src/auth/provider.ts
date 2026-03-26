import { randomUUID, randomBytes } from "node:crypto";
import type { Response } from "express";
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
  OAuthTokenRevocationRequest,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { InvalidTokenError, InvalidGrantError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { renderLoginPage } from "./login-page.js";

// Token lifetimes
const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const AUTH_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface StoredAuthCode {
  code: string;
  clientId: string;
  codeChallenge: string;
  redirectUri: string;
  scopes: string[];
  resource?: URL;
  createdAt: number;
}

interface StoredToken {
  token: string;
  clientId: string;
  scopes: string[];
  resource?: URL;
  expiresAt: number;
  /** Associated refresh token (for access tokens) or access token (for refresh tokens) */
  linkedToken?: string;
}

export interface MealieOAuthProviderOptions {
  /** Mealie instance URL for credential validation */
  mealieUrl: string;
}

/**
 * In-memory OAuth client store with dynamic registration support.
 */
class InMemoryClientsStore implements OAuthRegisteredClientsStore {
  private clients = new Map<string, OAuthClientInformationFull>();

  getClient(
    clientId: string
  ): OAuthClientInformationFull | undefined {
    return this.clients.get(clientId);
  }

  registerClient(
    client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">
  ): OAuthClientInformationFull {
    const clientId = randomUUID();
    const full: OAuthClientInformationFull = {
      ...client,
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
    };
    this.clients.set(clientId, full);
    return full;
  }
}

/**
 * OAuth 2.0 provider that authenticates users against a Mealie instance.
 * Implements the MCP SDK's OAuthServerProvider interface.
 *
 * Uses in-memory storage for tokens, auth codes, and registered clients.
 * Server restarts clear all state (users just re-authenticate).
 */
export class MealieOAuthProvider implements OAuthServerProvider {
  readonly clientsStore: InMemoryClientsStore;

  private authCodes = new Map<string, StoredAuthCode>();
  private accessTokens = new Map<string, StoredToken>();
  private refreshTokens = new Map<string, StoredToken>();

  private mealieUrl: string;

  constructor(options: MealieOAuthProviderOptions) {
    this.mealieUrl = options.mealieUrl.replace(/\/+$/, "");
    this.clientsStore = new InMemoryClientsStore();
  }

  /**
   * Handles the authorization request. On GET, shows a login form.
   * On POST with credentials, validates against Mealie and issues an auth code.
   */
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    // The SDK's authorize handler calls this for both GET and POST.
    // For GET requests (initial page load), show the login form.
    // For POST requests with username/password, authenticate and redirect.
    const req = res.req;
    const username = req.body?.username;
    const password = req.body?.password;

    // If no credentials submitted, show the login form
    if (!username || !password) {
      res.setHeader("Content-Type", "text/html");
      res.status(200).send(
        renderLoginPage({
          clientId: client.client_id,
          redirectUri: params.redirectUri,
          codeChallenge: params.codeChallenge,
          state: params.state,
          scopes: params.scopes ?? [],
          resource: params.resource?.href,
        })
      );
      return;
    }

    // Validate credentials against Mealie
    const isValid = await this.validateMealieCredentials(username, password);
    if (!isValid) {
      res.setHeader("Content-Type", "text/html");
      res.status(200).send(
        renderLoginPage({
          clientId: client.client_id,
          redirectUri: params.redirectUri,
          codeChallenge: params.codeChallenge,
          state: params.state,
          scopes: params.scopes ?? [],
          resource: params.resource?.href,
          error: "Invalid username or password",
        })
      );
      return;
    }

    // Generate authorization code
    const code = randomBytes(32).toString("hex");
    this.authCodes.set(code, {
      code,
      clientId: client.client_id,
      codeChallenge: params.codeChallenge,
      redirectUri: params.redirectUri,
      scopes: params.scopes ?? [],
      resource: params.resource,
      createdAt: Date.now(),
    });

    // Redirect back to the client with the authorization code
    const redirectUrl = new URL(params.redirectUri);
    redirectUrl.searchParams.set("code", code);
    if (params.state) {
      redirectUrl.searchParams.set("state", params.state);
    }
    res.redirect(302, redirectUrl.href);
  }

  /**
   * Returns the PKCE code challenge associated with an authorization code.
   */
  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> {
    const stored = this.authCodes.get(authorizationCode);
    if (!stored) {
      throw new InvalidGrantError("Invalid authorization code");
    }
    if (Date.now() - stored.createdAt > AUTH_CODE_TTL_MS) {
      this.authCodes.delete(authorizationCode);
      throw new InvalidGrantError("Authorization code expired");
    }
    return stored.codeChallenge;
  }

  /**
   * Exchanges an authorization code for access and refresh tokens.
   */
  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    _redirectUri?: string,
    resource?: URL
  ): Promise<OAuthTokens> {
    const stored = this.authCodes.get(authorizationCode);
    if (!stored) {
      throw new InvalidGrantError("Invalid authorization code");
    }
    if (stored.clientId !== client.client_id) {
      throw new InvalidGrantError("Authorization code was not issued to this client");
    }
    if (Date.now() - stored.createdAt > AUTH_CODE_TTL_MS) {
      this.authCodes.delete(authorizationCode);
      throw new InvalidGrantError("Authorization code expired");
    }

    // Consume the authorization code (one-time use)
    this.authCodes.delete(authorizationCode);

    return this.issueTokens(client.client_id, stored.scopes, resource ?? stored.resource);
  }

  /**
   * Exchanges a refresh token for new access and refresh tokens.
   */
  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    resource?: URL
  ): Promise<OAuthTokens> {
    const stored = this.refreshTokens.get(refreshToken);
    if (!stored) {
      throw new InvalidGrantError("Invalid refresh token");
    }
    if (stored.clientId !== client.client_id) {
      throw new InvalidGrantError("Refresh token was not issued to this client");
    }
    if (Date.now() > stored.expiresAt) {
      this.refreshTokens.delete(refreshToken);
      throw new InvalidGrantError("Refresh token expired");
    }

    // Revoke old tokens
    if (stored.linkedToken) {
      this.accessTokens.delete(stored.linkedToken);
    }
    this.refreshTokens.delete(refreshToken);

    // Issue new token pair
    const tokenScopes = scopes ?? stored.scopes;
    return this.issueTokens(client.client_id, tokenScopes, resource ?? stored.resource);
  }

  /**
   * Verifies an access token and returns auth info.
   */
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const stored = this.accessTokens.get(token);
    if (!stored) {
      throw new InvalidTokenError("Invalid access token");
    }
    if (Date.now() > stored.expiresAt) {
      this.accessTokens.delete(token);
      throw new InvalidTokenError("Access token expired");
    }
    return {
      token: stored.token,
      clientId: stored.clientId,
      scopes: stored.scopes,
      expiresAt: Math.floor(stored.expiresAt / 1000),
      resource: stored.resource,
    };
  }

  /**
   * Revokes an access or refresh token.
   */
  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest
  ): Promise<void> {
    const { token } = request;

    // Try access tokens first
    const accessEntry = this.accessTokens.get(token);
    if (accessEntry) {
      this.accessTokens.delete(token);
      if (accessEntry.linkedToken) {
        this.refreshTokens.delete(accessEntry.linkedToken);
      }
      return;
    }

    // Then try refresh tokens
    const refreshEntry = this.refreshTokens.get(token);
    if (refreshEntry) {
      this.refreshTokens.delete(token);
      if (refreshEntry.linkedToken) {
        this.accessTokens.delete(refreshEntry.linkedToken);
      }
    }
  }

  /**
   * Validates username/password against the Mealie API.
   */
  async validateMealieCredentials(
    username: string,
    password: string
  ): Promise<boolean> {
    try {
      const params = new URLSearchParams();
      params.set("username", username);
      params.set("password", password);

      const response = await fetch(`${this.mealieUrl}/api/auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Issues a new access token + refresh token pair.
   */
  private issueTokens(
    clientId: string,
    scopes: string[],
    resource?: URL
  ): OAuthTokens {
    const accessToken = randomBytes(32).toString("hex");
    const refreshToken = randomBytes(32).toString("hex");
    const now = Date.now();

    this.accessTokens.set(accessToken, {
      token: accessToken,
      clientId,
      scopes,
      resource,
      expiresAt: now + ACCESS_TOKEN_TTL_MS,
      linkedToken: refreshToken,
    });

    this.refreshTokens.set(refreshToken, {
      token: refreshToken,
      clientId,
      scopes,
      resource,
      expiresAt: now + REFRESH_TOKEN_TTL_MS,
      linkedToken: accessToken,
    });

    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
      scope: scopes.join(" "),
      refresh_token: refreshToken,
    };
  }
}
