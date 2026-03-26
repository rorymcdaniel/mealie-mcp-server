/**
 * Generates the HTML login page for the OAuth authorization flow.
 * Users authenticate with their Mealie credentials.
 */

interface LoginPageParams {
  /** OAuth client_id */
  clientId: string;
  /** OAuth redirect_uri */
  redirectUri: string;
  /** PKCE code_challenge */
  codeChallenge: string;
  /** OAuth state parameter */
  state?: string;
  /** Requested scopes */
  scopes: string[];
  /** Resource indicator (RFC 8707) */
  resource?: string;
  /** Error message to display */
  error?: string;
}

export function renderLoginPage(params: LoginPageParams): string {
  const errorHtml = params.error
    ? `<div class="error">${escapeHtml(params.error)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sign in — Mealie MCP</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f5f5f5;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 1rem;
    }
    .card {
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      padding: 2rem;
      width: 100%;
      max-width: 400px;
    }
    h1 {
      font-size: 1.25rem;
      text-align: center;
      margin-bottom: 0.5rem;
      color: #333;
    }
    .subtitle {
      text-align: center;
      color: #666;
      font-size: 0.875rem;
      margin-bottom: 1.5rem;
    }
    label {
      display: block;
      font-size: 0.875rem;
      font-weight: 500;
      color: #333;
      margin-bottom: 0.25rem;
    }
    input[type="text"], input[type="password"], input[type="email"] {
      width: 100%;
      padding: 0.625rem 0.75rem;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 1rem;
      margin-bottom: 1rem;
    }
    input:focus {
      outline: none;
      border-color: #003559;
      box-shadow: 0 0 0 2px rgba(0,53,89,0.15);
    }
    button {
      width: 100%;
      padding: 0.75rem;
      background: #003559;
      color: #fff;
      border: none;
      border-radius: 4px;
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
    }
    button:hover { background: #004a7c; }
    .error {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #991b1b;
      padding: 0.75rem;
      border-radius: 4px;
      font-size: 0.875rem;
      margin-bottom: 1rem;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>Mealie MCP Server</h1>
    <p class="subtitle">Sign in with your Mealie account</p>
    ${errorHtml}
    <form method="POST" action="/authorize">
      <input type="hidden" name="client_id" value="${escapeAttr(params.clientId)}">
      <input type="hidden" name="redirect_uri" value="${escapeAttr(params.redirectUri)}">
      <input type="hidden" name="code_challenge" value="${escapeAttr(params.codeChallenge)}">
      <input type="hidden" name="code_challenge_method" value="S256">
      <input type="hidden" name="response_type" value="code">
      ${params.state ? `<input type="hidden" name="state" value="${escapeAttr(params.state)}">` : ""}
      ${params.scopes.length ? `<input type="hidden" name="scope" value="${escapeAttr(params.scopes.join(" "))}">` : ""}
      ${params.resource ? `<input type="hidden" name="resource" value="${escapeAttr(params.resource)}">` : ""}
      <label for="username">Email or Username</label>
      <input type="text" id="username" name="username" required autocomplete="username" autofocus>
      <label for="password">Password</label>
      <input type="password" id="password" name="password" required autocomplete="current-password">
      <button type="submit">Sign In</button>
    </form>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
