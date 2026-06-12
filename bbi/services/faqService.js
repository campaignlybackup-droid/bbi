/**
 * BBI — FAQ Service
 * Dedicated FAQ management replacing JSON blobs in seo_content.
 * Supports per-page FAQs with admin CRUD and JSON-LD generation.
 */

const db = require('../config/db');

/**
 * Get FAQs for a specific page.
 */
function getFaqs(pageType, entityId = null) {
  try {
    if (entityId) {
      return db.prepare(`
        SELECT * FROM faqs WHERE page_type = ? AND entity_id = ? AND active = 1
        ORDER BY sort_order ASC, id ASC
      `).all(pageType, entityId);
    }
    return db.prepare(`
      SELECT * FROM faqs WHERE page_type = ? AND entity_id IS NULL AND active = 1
      ORDER BY sort_order ASC, id ASC
    `).all(pageType);
  } catch (e) {
    return [];
  }
}

/**
 * Get all FAQs for admin (with pagination and filters).
 */
function getAllFaqs(pageType = null) {
  let sql = `SELECT * FROM faqs`;
  const params = [];
  if (pageType) {
    sql += ` WHERE page_type = ?`;
    params.push(pageType);
  }
  sql += ` ORDER BY page_type, entity_id, sort_order ASC`;
  return db.prepare(sql).all(...params);
}

/**
 * Get a single FAQ by ID.
 */
function getFaqById(id) {
  return db.prepare(`SELECT * FROM faqs WHERE id = ?`).get(id);
}

/**
 * Create a new FAQ.
 */
function createFaq(data) {
  const result = db.prepare(`
    INSERT INTO faqs (page_type, entity_id, question, answer, sort_order, active)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(data.page_type, data.entity_id || null, data.question, data.answer, data.sort_order || 0);
  return result.lastInsertRowid;
}

/**
 * Update an existing FAQ.
 */
function updateFaq(id, data) {
  db.prepare(`
    UPDATE faqs SET question = ?, answer = ?, sort_order = ?, page_type = ?, entity_id = ?
    WHERE id = ?
  `).run(data.question, data.answer, data.sort_order || 0, data.page_type, data.entity_id || null, id);
}

/**
 * Delete a FAQ.
 */
function deleteFaq(id) {
  db.prepare(`DELETE FROM faqs WHERE id = ?`).run(id);
}

/**
 * Toggle FAQ active state.
 */
function toggleFaq(id) {
  const faq = db.prepare(`SELECT active FROM faqs WHERE id = ?`).get(id);
  if (faq) {
    db.prepare(`UPDATE faqs SET active = ? WHERE id = ?`).run(faq.active ? 0 : 1, id);
  }
}

/**
 * Generate FAQPage JSON-LD schema from FAQs.
 */
function getFaqSchema(pageType, entityId = null) {
  const faqs = getFaqs(pageType, entityId);
  if (!faqs || !faqs.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

/**
 * Get FAQ stats for admin.
 */
function getStats() {
  try {
    return {
      total: db.prepare(`SELECT COUNT(*) as c FROM faqs`).get().c,
      active: db.prepare(`SELECT COUNT(*) as c FROM faqs WHERE active = 1`).get().c,
      byType: db.prepare(`
        SELECT page_type, COUNT(*) as count FROM faqs GROUP BY page_type ORDER BY count DESC
      `).all(),
    };
  } catch (e) {
    return { total: 0, active: 0, byType: [] };
  }
}

module.exports = {
  getFaqs,
  getAllFaqs,
  getFaqById,
  createFaq,
  updateFaq,
  deleteFaq,
  toggleFaq,
  getFaqSchema,
  getStats,
};
