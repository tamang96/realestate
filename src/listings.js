import { odataString } from './resoClient.js';

// Common RESO Data Dictionary fields for a listing summary.
export const LISTING_FIELDS = [
  'ListingKey',
  'ListingId',
  'StandardStatus',
  'ListPrice',
  'UnparsedAddress',
  'City',
  'StateOrProvince',
  'PostalCode',
  'BedroomsTotal',
  'BathroomsTotalInteger',
  'LivingArea',
  'PropertyType',
  'ListOfficeName',
  'ModificationTimestamp',
];

export function buildListingFilter({ status, city, postalCode, minPrice, maxPrice, minBeds, minBaths, propertyType, modifiedSince } = {}) {
  const clauses = [];
  if (status) clauses.push(`StandardStatus eq ${odataString(status)}`);
  if (city) clauses.push(`City eq ${odataString(city)}`);
  if (postalCode) clauses.push(`PostalCode eq ${odataString(postalCode)}`);
  if (minPrice != null) clauses.push(`ListPrice ge ${Number(minPrice)}`);
  if (maxPrice != null) clauses.push(`ListPrice le ${Number(maxPrice)}`);
  if (minBeds != null) clauses.push(`BedroomsTotal ge ${Number(minBeds)}`);
  if (minBaths != null) clauses.push(`BathroomsTotalInteger ge ${Number(minBaths)}`);
  if (propertyType) clauses.push(`PropertyType eq ${odataString(propertyType)}`);
  if (modifiedSince) clauses.push(`ModificationTimestamp gt ${new Date(modifiedSince).toISOString()}`);
  return clauses.join(' and ');
}

export function createListingService(client, config) {
  const resource = config.propertyResource;

  return {
    async search(criteria = {}, { limit = 25, select = LISTING_FIELDS } = {}) {
      const records = [];
      const options = {
        filter: buildListingFilter({ status: 'Active', ...criteria }) || undefined,
        select,
        orderby: 'ModificationTimestamp desc',
        top: Math.min(limit, 200),
      };
      for await (const r of client.paginate(resource, options, { maxRecords: limit })) records.push(r);
      return records;
    },

    async get(listingKey) {
      const page = await client.query(resource, {
        filter: `ListingKey eq ${odataString(listingKey)}`,
        expand: 'Media',
        top: 1,
      });
      return page.value?.[0] ?? null;
    },

    // Incremental replication: yields every listing modified after `since`,
    // oldest first, so callers can checkpoint on the last ModificationTimestamp.
    sync({ since, pageSize = 200, select } = {}) {
      return client.paginate(resource, {
        filter: since ? buildListingFilter({ modifiedSince: since }) : undefined,
        select,
        orderby: 'ModificationTimestamp asc',
        top: pageSize,
      });
    },
  };
}
