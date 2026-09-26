// Shape of countries.json (written by scripts/countries.ts).

export interface CountryRegion {
  /** Region name from scripts/regions.ts. */
  region: string;
  /** Share of the region's land area that belongs to the country (0-1). */
  share: number;
}

export interface Country {
  /** Country name from Natural Earth. */
  name: string;
  regions: CountryRegion[];
}

/** ISO 3166-1 alpha-2 code -> country, sorted by code. */
export type Countries = Record<string, Country>;
