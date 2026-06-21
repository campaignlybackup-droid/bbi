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

    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,reviews&key=${API_KEY}`;

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
            reviews: r.reviews || [],
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
 * Immediately triggers ranking recalculation and page rebuild.
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

    // Calculate proper ranking score components
    const { calculateScoreComponents } = require('./rankingService');
    const components = calculateScoreComponents({
      website: cached.website || '',
      verified: 0,
      description: '',
      phone: cached.phone || '',
      address: cached.address || '',
      google_rating: cached.rating || 0,
      google_review_count: cached.review_count || 0,
    });

    db.prepare(`
      INSERT INTO ranking_scores (business_id, review_score, volume_score, website_score,
        completeness_score, verified_score, editorial_score, auto_score, manual_boost, final_score)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, 0, ?)
      ON CONFLICT(business_id) DO UPDATE SET
        review_score=excluded.review_score, volume_score=excluded.volume_score,
        website_score=excluded.website_score, completeness_score=excluded.completeness_score,
        verified_score=excluded.verified_score, auto_score=excluded.auto_score,
        final_score=excluded.final_score, last_calculated=CURRENT_TIMESTAMP
    `).run(
      bizResult.lastInsertRowid,
      components.review_score, components.volume_score, components.website_score,
      components.completeness_score, components.verified_score,
      components.auto_score, components.auto_score
    );

    // Link cache to business
    db.prepare(`UPDATE google_places_cache SET business_id = ? WHERE id = ?`)
      .run(bizResult.lastInsertRowid, cacheId);

    return bizResult.lastInsertRowid;
  });

  const bizId = transaction();

  // Immediately recalculate rankings and rebuild pages
  try {
    const pageRebuildService = require('./pageRebuildService');
    pageRebuildService.rebuildForBusinesses([Number(bizId)]);
  } catch (rebuildErr) {
    console.error('Page rebuild after place approval failed:', rebuildErr.message);
  }

  // Flush public page cache
  try {
    const { publicCache } = require('../routes/public');
    if (publicCache) publicCache.flushAll();
  } catch (e) { /* cache flush is best-effort */ }

  return bizId;
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

/**
 * Discover missing businesses for a specific city and category.
 */
async function discoverMissingBusinesses(cityId, categoryId) {
  const city = db.prepare('SELECT * FROM cities WHERE id = ? AND active = 1').get(cityId);
  const category = db.prepare('SELECT * FROM categories WHERE id = ? AND active = 1').get(categoryId);
  
  if (!city || !category) throw new Error('Active city or category not found');
  
  const response = await searchPlaces(category.name, city.name);
  if (response.error || !response.results) return response;
  
  const existingBusinesses = db.prepare('SELECT name, place_id FROM businesses WHERE city_id = ? AND category_id = ? AND active = 1').all(cityId, categoryId);
  
  const existingNames = existingBusinesses.map(b => b.name.toLowerCase());
  const existingPlaceIds = existingBusinesses.map(b => b.place_id).filter(Boolean);
  
  const results = response.results.map(place => {
    let exists = false;
    if (place.place_id && existingPlaceIds.includes(place.place_id)) {
      exists = true;
    } else if (existingNames.includes(place.name.toLowerCase())) {
      exists = true;
    }
    return { ...place, exists };
  });
  
  return { results, city, category, error: null };
}

/**
 * Import a place directly and trigger full end-to-end automation.
 * (Create business -> Score -> FTS -> AI Content -> Rebuild Page -> Ping Google)
 */
async function importAndAutomatePlace(placeId, cityId, categoryId, adminId) {
  // 1. Get full details
  const details = await getPlaceDetails(placeId);
  if (!details) throw new Error('Could not fetch place details from Google');
  
  // 2. Check if already exists
  const existing = db.prepare('SELECT id FROM businesses WHERE place_id = ?').get(placeId);
  if (existing) return { success: false, reason: 'Already imported', businessId: existing.id };

  // 3. Find City & Category
  const city = db.prepare('SELECT * FROM cities WHERE id = ?').get(cityId);
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(categoryId);
  
  const slug = require('../middleware/validation').generateSlug(details.name + ' ' + city.name);
  
  const transaction = db.transaction(() => {
    const bizResult = db.prepare(`
      INSERT INTO businesses (name, slug, category_id, city_id, address, phone, website,
        google_rating, google_review_count, place_id, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      details.name, slug, categoryId, cityId,
      details.address, details.phone, details.website,
      details.rating, details.review_count, details.place_id
    );
    
    const bizId = bizResult.lastInsertRowid;
    
    // Calculate BBI Score
    const { calculateBBIScore } = require('./bbiScoringService');
    const bbiScore = calculateBBIScore({
      google_rating: details.rating, google_review_count: details.review_count,
      website: details.website, phone: details.phone, address: details.address, verified: 0
    });
    db.prepare('UPDATE businesses SET bbi_score = ? WHERE id = ?').run(bbiScore, bizId);
    
    // Calculate Ranking Components
    const { calculateScoreComponents } = require('./rankingService');
    const components = calculateScoreComponents({
      website: details.website, verified: 0, description: '', phone: details.phone, address: details.address,
      google_rating: details.rating, google_review_count: details.review_count, social_url: ''
    });
    
    db.prepare(`
      INSERT INTO ranking_scores (business_id, review_score, volume_score, website_score,
        completeness_score, verified_score, editorial_score, auto_score, manual_boost, final_score)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, 0, ?)
    `).run(
      bizId, components.review_score, components.volume_score, components.website_score,
      components.completeness_score, components.verified_score,
      components.auto_score, components.auto_score
    );
    
    return bizId;
  });
  
  const bizId = transaction();
  
  // 4. Update Search Index
  require('./searchService').updateFtsForBusiness(bizId);
  
  // 5. Enqueue AI Content
  const jobQueue = require('./ai/jobQueue');
  const bInfo = { id: bizId, name: details.name, slug: slug, city_name: city.name, cat_name: cat.name, verified: 0 };
  
  const settingsService = require('./settingsService');
  if (settingsService.getSetting('auto_ai_import', 'true') === 'true') {
    jobQueue.enqueue('listing_generate', bInfo);
    jobQueue.enqueue('faq_generate', bInfo);
  }
  
  // 6. Recalculate Rankings and Rebuild Combo Page
  const pageRebuildService = require('./pageRebuildService');
  pageRebuildService.rebuildForBusinesses([bizId]);
  
  // 7. Ping Google Indexing
  if (settingsService.getSetting('auto_ping_indexing') === 'true') {
    const googleApiService = require('./googleApiService');
    const bizUrl = `${process.env.BASE_URL || 'https://bharatbusinessindex.com'}/business/${slug}`;
    googleApiService.pingIndexingApi(bizUrl, 'URL_UPDATED').catch(() => {});
  }
  
  // 8. Audit Log
  const auditService = require('./auditService');
  auditService.log('business', bizId, 'import_discovery', { admin_id: adminId, metadata: { place_id: placeId, slug } });
  
  return { success: true, businessId: bizId };
}

/**
 * Sync reviews for a business and generate AI sentiment analysis.
 */
async function syncReviewsAndSentiment(businessId) {
  const business = db.prepare('SELECT * FROM businesses WHERE id = ?').get(businessId);
  if (!business || !business.place_id) throw new Error('Business not found or has no Google Place ID');

  const details = await getPlaceDetails(business.place_id);
  if (!details) throw new Error('Could not fetch details from Google Places');

  const { calculateBBIScore } = require('./bbiScoringService');
  const bbiScore = calculateBBIScore({
    google_rating: details.rating,
    google_review_count: details.review_count,
    website: details.website || business.website,
    phone: details.phone || business.phone,
    address: details.address || business.address,
    verified: business.verified
  });

  let sentiment = business.ai_sentiment;

  if (details.reviews && details.reviews.length > 0) {
    const aiProvider = require('./ai/openaiProvider');
    try {
      const reviewText = details.reviews.map(r => r.text).filter(t => t.length > 10).join(' | ');
      if (reviewText) {
        sentiment = await aiProvider.generateSentiment(reviewText, business.name);
      }
    } catch (e) {
      console.error('Failed to generate sentiment:', e.message);
    }
  }

  db.prepare(`
    UPDATE businesses 
    SET google_rating = ?, google_review_count = ?, bbi_score = ?, ai_sentiment = ?, ai_sentiment_date = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(details.rating, details.review_count, bbiScore, sentiment, businessId);

  return {
    success: true,
    rating: details.rating,
    review_count: details.review_count,
    sentiment
  };
}

module.exports = {
  isConfigured,
  searchPlaces,
  getPlaceDetails,
  importPlace,
  approveImport,
  getCachedPlaces,
  discoverMissingBusinesses,
  importAndAutomatePlace,
  syncReviewsAndSentiment,
};
