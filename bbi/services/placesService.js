/**
 * BBI — Google Places Service
 * Search and import businesses from Google Places API.
 * Requires GOOGLE_PLACES_API_KEY in .env.
 */

const https = require('https');
const db = require('../config/db');
const { generateSlug } = require('../middleware/validation');

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;

/**
 * Check if Google Places API is configured.
 */
function isConfigured() {
  return !!API_KEY;
}

/**
 * Search Google Places API for businesses.
 */
function searchPlaces(query, location = 'India') {
  return new Promise((resolve, reject) => {
    if (!API_KEY) {
      return resolve({ results: [], error: 'Google Places API key not configured. Add GOOGLE_PLACES_API_KEY to .env' });
    }

    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query + ' ' + location)}&key=${API_KEY}`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.status !== 'OK' && parsed.status !== 'ZERO_RESULTS') {
            return resolve({ results: [], error: parsed.error_message || parsed.status });
          }
          const results = (parsed.results || []).map(r => ({
            place_id: r.place_id,
            name: r.name,
            address: r.formatted_address,
            rating: r.rating || 0,
            review_count: r.user_ratings_total || 0,
            types: r.types || [],
          }));
          resolve({ results, error: null });
        } catch (e) {
          resolve({ results: [], error: e.message });
        }
      });
    }).on('error', e => resolve({ results: [], error: e.message }));
  });
}

/**
 * Get place details from Google Places API.
 */
function getPlaceDetails(placeId) {
  return new Promise((resolve, reject) => {
    if (!API_KEY) return resolve(null);

    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,formatted_phone_number,website,rating,user_ratings_total&key=${API_KEY}`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.status !== 'OK') return resolve(null);
          const r = parsed.result;
          resolve({
            place_id: placeId,
            name: r.name,
            address: r.formatted_address,
            phone: r.formatted_phone_number || '',
            website: r.website || '',
            rating: r.rating || 0,
            review_count: r.user_ratings_total || 0,
          });
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

/**
 * Import a place from Google to the cache.
 */
async function importPlace(placeId) {
  // Check if already cached
  const existing = db.prepare(`SELECT * FROM google_places_cache WHERE place_id = ?`).get(placeId);
  if (existing) return existing;

  const details = await getPlaceDetails(placeId);
  if (!details) return null;

  const result = db.prepare(`
    INSERT INTO google_places_cache (place_id, name, address, phone, website, rating, review_count, raw_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    details.place_id, details.name, details.address, details.phone,
    details.website, details.rating, details.review_count,
    JSON.stringify(details)
  );

  return { id: result.lastInsertRowid, ...details };
}

/**
 * Approve a cached place and create a business from it.
 */
function approveImport(cacheId, cityId, categoryId) {
  const cached = db.prepare(`SELECT * FROM google_places_cache WHERE id = ?`).get(cacheId);
  if (!cached) throw new Error('Cached place not found');

  // Check if already imported
  if (cached.business_id) throw new Error('This place has already been imported');

  const slug = generateSlug(cached.name);

  const transaction = db.transaction(() => {
    // Create business
    const bizResult = db.prepare(`
      INSERT INTO businesses (name, slug, category_id, city_id, address, phone, website,
        google_rating, google_review_count, place_id, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      cached.name, slug, categoryId, cityId,
      cached.address, cached.phone, cached.website,
      cached.rating, cached.review_count, cached.place_id
    );

    // Create initial ranking scores
    db.prepare(`
      INSERT INTO ranking_scores (business_id, final_score, auto_score) VALUES (?, 0, 0)
    `).run(bizResult.lastInsertRowid);

    // Link cache to business
    db.prepare(`UPDATE google_places_cache SET business_id = ? WHERE id = ?`)
      .run(bizResult.lastInsertRowid, cacheId);

    return bizResult.lastInsertRowid;
  });

  return transaction();
}

/**
 * Get cached places (for admin review).
 */
function getCachedPlaces(options = {}) {
  const { imported = null, limit = 50 } = options;
  let sql = `SELECT * FROM google_places_cache`;
  const params = [];

  if (imported === true) {
    sql += ` WHERE business_id IS NOT NULL`;
  } else if (imported === false) {
    sql += ` WHERE business_id IS NULL`;
  }

  sql += ` ORDER BY imported_at DESC LIMIT ?`;
  params.push(limit);

  return db.prepare(sql).all(...params);
}

module.exports = {
  isConfigured,
  searchPlaces,
  getPlaceDetails,
  importPlace,
  approveImport,
  getCachedPlaces,
};
