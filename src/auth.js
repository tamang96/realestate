// Supplies bearer tokens: either a static token or OAuth2 client credentials,
// cached until shortly before expiry.
export function createTokenProvider(config, fetchImpl = fetch) {
  if (config.accessToken) {
    return { getToken: async () => config.accessToken, invalidate() {} };
  }

  const { tokenUrl, clientId, clientSecret, scope } = config.oauth;
  let cached = null;

  return {
    async getToken() {
      if (cached && Date.now() < cached.expiresAt) return cached.token;

      const body = new URLSearchParams({ grant_type: 'client_credentials' });
      if (scope) body.set('scope', scope);

      const res = await fetchImpl(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
        },
        body,
      });
      if (!res.ok) {
        throw new Error(`Token request failed: ${res.status} ${await res.text()}`);
      }

      const json = await res.json();
      const ttlSeconds = Number(json.expires_in) || 3600;
      cached = { token: json.access_token, expiresAt: Date.now() + (ttlSeconds - 60) * 1000 };
      return cached.token;
    },
    invalidate() {
      cached = null;
    },
  };
}
