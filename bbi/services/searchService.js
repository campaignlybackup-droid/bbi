/**
 * BBI — Search Service
 * Full-text search using FTS5, suggestions, trending, analytics.
 * Implements M-02: /search route functionality.
 */

const db = require('../config/db');

/**
 * Search businesses using FTS5 full-text search.
 * Falls back to LIKE queries if FTS5 is unavailable.
 */
function search(query, options = {}) {
  const { limit = 20, offset = 0, city_id, category_id } = options;

  if (!query || query.trim().length === 0) {
    return { results: [], total: 0, query: '' };
  }

  const cleanQuery = query.trim();
  let results;

  try {
    // Try FTS5 first
    let ftsQuery = cleanQuery.split(/\s+/).map(w => `"${w}"*`).join(' ');
    let sql = `
      SELECT b.*, c.name as city_name, c.slug as city_slug, cat.name as cat_name, cat.slug as cat_slug,
             rs.final_score,
             (SELECT rank_position FROM ranking_history WHERE business_id=b.id ORDER BY ranking_date DESC LIMIT 1) as current_rank,
             ( -bm25(businesses_fts) * 3 + (b.verified * 2) + (CASE WHEN (SELECT rank_position FROM ranking_history WHERE business_id=b.id ORDER BY ranking_date DESC LIMIT 1) <= 3 THEN 5 ELSE 0 END) + LENGTH(CAST(b.google_review_count AS TEXT)) ) as search_rank
      FROM businesses_fts fts
      JOIN businesses b ON b.id = fts.rowid
      LEFT JOIN cities c ON c.id = b.city_id
      LEFT JOIN categories cat ON cat.id = b.category_id
      LEFT JOIN ranking_scores rs ON rs.business_id = b.id
      WHERE businesses_fts MATCH ? AND b.active = 1
    `;
    const params = [ftsQuery];

    if (city_id) { sql += ` AND b.city_id = ?`; params.push(city_id); }
    if (category_id) { sql += ` AND b.category_id = ?`; params.push(category_id); }

    sql += ` ORDER BY search_rank DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    results = db.prepare(sql).all(...params);
  } catch (e) {
    // Fallback to LIKE search
    let sql = `
      SELECT b.*, c.name as city_name, c.slug as city_slug, cat.name as cat_name, cat.slug as cat_slug,
             rs.final_score,
             (SELECT rank_position FROM ranking_history WHERE business_id=b.id ORDER BY ranking_date DESC LIMIT 1) as current_rank
      FROM businesses b
      LEFT JOIN cities c ON c.id = b.city_id
      LEFT JOIN categories cat ON cat.id = b.category_id
      LEFT JOIN ranking_scores rs ON rs.business_id = b.id
      WHERE b.active = 1
        AND (b.name LIKE ? OR b.description LIKE ? OR b.tags LIKE ?
             OR c.name LIKE ? OR cat.name LIKE ?)
    `;
    const like = `%${cleanQuery}%`;
    const params = [like, like, like, like, like];

    if (city_id) { sql += ` AND b.city_id = ?`; params.push(city_id); }
    if (category_id) { sql += ` AND b.category_id = ?`; params.push(category_id); }

    sql += ` ORDER BY rs.final_score DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    results = db.prepare(sql).all(...params);
  }

  // Also search categories and cities
  const matchingCategories = db.prepare(`
    SELECT * FROM categories WHERE active=1 AND (name LIKE ? OR slug LIKE ?) LIMIT 5
  `).all(`%${cleanQuery}%`, `%${cleanQuery}%`);

  const matchingCities = db.prepare(`
    SELECT * FROM cities WHERE active=1 AND (name LIKE ? OR slug LIKE ?) LIMIT 5
  `).all(`%${cleanQuery}%`, `%${cleanQuery}%`);

  const matchingCustom = db.prepare(`
    SELECT id, title as name, slug, description FROM custom_ranking_pages WHERE active=1 AND (title LIKE ? OR description LIKE ?) LIMIT 5
  `).all(`%${cleanQuery}%`, `%${cleanQuery}%`);

  return {
    results,
    categories: matchingCategories,
    cities: matchingCities,
    custom: matchingCustom,
    total: results.length,
    query: cleanQuery,
  };
}

/**
 * Get search suggestions for typeahead.
 */
function getSuggestions(partial) {
  if (!partial || partial.trim().length < 2) return [];

  const like = `%${partial.trim()}%`;

  const businesses = db.prepare(`
    SELECT name, slug, 'business' as type FROM businesses
    WHERE active=1 AND name LIKE ? LIMIT 5
  `).all(like);

  const categories = db.prepare(`
    SELECT name, slug, 'category' as type FROM categories
    WHERE active=1 AND name LIKE ? LIMIT 3
  `).all(like);

  const cities = db.prepare(`
    SELECT name, slug, 'city' as type FROM cities
    WHERE active=1 AND name LIKE ? LIMIT 3
  `).all(like);

  const customPages = db.prepare(`
    SELECT title as name, slug, 'custom' as type FROM custom_ranking_pages
    WHERE active=1 AND title LIKE ? LIMIT 3
  `).all(like);

  return [...businesses, ...categories, ...cities, ...customPages];
}

/**
 * Get trending searches.
 */
function getTrending(limit = 10) {
  try {
    return db.prepare(`
      SELECT query, search_count FROM trending_searches
      ORDER BY search_count DESC LIMIT ?
    `).all(limit);
  } catch (e) {
    return [];
  }
}

/**
 * Log a search click for analytics.
 */
function logClick(query, resultId, resultType) {
  try {
    db.prepare(`INSERT INTO search_clicks (query, result_id, result_type) VALUES (?, ?, ?)`)
      .run(query, resultId, resultType);
  } catch (e) {
    // Ignore errors
  }
}

/**
 * Get recent searches.
 */
function getRecentSearches(limit = 5) {
  try {
    return db.prepare(`SELECT DISTINCT query FROM search_log ORDER BY created_at DESC LIMIT ?`).all(limit);
  } catch (e) {
    return [];
  }
}

/**
 * Log a search query for analytics.
 */
function logSearch(query, resultsCount, ipAddress) {
  try {
    db.prepare(`INSERT INTO search_log (query, results_count, ip_address) VALUES (?, ?, ?)`)
      .run(query, resultsCount, ipAddress);

    // Update trending
    db.prepare(`
      INSERT INTO trending_searches (query, search_count, last_searched)
      VALUES (?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(query) DO UPDATE SET
        search_count = search_count + 1,
        last_searched = CURRENT_TIMESTAMP
    `).run(query.toLowerCase().trim());
  } catch (e) {
    // Don't break search if analytics fails
  }
}

/**
 * Rebuild FTS5 index (call after adding/editing businesses).
 */
function rebuildFtsIndex() {
  try {
    db.exec(`DELETE FROM businesses_fts`);
    const allBiz = db.prepare(`SELECT id, name, description, tags FROM businesses WHERE active=1`).all();
    const insertFts = db.prepare(`INSERT INTO businesses_fts(rowid, name, description, tags) VALUES (?, ?, ?, ?)`);
    allBiz.forEach(b => insertFts.run(b.id, b.name, b.description || '', b.tags || ''));
    return allBiz.length;
  } catch (e) {
    return 0;
  }
}

/**
 * Update FTS for a single business.
 */
function updateFtsForBusiness(businessId) {
  try {
    const b = db.prepare(`SELECT id, name, description, tags FROM businesses WHERE id=?`).get(businessId);
    if (b) {
      db.prepare(`INSERT OR REPLACE INTO businesses_fts(rowid, name, description, tags) VALUES (?, ?, ?, ?)`)
        .run(b.id, b.name, b.description || '', b.tags || '');
    }
  } catch (e) {
    // FTS update failed silently
  }
}

module.exports = {
  search,
  getSuggestions,
  getTrending,
  logSearch,
  logClick,
  getRecentSearches,
  rebuildFtsIndex,
  updateFtsForBusiness,
};
