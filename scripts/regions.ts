// Copy of REGIONS from geo-battle's server/locations.js
// (https://github.com/MarianBecher/geo-battler), the boxes in which the game
// looks for random Street View locations. The game keeps the region name in
// a comment; here it is part of the tuple (in English).
//
// Deliberately copied instead of imported: this project must build without
// the game repository. When the game changes its boxes, update them here and
// run `npm run countries` again.

/**
 * [minLat, minLng, maxLat, maxLng, weight, area, name]. The weight is the
 * relative chance that the game picks the box; the area assigns it to a map
 * pack in the game: 'eu' Europe, 'na' North and Central America, 'sa' South
 * America, 'as' Asia, 'af' Africa, 'oc' Oceania, and 'de', 'at', 'ch' on
 * their own.
 */
export type Region = readonly [minLat: number, minLng: number, maxLat: number, maxLng: number, weight: number, area: string, name: string];

export const REGIONS: readonly Region[] = [
  // --- Europe ---
  [47.3, 5.9, 54.9, 15.0, 8, 'de', 'Germany'],
  [42.5, -4.5, 51.0, 7.8, 8, 'eu', 'France'],
  [50.0, -6.0, 58.6, 1.7, 7, 'eu', 'UK'],
  [51.5, -10.4, 55.3, -6.0, 3, 'eu', 'Ireland'],
  [36.1, -9.2, 43.7, 3.3, 7, 'eu', 'Spain'],
  [37.0, -9.4, 42.0, -6.2, 3, 'eu', 'Portugal'],
  [37.0, 7.0, 46.5, 18.4, 7, 'eu', 'Italy'],
  [51.0, 3.4, 53.4, 7.1, 4, 'eu', 'Netherlands'],
  [49.5, 2.6, 51.5, 6.3, 3, 'eu', 'Belgium'],
  [45.9, 6.0, 47.7, 10.4, 3, 'ch', 'Switzerland'],
  [46.4, 9.6, 49.0, 17.1, 3, 'at', 'Austria'],
  [49.1, 14.2, 54.8, 23.8, 6, 'eu', 'Poland'],
  [48.6, 12.1, 51.0, 18.8, 3, 'eu', 'Czechia'],
  [55.4, 11.2, 68.0, 23.5, 5, 'eu', 'Sweden'],
  [58.0, 5.0, 70.5, 29.0, 5, 'eu', 'Norway'],
  [60.0, 21.5, 68.5, 30.0, 4, 'eu', 'Finland'],
  [54.6, 8.1, 57.7, 12.6, 3, 'eu', 'Denmark'],
  [43.7, 20.3, 48.2, 29.6, 4, 'eu', 'Romania'],
  [45.8, 16.2, 48.5, 22.8, 2, 'eu', 'Hungary'],
  [35.0, 20.2, 41.7, 26.5, 4, 'eu', 'Greece'],
  [53.9, 21.0, 59.6, 28.2, 3, 'eu', 'Baltics'],
  [44.4, 22.2, 52.3, 40.0, 3, 'eu', 'Ukraine'],
  [36.0, 26.0, 42.0, 44.5, 5, 'eu', 'Turkey'],
  [41.0, 13.4, 49.0, 23.0, 4, 'eu', 'Balkans / Slovakia'],
  [63.3, -24.6, 66.5, -13.5, 2, 'eu', 'Iceland'],

  // --- North and Central America ---
  [25.0, -124.6, 49.0, -67.0, 18, 'na', 'USA'],
  [55.0, -160.0, 65.0, -135.0, 1, 'na', 'Alaska'],
  [19.0, -159.8, 22.2, -155.0, 1, 'na', 'Hawaii'],
  [43.0, -127.0, 55.0, -55.0, 8, 'na', 'Canada (south)'],
  [15.0, -117.0, 32.5, -88.0, 6, 'na', 'Mexico'],
  [7.2, -92.3, 17.8, -77.2, 2, 'na', 'Central America'],

  // --- South America ---
  [-33.5, -57.5, -2.0, -39.0, 9, 'sa', 'Brazil (east)'],
  [-10.0, -70.0, 0.5, -48.0, 2, 'sa', 'Brazil (north)'],
  [-52.0, -71.5, -23.0, -58.0, 6, 'sa', 'Argentina'],
  [-42.0, -74.0, -18.0, -69.5, 4, 'sa', 'Chile'],
  [-17.0, -79.0, -4.0, -69.0, 3, 'sa', 'Peru'],
  [1.5, -77.5, 11.0, -72.5, 3, 'sa', 'Colombia'],
  [-21.0, -80.0, 1.0, -58.0, 2, 'sa', 'Ecuador / Bolivia'],
  [-34.9, -58.4, -30.1, -53.2, 2, 'sa', 'Uruguay'],

  // --- Asia ---
  [31.0, 130.0, 45.4, 145.8, 9, 'as', 'Japan'],
  [34.0, 126.1, 38.5, 129.5, 5, 'as', 'South Korea'],
  [21.9, 120.0, 25.3, 122.0, 3, 'as', 'Taiwan'],
  [5.7, 97.4, 20.4, 105.6, 5, 'as', 'Thailand'],
  [1.2, 99.6, 6.7, 119.3, 3, 'as', 'Malaysia / Singapore'],
  [-10.0, 95.2, 5.9, 141.0, 5, 'as', 'Indonesia'],
  [5.0, 117.2, 18.6, 126.6, 4, 'as', 'Philippines'],
  [8.1, 68.7, 35.0, 97.4, 8, 'as', 'India'],
  [5.9, 79.7, 9.8, 81.9, 2, 'as', 'Sri Lanka'],
  [8.6, 102.1, 23.3, 109.5, 3, 'as', 'Vietnam / Cambodia / Laos'],
  [21.5, 88.2, 26.5, 92.5, 2, 'as', 'Bangladesh'],
  [26.4, 80.1, 29.3, 91.6, 1, 'as', 'Nepal / Bhutan'],
  [29.5, 34.2, 33.3, 39.3, 2, 'as', 'Israel / Jordan'],
  [22.6, 51.0, 26.4, 56.4, 2, 'as', 'UAE / Qatar'],
  [40.0, 51.0, 55.0, 80.0, 2, 'as', 'Kazakhstan / Kyrgyzstan'],
  [43.0, 88.0, 50.0, 116.0, 1, 'as', 'Mongolia'],
  [44.0, 30.0, 60.0, 60.0, 4, 'as', 'Russia (west)'],
  [50.0, 60.0, 62.0, 135.0, 2, 'as', 'Russia (east)'],

  // --- Africa ---
  [-34.8, 16.5, -22.1, 32.9, 6, 'af', 'South Africa'],
  [-11.5, 29.4, 4.6, 41.8, 3, 'af', 'Kenya / Tanzania / Uganda'],
  [4.3, -17.5, 13.9, 14.5, 3, 'af', 'West Africa'],
  [-29.0, 11.7, -17.8, 29.4, 3, 'af', 'Namibia / Botswana'],
  [28.0, -13.0, 35.9, -1.0, 2, 'af', 'Morocco'],
  [30.3, 7.5, 37.3, 11.5, 1, 'af', 'Tunisia'],
  [22.0, 25.0, 31.6, 34.0, 2, 'af', 'Egypt'],

  // --- Oceania ---
  [-43.6, 113.3, -11.0, 153.6, 10, 'oc', 'Australia'],
  [-46.9, 166.4, -34.4, 178.6, 5, 'oc', 'New Zealand'],
];
