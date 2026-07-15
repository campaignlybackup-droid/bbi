/**
 * BBI — SEO Landing Page Service
 * Full CRUD + business linking + related pages for the SEO Landing Pages system.
 */

const db = require('../config/db');
const slugify = require('slugify');

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
      og_image, schema_type, target_keywords, sort_order, active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    data.active !== undefined ? (data.active ? 1 : 0) : 1
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
      sort_order = ?, active = ?, updated_at = CURRENT_TIMESTAMP
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
 * Get ranked businesses linked to a city+category combination.
 * @param {number} cityId
 * @param {number} categoryId
 * @param {number} limit
 * @returns {Array}
 */
function getLinkedBusinesses(cityId, categoryId, limit = 20) {
  if (!cityId || !categoryId) return [];

  // Try to get ranked businesses first
  const latestDate = db.prepare(`
    SELECT MAX(ranking_date) as d FROM ranking_history WHERE city_id = ? AND category_id = ?
  `).get(cityId, categoryId)?.d;

  if (latestDate) {
    return db.prepare(`
      SELECT rh.rank_position, rh.final_score,
             b.id, b.name, b.slug, b.verified, b.sponsored,
             b.google_rating, b.google_review_count, b.address, b.description
      FROM ranking_history rh
      JOIN businesses b ON b.id = rh.business_id
      WHERE rh.city_id = ? AND rh.category_id = ? AND rh.ranking_date = ? AND b.active = 1
      ORDER BY rh.rank_position ASC
      LIMIT ?
    `).all(cityId, categoryId, latestDate, limit);
  }

  // Fallback: get businesses sorted by rating
  return db.prepare(`
    SELECT b.id, b.name, b.slug, b.verified, b.sponsored,
           b.google_rating, b.google_review_count, b.address, b.description,
           ROW_NUMBER() OVER (ORDER BY b.google_rating DESC) as rank_position
    FROM businesses b
    WHERE b.city_id = ? AND b.category_id = ? AND b.active = 1
    ORDER BY b.google_rating DESC
    LIMIT ?
  `).all(cityId, categoryId, limit);
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
};
