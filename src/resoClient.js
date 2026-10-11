import { createTokenProvider } from './auth.js';

const MAX_RETRIES = 4;

export function buildQuery({ filter, select, orderby, top, skip, expand, count } = {}) {
  const params = [];
  if (filter) params.push(['$filter', filter]);
  if (select) params.push(['$select', Array.isArray(select) ? select.join(',') : select]);
  if (orderby) params.push(['$orderby', orderby]);
  if (expand) params.push(['$expand', expand]);
  if (top != null) params.push(['$top', String(top)]);
  if (skip != null) params.push(['$skip', String(skip)]);
  if (count) params.push(['$count', 'true']);
  return params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}

// Escapes a string for use inside an OData single-quoted literal.
export function odataString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function createResoClient(config, { fetchImpl = fetch, sleep = defaultSleep } = {}) {
  const tokens = createTokenProvider(config, fetchImpl);

  async function request(url, attempt = 0) {
    const token = await tokens.getToken();
    const res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });

    if (res.status === 401 && attempt === 0 && !config.accessToken) {
      tokens.invalidate();
      return request(url, attempt + 1);
    }
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep(retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000);
      return request(url, attempt + 1);
    }
    if (!res.ok) {
      throw new Error(`RESO request failed: ${res.status} ${res.statusText} for ${url}\n${await res.text()}`);
    }
    return res.json();
  }

  function resourceUrl(resource, options) {
    const qs = buildQuery(options);
    return `${config.baseUrl}/${resource}${qs ? `?${qs}` : ''}`;
  }

  return {
    request,

    async query(resource, options) {
      return request(resourceUrl(resource, options));
    },

    // Follows @odata.nextLink until exhausted (or maxRecords reached), yielding each record.
    async *paginate(resource, options = {}, { maxRecords = Infinity } = {}) {
      let url = resourceUrl(resource, options);
      let yielded = 0;
      while (url) {
        const page = await request(url);
        for (const record of page.value || []) {
          yield record;
          if (++yielded >= maxRecords) return;
        }
        url = page['@odata.nextLink'] || null;
      }
    },

    async metadata() {
      const token = await tokens.getToken();
      const res = await fetchImpl(`${config.baseUrl}/$metadata`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/xml' },
      });
      if (!res.ok) throw new Error(`$metadata request failed: ${res.status} ${res.statusText}`);
      return res.text();
    },
  };
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
