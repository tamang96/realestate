# realestate

Connects to **NTREIS** (North Texas Real Estate Information Systems) MLS data over the
[RESO Web API](https://www.reso.org/reso-web-api/) (OData v4). No dependencies; Node 20+.

## 1. Get feed credentials from NTREIS

You need an approved NTREIS data license (IDX, VOW, or broker back-office) before any
code can connect. When it is approved, NTREIS (or the vendor that distributes its feed)
gives you:

- the Web API base URL
- either a static **access token**, or OAuth2 **client ID / client secret** plus a token URL

## 2. Configure

```sh
cp .env.example .env   # then fill in the values; .env is git-ignored
```

In a Claude Code cloud session, add the same variables as environment secrets instead.

## 3. Use

```sh
npm run mls -- test                                  # verify the connection
npm run mls -- search --city Frisco --beds 4 --max-price 750000
npm run mls -- get <ListingKey>                      # one listing + photos
npm run mls -- sync                                  # incremental pull to data/listings.ndjson
npm run mls -- sync --full                           # full re-pull
npm test
```

`sync` uses `ModificationTimestamp` as a checkpoint (`data/sync-state.json`), so re-running
it only fetches listings that changed. The client handles OAuth token caching,
`@odata.nextLink` paging, and 429/5xx backoff.

Use of NTREIS data is governed by your license agreement and IDX rules (display,
attribution, refresh frequency). Check them before publishing listings.
