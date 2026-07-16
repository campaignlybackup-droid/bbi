/**
 * BBI — SEO Landing Page Service
 * Full CRUD + business linking + related pages for the SEO Landing Pages system.
 * Enhanced with advanced business search, manual rankings, and copy-from-source.
 */

const db = require('../config/db');
const slugify = require('slugify');

// ============================================
// DB MIGRATION — Add manual_rankings_json column
// ============================================
try {
  db.prepare(`ALTER TABLE seo_landing_pages ADD COLUMN manual_rankings_json TEXT DEFAULT '[]'`).run();
  console.log('[SEO Landing Pages] Added manual_rankings_json column.');
} catch (e) {
  // Column already exists — safe to ignore
}

/**
 * Get all SEO landing pages.
 * @param {boolean} activeOnly - If true, only return active pages
 * @returns {Array}
 */
function getAllPages(activeOnly = false) {
  let query = `
    SELECT p.*, 
           c.name as city_name, cat.name as category_name
    FROM seo_landing_pages p
    LEFT JOIN cities c ON c.id = p.linked_city_id
    LEFT JOIN categories cat ON cat.id = p.linked_category_id
  `;
  if (activeOnly) {
    query += ' WHERE p.active = 1';
  }
  query += ' ORDER BY p.sort_order ASC, p.created_at DESC';
  return db.prepare(query).all();
}

/**
 * Get a single page by slug.
 * @param {string} slug
 * @returns {Object|null}
 */
function getPageBySlug(slug) {
  return db.prepare(`
    SELECT p.*, 
           c.name as city_name, c.slug as city_slug,
           cat.name as category_name, cat.slug as category_slug
    FROM seo_landing_pages p
    LEFT JOIN cities c ON c.id = p.linked_city_id
    LEFT JOIN categories cat ON cat.id = p.linked_category_id
    WHERE p.slug = ? AND p.active = 1
  `).get(slug);
}

/**
 * Get a single page by ID.
 * @param {number} id
 * @returns {Object|null}
 */
function getPageById(id) {
  return db.prepare(`
    SELECT p.*, 
           c.name as city_name, c.slug as city_slug,
           cat.name as category_name, cat.slug as category_slug
    FROM seo_landing_pages p
    LEFT JOIN cities c ON c.id = p.linked_city_id
    LEFT JOIN categories cat ON cat.id = p.linked_category_id
    WHERE p.id = ?
  `).get(id);
}

/**
 * Create a new SEO landing page.
 * @param {Object} data
 * @returns {Object} RunResult
 */
function createPage(data) {
  let slug = data.slug || slugify(data.h1 || data.title, { lower: true, strict: true });
  
  // Ensure unique slug
  let suffix = 1;
  let baseSlug = slug;
  while (db.prepare('SELECT id FROM seo_landing_pages WHERE slug = ?').get(slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix++;
  }

  return db.prepare(`
    INSERT INTO seo_landing_pages (
      slug, title, meta_description, h1, hero_subtitle,
      content_intro, content_body, content_conclusion,
      faq_json, internal_links_json,
      linked_city_id, linked_category_id,
      og_image, schema_type, target_keywords, sort_order, active,
      manual_rankings_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    slug,
    data.title,
    data.meta_description || '',
    data.h1 || data.title,
    data.hero_subtitle || '',
    data.content_intro || '',
    data.content_body || '',
    data.content_conclusion || '',
    data.faq_json || '[]',
    data.internal_links_json || '[]',
    data.linked_city_id || null,
    data.linked_category_id || null,
    data.og_image || '',
    data.schema_type || 'WebPage',
    data.target_keywords || '',
    data.sort_order || 0,
    data.active !== undefined ? (data.active ? 1 : 0) : 1,
    data.manual_rankings_json || '[]'
  );
}

/**
 * Update an existing SEO landing page.
 * @param {number} id
 * @param {Object} data
 * @returns {Object} RunResult
 */
function updatePage(id, data) {
  let slug = data.slug || slugify(data.h1 || data.title, { lower: true, strict: true });
  
  // Ensure unique slug (excluding current record)
  let suffix = 1;
  let baseSlug = slug;
  while (db.prepare('SELECT id FROM seo_landing_pages WHERE slug = ? AND id != ?').get(slug, id)) {
    slug = `${baseSlug}-${suffix}`;
    suffix++;
  }

  return db.prepare(`
    UPDATE seo_landing_pages SET
      slug = ?, title = ?, meta_description = ?, h1 = ?, hero_subtitle = ?,
      content_intro = ?, content_body = ?, content_conclusion = ?,
      faq_json = ?, internal_links_json = ?,
      linked_city_id = ?, linked_category_id = ?,
      og_image = ?, schema_type = ?, target_keywords = ?,
      sort_order = ?, active = ?, manual_rankings_json = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    slug,
    data.title,
    data.meta_description || '',
    data.h1 || data.title,
    data.hero_subtitle || '',
    data.content_intro || '',
    data.content_body || '',
    data.content_conclusion || '',
    data.faq_json || '[]',
    data.internal_links_json || '[]',
    data.linked_city_id || null,
    data.linked_category_id || null,
    data.og_image || '',
    data.schema_type || 'WebPage',
    data.target_keywords || '',
    data.sort_order || 0,
    data.active !== undefined ? (data.active ? 1 : 0) : 1,
    data.manual_rankings_json || '[]',
    id
  );
}

/**
 * Delete an SEO landing page.
 * @param {number} id
 */
function deletePage(id) {
  db.prepare('DELETE FROM seo_landing_pages WHERE id = ?').run(id);
}

/**
 * Toggle active status.
 * @param {number} id
 */
function togglePage(id) {
  const page = db.prepare('SELECT active FROM seo_landing_pages WHERE id = ?').get(id);
  if (page) {
    db.prepare('UPDATE seo_landing_pages SET active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(page.active ? 0 : 1, id);
  }
}

/**
 * Duplicate a page (for creating keyword variants quickly).
 * @param {number} id
 * @returns {number} New page ID
 */
function duplicatePage(id) {
  const page = getPageById(id);
  if (!page) return null;

  const newData = { ...page };
  delete newData.id;
  delete newData.created_at;
  delete newData.updated_at;
  delete newData.city_name;
  delete newData.city_slug;
  delete newData.category_name;
  delete newData.category_slug;
  newData.title = page.title + ' (Copy)';
  newData.h1 = page.h1 + ' (Copy)';
  newData.slug = page.slug + '-copy';
  newData.active = 0; // Start as inactive

  const result = createPage(newData);
  return result.lastInsertRowid;
}

/**
 * Get ranked businesses for an SEO landing page.
 * Manual rankings take priority, then auto-linked city+category businesses fill remaining slots.
 * @param {number} cityId
 * @param {number} categoryId
 * @param {number} limit
 * @param {string} manualRankingsJson - JSON string of manual rankings
 * @returns {Array}
 */
function getLinkedBusinesses(cityId, categoryId, limit = 20, manualRankingsJson = '[]') {
  let manualRankings = [];
  try {
    manualRankings = JSON.parse(manualRankingsJson || '[]');
  } catch(e) { manualRankings = []; }

  // If we have manual rankings, fetch those businesses first
  if (manualRankings.length > 0) {
    const manualIds = manualRankings.map(r => r.business_id).filter(Boolean);
    if (manualIds.length > 0) {
      const placeholders = manualIds.map(() => '?').join(',');
      const manualBusinesses = db.prepare(`
        SELECT b.id, b.name, b.slug, b.verified, b.sponsored,
               b.google_rating, b.google_review_count, b.address, b.description,
               c.name as city_name, cat.name as category_name
        FROM businesses b
        LEFT JOIN cities c ON c.id = b.city_id
        LEFT JOIN categories cat ON cat.id = b.category_id
        WHERE b.id IN (${placeholders}) AND b.active = 1
      `).all(...manualIds);

      // Map by id for ordering
      const bizMap = {};
      manualBusinesses.forEach(b => { bizMap[b.id] = b; });

      const result = [];
      manualRankings.forEach(r => {
        if (bizMap[r.business_id]) {
          result.push({ ...bizMap[r.business_id], rank_position: r.rank_position, final_score: null });
        }
      });

      // If we also have city+category, fill remaining slots
      if (cityId && categoryId && result.length < limit) {
        const usedIds = new Set(manualIds);
        const autoBusinesses = getAutoLinkedBusinesses(cityId, categoryId, limit - result.length, usedIds);
        let nextRank = result.length + 1;
        autoBusinesses.forEach(b => {
          result.push({ ...b, rank_position: nextRank++ });
        });
      }

      return result.slice(0, limit);
    }
  }

  // No manual rankings — use original auto-link logic
  if (!cityId || !categoryId) return [];
  return getAutoLinkedBusinesses(cityId, categoryId, limit);
}

/**
 * Get auto-linked businesses from ranking_history or fallback by rating.
 * @param {number} cityId
 * @param {number} categoryId
 * @param {number} limit
 * @param {Set} excludeIds - Business IDs to exclude
 * @returns {Array}
 */
function getAutoLinkedBusinesses(cityId, categoryId, limit = 20, excludeIds = new Set()) {
  const latestDate = db.prepare(`
    SELECT MAX(ranking_date) as d FROM ranking_history WHERE city_id = ? AND category_id = ?
  `).get(cityId, categoryId)?.d;

  let results = [];
  if (latestDate) {
    results = db.prepare(`
      SELECT rh.rank_position, rh.final_score,
             b.id, b.name, b.slug, b.verified, b.sponsored,
             b.google_rating, b.google_review_count, b.address, b.description
      FROM ranking_history rh
      JOIN businesses b ON b.id = rh.business_id
      WHERE rh.city_id = ? AND rh.category_id = ? AND rh.ranking_date = ? AND b.active = 1
      ORDER BY rh.rank_position ASC
    `).all(cityId, categoryId, latestDate);
  } else {
    results = db.prepare(`
      SELECT b.id, b.name, b.slug, b.verified, b.sponsored,
             b.google_rating, b.google_review_count, b.address, b.description,
             ROW_NUMBER() OVER (ORDER BY b.google_rating DESC) as rank_position
      FROM businesses b
      WHERE b.city_id = ? AND b.category_id = ? AND b.active = 1
      ORDER BY b.google_rating DESC
    `).all(cityId, categoryId);
  }

  // Filter out excluded IDs
  if (excludeIds.size > 0) {
    results = results.filter(b => !excludeIds.has(b.id));
  }

  return results.slice(0, limit);
}

// ============================================
// ADVANCED BUSINESS SEARCH
// ============================================

/**
 * Search businesses with advanced filters.
 * @param {Object} filters
 * @returns {Array}
 */
function searchBusinesses(filters = {}) {
  const { query, categoryId, cityId, minRating, verified, limit = 50 } = filters;
  
  let sql = `
    SELECT b.id, b.name, b.slug, b.verified, b.sponsored,
           b.google_rating, b.google_review_count, b.address,
           c.name as city_name, cat.name as category_name,
           c.id as city_id, cat.id as category_id
    FROM businesses b
    LEFT JOIN cities c ON c.id = b.city_id
    LEFT JOIN categories cat ON cat.id = b.category_id
    WHERE b.active = 1
  `;
  const params = [];

  if (query && query.trim()) {
    sql += ` AND (LOWER(b.name) LIKE ? OR LOWER(b.address) LIKE ? OR LOWER(b.tags) LIKE ?)`;
    const q = `%${query.trim().toLowerCase()}%`;
    params.push(q, q, q);
  }

  if (categoryId) {
    sql += ` AND b.category_id = ?`;
    params.push(parseInt(categoryId));
  }

  if (cityId) {
    sql += ` AND b.city_id = ?`;
    params.push(parseInt(cityId));
  }

  if (minRating) {
    sql += ` AND b.google_rating >= ?`;
    params.push(parseFloat(minRating));
  }

  if (verified === '1' || verified === true) {
    sql += ` AND b.verified = 1`;
  }

  sql += ` ORDER BY b.google_rating DESC, b.google_review_count DESC LIMIT ?`;
  params.push(parseInt(limit) || 50);

  return db.prepare(sql).all(...params);
}

// ============================================
// COPY RANKINGS FROM SOURCE
// ============================================

/**
 * Get rankings from a source page/combo.
 * @param {string} sourceType - 'seo_landing_page', 'custom_ranking', or 'city_category'
 * @param {Object} sourceParams - { id } or { cityId, categoryId }
 * @returns {Array}
 */
function getRankingsFromSource(sourceType, sourceParams = {}) {
  if (sourceType === 'seo_landing_page') {
    const page = getPageById(sourceParams.id);
    if (!page) return [];
    
    // Check manual rankings first
    let manualRankings = [];
    try { manualRankings = JSON.parse(page.manual_rankings_json || '[]'); } catch(e) {}
    
    if (manualRankings.length > 0) {
      const ids = manualRankings.map(r => r.business_id).filter(Boolean);
      if (ids.length > 0) {
        const placeholders = ids.map(() => '?').join(',');
        const businesses = db.prepare(`
          SELECT b.id, b.name, b.slug, b.google_rating, b.google_review_count,
                 c.name as city_name, cat.name as category_name
          FROM businesses b
          LEFT JOIN cities c ON c.id = b.city_id
          LEFT JOIN categories cat ON cat.id = b.category_id
          WHERE b.id IN (${placeholders})
        `).all(...ids);
        
        const bizMap = {};
        businesses.forEach(b => { bizMap[b.id] = b; });
        
        return manualRankings.map(r => {
          const biz = bizMap[r.business_id];
          if (!biz) return null;
          return { ...biz, rank_position: r.rank_position };
        }).filter(Boolean);
      }
    }
    
    // Fall back to auto-linked
    if (page.linked_city_id && page.linked_category_id) {
      return getAutoLinkedBusinesses(page.linked_city_id, page.linked_category_id, 30);
    }
    return [];
  }

  if (sourceType === 'custom_ranking') {
    return db.prepare(`
      SELECT i.manual_rank as rank_position,
             b.id, b.name, b.slug, b.google_rating, b.google_review_count,
             c.name as city_name, cat.name as category_name
      FROM custom_ranking_items i
      JOIN businesses b ON b.id = i.business_id
      LEFT JOIN cities c ON c.id = b.city_id
      LEFT JOIN categories cat ON cat.id = b.category_id
      WHERE i.page_id = ?
      ORDER BY i.manual_rank ASC
    `).all(sourceParams.id);
  }

  if (sourceType === 'city_category') {
    const { cityId, categoryId } = sourceParams;
    if (!cityId || !categoryId) return [];
    return getAutoLinkedBusinesses(cityId, categoryId, 30);
  }

  return [];
}

/**
 * Get all available sources for copying rankings.
 * @param {number} excludePageId - Exclude this SEO landing page
 * @returns {Object} { seoPages, customPages, cityCategoryCombos }
 */
function getAvailableSources(excludePageId = 0) {
  // SEO Landing Pages that have rankings
  const seoPages = db.prepare(`
    SELECT p.id, p.h1, p.slug, p.linked_city_id, p.linked_category_id, p.manual_rankings_json,
           c.name as city_name, cat.name as category_name
    FROM seo_landing_pages p
    LEFT JOIN cities c ON c.id = p.linked_city_id
    LEFT JOIN categories cat ON cat.id = p.linked_category_id
    WHERE p.id != ? AND p.active = 1
    ORDER BY p.sort_order ASC, p.h1 ASC
  `).all(excludePageId).filter(p => {
    // Only include pages that have either manual rankings or linked city+category
    let hasManual = false;
    try { hasManual = JSON.parse(p.manual_rankings_json || '[]').length > 0; } catch(e) {}
    return hasManual || (p.linked_city_id && p.linked_category_id);
  });

  // Custom Ranking Pages
  const customPages = db.prepare(`
    SELECT p.id, p.title, p.slug,
           (SELECT COUNT(*) FROM custom_ranking_items WHERE page_id = p.id) as item_count
    FROM custom_ranking_pages p
    WHERE p.active = 1
    ORDER BY p.title ASC
  `).all().filter(p => p.item_count > 0);

  // City+Category combos that have ranking history
  const cityCategoryCombos = db.prepare(`
    SELECT DISTINCT rh.city_id, rh.category_id,
           c.name as city_name, cat.name as category_name
    FROM ranking_history rh
    JOIN cities c ON c.id = rh.city_id
    JOIN categories cat ON cat.id = rh.category_id
    WHERE rh.ranking_date = (
      SELECT MAX(rh2.ranking_date) FROM ranking_history rh2
      WHERE rh2.city_id = rh.city_id AND rh2.category_id = rh.category_id
    )
    ORDER BY c.name ASC, cat.name ASC
  `).all();

  return { seoPages, customPages, cityCategoryCombos };
}

/**
 * Get related landing pages by keyword overlap.
 * @param {number} currentId - Exclude this page
 * @param {string} keywords - Comma-separated keywords
 * @param {number} limit
 * @returns {Array}
 */
function getRelatedLandingPages(currentId, keywords, limit = 6) {
  if (!keywords) {
    return db.prepare(`
      SELECT id, slug, title, h1, hero_subtitle FROM seo_landing_pages 
      WHERE id != ? AND active = 1 
      ORDER BY sort_order ASC, created_at DESC 
      LIMIT ?
    `).all(currentId || 0, limit);
  }

  const kwArray = keywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k.length > 2);
  
  if (kwArray.length === 0) {
    return db.prepare(`
      SELECT id, slug, title, h1, hero_subtitle FROM seo_landing_pages 
      WHERE id != ? AND active = 1 
      ORDER BY sort_order ASC, created_at DESC 
      LIMIT ?
    `).all(currentId || 0, limit);
  }

  // Score pages by keyword overlap
  let sql = `SELECT id, slug, title, h1, hero_subtitle, target_keywords, (`;
  const conditions = [];
  const params = [currentId || 0];

  kwArray.forEach(kw => {
    conditions.push(`(CASE WHEN LOWER(target_keywords) LIKE ? OR LOWER(title) LIKE ? THEN 1 ELSE 0 END)`);
    params.push(`%${kw}%`, `%${kw}%`);
  });

  sql += conditions.join(' + ') + `) as relevance FROM seo_landing_pages WHERE id != ? AND active = 1 ORDER BY relevance DESC, sort_order ASC LIMIT ?`;
  params.push(limit);

  return db.prepare(sql).all(...params);
}

/**
 * Get all active pages for sitemap generation.
 * @returns {Array}
 */
function getActivePageSlugs() {
  return db.prepare(`
    SELECT slug, updated_at FROM seo_landing_pages WHERE active = 1 ORDER BY sort_order ASC
  `).all();
}

module.exports = {
  getAllPages,
  getPageBySlug,
  getPageById,
  createPage,
  updatePage,
  deletePage,
  togglePage,
  duplicatePage,
  getLinkedBusinesses,
  getRelatedLandingPages,
  getActivePageSlugs,
  searchBusinesses,
  getRankingsFromSource,
  getAvailableSources,
};
