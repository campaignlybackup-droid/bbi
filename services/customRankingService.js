/**
 * BBI — Custom Ranking Service
 * Handles custom ranking pages and static manual ranks.
 */

const db = require('../config/db');

function getAllPages() {
  return db.prepare(`
    SELECT p.*, (SELECT COUNT(*) FROM custom_ranking_items WHERE page_id = p.id) as item_count
    FROM custom_ranking_pages p
    ORDER BY p.created_at DESC
  `).all();
}

function getPageById(id) {
  return db.prepare(`SELECT * FROM custom_ranking_pages WHERE id = ?`).get(id);
}

function getPageBySlug(slug) {
  return db.prepare(`SELECT * FROM custom_ranking_pages WHERE slug = ? AND active = 1`).get(slug);
}

function createPage(data) {
  const { title, slug, description, meta_description } = data;
  return db.prepare(`
    INSERT INTO custom_ranking_pages (title, slug, description, meta_description)
    VALUES (?, ?, ?, ?)
  `).run(title, slug, description || '', meta_description || '');
}

function updatePage(id, data) {
  const { title, slug, description, meta_description, active } = data;
  return db.prepare(`
    UPDATE custom_ranking_pages
    SET title = ?, slug = ?, description = ?, meta_description = ?, active = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(title, slug, description || '', meta_description || '', active !== undefined ? active : 1, id);
}

function deletePage(id) {
  db.transaction(() => {
    db.prepare(`DELETE FROM custom_ranking_items WHERE page_id = ?`).run(id);
    db.prepare(`DELETE FROM custom_ranking_pages WHERE id = ?`).run(id);
  })();
}

function getPageItems(pageId) {
  return db.prepare(`
    SELECT i.*, b.name as biz_name, b.slug as biz_slug, c.name as city_name, cat.name as cat_name
    FROM custom_ranking_items i
    JOIN businesses b ON b.id = i.business_id
    LEFT JOIN cities c ON c.id = b.city_id
    LEFT JOIN categories cat ON cat.id = b.category_id
    WHERE i.page_id = ?
    ORDER BY i.manual_rank ASC
  `).all(pageId);
}

function addItem(pageId, businessId, manualRank) {
  return db.prepare(`
    INSERT INTO custom_ranking_items (page_id, business_id, manual_rank)
    VALUES (?, ?, ?)
    ON CONFLICT(page_id, business_id) DO UPDATE SET manual_rank = excluded.manual_rank
  `).run(pageId, businessId, manualRank);
}

function updateItemRank(itemId, manualRank) {
  return db.prepare(`
    UPDATE custom_ranking_items SET manual_rank = ? WHERE id = ?
  `).run(manualRank, itemId);
}

function removeItem(itemId) {
  return db.prepare(`DELETE FROM custom_ranking_items WHERE id = ?`).run(itemId);
}

module.exports = {
  getAllPages,
  getPageById,
  getPageBySlug,
  createPage,
  updatePage,
  deletePage,
  getPageItems,
  addItem,
  updateItemRank,
  removeItem
};
