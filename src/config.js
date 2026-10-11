export function loadConfig(env = process.env) {
  const baseUrl = (env.RESO_BASE_URL || '').replace(/\/+$/, '');
  if (!baseUrl) {
    throw new Error('RESO_BASE_URL is not set. Copy .env.example to .env and fill in your NTREIS feed details.');
  }

  const accessToken = env.RESO_ACCESS_TOKEN || '';
  const oauth = {
    tokenUrl: env.RESO_TOKEN_URL || '',
    clientId: env.RESO_CLIENT_ID || '',
    clientSecret: env.RESO_CLIENT_SECRET || '',
    scope: env.RESO_SCOPE || '',
  };

  if (!accessToken && !(oauth.tokenUrl && oauth.clientId && oauth.clientSecret)) {
    throw new Error(
      'No credentials configured. Set RESO_ACCESS_TOKEN, or RESO_TOKEN_URL + RESO_CLIENT_ID + RESO_CLIENT_SECRET.',
    );
  }

  return {
    baseUrl,
    accessToken,
    oauth,
    propertyResource: env.RESO_PROPERTY_RESOURCE || 'Property',
  };
}
