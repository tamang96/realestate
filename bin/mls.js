#!/usr/bin/env node
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { loadConfig } from '../src/config.js';
import { createResoClient } from '../src/resoClient.js';
import { createListingService } from '../src/listings.js';

const USAGE = `Usage: npm run mls -- <command> [options]

Commands:
  test                 Verify credentials and fetch one listing
  search [options]     Search active listings
      --city <name> --zip <code> --min-price <n> --max-price <n>
      --beds <n> --baths <n> --type <PropertyType> --status <StandardStatus>
      --limit <n> (default 25)
  get <ListingKey>     Fetch one listing with its Media
  sync [--full]        Incrementally pull changed listings into data/listings.ndjson`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    city: { type: 'string' },
    zip: { type: 'string' },
    'min-price': { type: 'string' },
    'max-price': { type: 'string' },
    beds: { type: 'string' },
    baths: { type: 'string' },
    type: { type: 'string' },
    status: { type: 'string' },
    limit: { type: 'string' },
    full: { type: 'boolean' },
  },
});

const [command, arg] = positionals;
if (!command) {
  console.log(USAGE);
  process.exit(0);
}

const config = loadConfig();
const client = createResoClient(config);
const listings = createListingService(client, config);

const num = (v) => (v == null ? undefined : Number(v));

switch (command) {
  case 'test': {
    const page = await client.query(config.propertyResource, { top: 1, count: true });
    const total = page['@odata.count'];
    console.log(`Connected to ${config.baseUrl}`);
    if (total != null) console.log(`${config.propertyResource} records available: ${total}`);
    console.log(page.value?.[0] ? `Sample ListingKey: ${page.value[0].ListingKey}` : 'No records returned.');
    break;
  }
  case 'search': {
    const results = await listings.search(
      {
        city: values.city,
        postalCode: values.zip,
        minPrice: num(values['min-price']),
        maxPrice: num(values['max-price']),
        minBeds: num(values.beds),
        minBaths: num(values.baths),
        propertyType: values.type,
        ...(values.status && { status: values.status }),
      },
      { limit: num(values.limit) ?? 25 },
    );
    console.table(
      results.map((l) => ({
        ListingId: l.ListingId,
        Status: l.StandardStatus,
        Price: l.ListPrice,
        Address: l.UnparsedAddress,
        City: l.City,
        Beds: l.BedroomsTotal,
        Baths: l.BathroomsTotalInteger,
        SqFt: l.LivingArea,
      })),
    );
    break;
  }
  case 'get': {
    if (!arg) throw new Error('Usage: get <ListingKey>');
    console.log(JSON.stringify(await listings.get(arg), null, 2));
    break;
  }
  case 'sync': {
    await mkdir('data', { recursive: true });
    const statePath = 'data/sync-state.json';
    const outPath = 'data/listings.ndjson';
    let since = null;
    if (!values.full) {
      since = await readFile(statePath, 'utf8').then((s) => JSON.parse(s).lastModified, () => null);
    }
    if (values.full) await writeFile(outPath, '');

    let count = 0;
    let lastModified = since;
    for await (const record of listings.sync({ since })) {
      await appendFile(outPath, JSON.stringify(record) + '\n');
      lastModified = record.ModificationTimestamp || lastModified;
      if (++count % 1000 === 0) {
        await writeFile(statePath, JSON.stringify({ lastModified }));
        console.log(`…${count} records`);
      }
    }
    await writeFile(statePath, JSON.stringify({ lastModified }));
    console.log(`Synced ${count} records${since ? ` modified since ${since}` : ''}. Checkpoint: ${lastModified}`);
    break;
  }
  default:
    console.log(USAGE);
    process.exit(1);
}
