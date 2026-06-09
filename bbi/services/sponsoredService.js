/**
 * BBI — Sponsored Listings Service
 * Manages sponsored placements — NEVER affects rankings.
 */

const db = require('../config/db');

function createSponsored(businessId, options = {}) {
  const { city_id, category_id, placement, start_date, end_date } = options;
  return db.prepare(`
    INSERT INTO sponsored_listings (business_id, city_id, category_id, placement, start_date, end_date, active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(businessId, city_id || null, category_id || null, placement || 'sidebar', start_date || null, end_date || null);
}

function getActiveSponsored(cityId = null, categoryId = null, limit = 3) {
  let sql = `
    SELECT sl.*, b.name, b.slug, b.description, b.google_rating, b.google_review_count,
           c.name as city_name, cat.name as cat_name
    FROM sponsored_listings sl
    JOIN businesses b ON b.id = sl.business_id AND b.active = 1
    LEFT JOIN cities c ON c.id = COALESCE(sl.city_id, b.city_id)
    LEFT JOIN categories cat ON cat.id = COALESCE(sl.category_id, b.category_id)
    WHERE sl.active = 1
      AND (sl.end_date IS NULL OR sl.end_date >= DATE('now'))
  `;
  const params = [];

  if (cityId) { sql += ` AND (sl.city_id = ? OR sl.city_id IS NULL)`; params.push(cityId); }
  if (categoryId) { sql += ` AND (sl.category_id = ? OR sl.category_id IS NULL)`; params.push(categoryId); }

  sql += ` ORDER BY sl.created_at DESC LIMIT ?`;
  params.push(limit);

  return db.prepare(sql).all(...params);
}

function getAllSponsored() {
  return db.prepare(`
    SELECT sl.*, b.name as biz_name, b.slug as biz_slug,
           c.name as city_name, cat.name as cat_name
    FROM sponsored_listings sl
    JOIN businesses b ON b.id = sl.business_id
    LEFT JOIN cities c ON c.id = sl.city_id
    LEFT JOIN categories cat ON cat.id = sl.category_id
    ORDER BY sl.created_at DESC
  `).all();
}

function toggleSponsored(id) {
  const current = db.prepare(`SELECT active FROM sponsored_listings WHERE id=?`).get(id);
  if (current) {
    db.prepare(`UPDATE sponsored_listings SET active = ? WHERE id = ?`).run(current.active ? 0 : 1, id);
  }
}

function deleteSponsored(id) {
  db.prepare(`DELETE FROM sponsored_listings WHERE id = ?`).run(id);
}

module.exports = { createSponsored, getActiveSponsored, getAllSponsored, toggleSponsored, deleteSponsored };
