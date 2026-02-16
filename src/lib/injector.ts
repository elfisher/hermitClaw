/**
 * Credential injection strategies.
 *
 * Describes how a decrypted secret should be attached to an outbound HTTP request.
 */
export type AuthType = 'bearer' | 'basic' | 'header' | 'queryparam';

export interface InjectionConfig {
  authType: AuthType;
  /**
   * For 'header':    the header name to set (e.g. "X-Api-Key")
   * For 'queryparam': the query param name (e.g. "api_key")
   * For 'bearer' / 'basic': unused
   */
  paramName?: string;
}

export interface PreparedRequest {
  url: string;
  headers: Record<string, string>;
}

/**
 * Injects a decrypted credential into the outbound request URL and headers.
 *
 * @param targetUrl   - The URL the agent wants to call
 * @param secret      - The decrypted plaintext secret from the vault
 * @param config      - How to inject the secret
 * @returns           - Final URL and headers to use for the outbound request
 */
export function injectCredential(
  targetUrl: string,
  secret: string,
  config: InjectionConfig,
): PreparedRequest {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'HermitClaw/1.0',
  };

  let url = targetUrl;

  switch (config.authType) {
    case 'bearer': {
      headers['Authorization'] = `Bearer ${secret}`;
      break;
    }

    case 'basic': {
      // secret should be "username:password"
      const encoded = Buffer.from(secret).toString('base64');
      headers['Authorization'] = `Basic ${encoded}`;
      break;
    }

    case 'header': {
      const name = config.paramName;
      if (!name) throw new Error("authType 'header' requires paramName");
      headers[name] = secret;
      break;
    }

    case 'queryparam': {
      const name = config.paramName;
      if (!name) throw new Error("authType 'queryparam' requires paramName");
      const parsed = new URL(url);
      parsed.searchParams.set(name, secret);
      url = parsed.toString();
      break;
    }

    default: {
      const _exhaustive: never = config.authType;
      throw new Error(`Unknown authType: ${_exhaustive}`);
    }
  }

  return { url, headers };
}
