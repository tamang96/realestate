import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { buildQuery, createResoClient, odataString } from '../src/resoClient.js';
import { buildListingFilter, createListingService } from '../src/listings.js';

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

const oauthEnv = {
  RESO_BASE_URL: 'https://api.example.com/odata/',
  RESO_TOKEN_URL: 'https://auth.example.com/token',
  RESO_CLIENT_ID: 'id',
  RESO_CLIENT_SECRET: 'secret',
};

test('loadConfig requires base URL and credentials', () => {
  assert.throws(() => loadConfig({}), /RESO_BASE_URL/);
  assert.throws(() => loadConfig({ RESO_BASE_URL: 'https://x' }), /No credentials/);
  assert.equal(loadConfig(oauthEnv).baseUrl, 'https://api.example.com/odata');
});

test('odataString escapes quotes and buildQuery encodes options', () => {
  assert.equal(odataString("O'Fallon"), "'O''Fallon'");
  assert.equal(buildQuery({ select: ['A', 'B'], top: 5 }), '$select=A%2CB&$top=5');
});

test('buildListingFilter combines criteria', () => {
  assert.equal(
    buildListingFilter({ status: 'Active', city: 'Dallas', minPrice: 300000, minBeds: 3 }),
    "StandardStatus eq 'Active' and City eq 'Dallas' and ListPrice ge 300000 and BedroomsTotal ge 3",
  );
});

test('client fetches OAuth token once, follows nextLink, retries on 429', async () => {
  const calls = [];
  let throttled = false;
  const fetchImpl = async (url, init) => {
    calls.push(url);
    if (url === oauthEnv.RESO_TOKEN_URL) {
      assert.match(init.headers.Authorization, /^Basic /);
      return jsonResponse({ access_token: 'tok', expires_in: 3600 });
    }
    assert.equal(init.headers.Authorization, 'Bearer tok');
    if (url.includes('page2')) {
      if (!throttled) {
        throttled = true;
        return jsonResponse({}, 429, { 'retry-after': '1' });
      }
      return jsonResponse({ value: [{ ListingKey: '3' }] });
    }
    return jsonResponse({ value: [{ ListingKey: '1' }, { ListingKey: '2' }], '@odata.nextLink': 'https://api.example.com/odata/Property?page2' });
  };

  const config = loadConfig(oauthEnv);
  const client = createResoClient(config, { fetchImpl, sleep: async () => {} });
  const service = createListingService(client, config);

  const keys = [];
  for await (const r of service.sync()) keys.push(r.ListingKey);

  assert.deepEqual(keys, ['1', '2', '3']);
  assert.equal(calls.filter((u) => u === oauthEnv.RESO_TOKEN_URL).length, 1);
  assert.match(calls[1], /\$orderby=ModificationTimestamp%20asc/);
});

test('search respects limit across pages', async () => {
  const fetchImpl = async () =>
    jsonResponse({ value: [{ ListingKey: 'a' }, { ListingKey: 'b' }], '@odata.nextLink': 'https://api.example.com/odata/next' });
  const config = loadConfig({ RESO_BASE_URL: 'https://api.example.com/odata', RESO_ACCESS_TOKEN: 'static' });
  const service = createListingService(createResoClient(config, { fetchImpl }), config);
  const results = await service.search({ city: 'Plano' }, { limit: 3 });
  assert.equal(results.length, 3);
});
