const db = require('../config/db');
const { extractKeywords } = require('../utils/keywordUtils');

function getNews(limit = 10, offset = 0) {
  return db.prepare('SELECT * FROM news ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
}

function getActiveNews(limit = 10, offset = 0) {
  return db.prepare('SELECT * FROM news WHERE active = 1 ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
}

function getNewsById(id) {
  return db.prepare('SELECT * FROM news WHERE id = ?').get(id);
}

function getNewsBySlug(slug) {
  return db.prepare('SELECT * FROM news WHERE slug = ? AND active = 1').get(slug);
}

function getRelatedNews(newsId, title, limit = 3) {
  const keywords = extractKeywords(title);
  
  if (keywords.length === 0) {
    return db.prepare('SELECT id, title, slug, image, created_at FROM news WHERE id != ? AND active = 1 ORDER BY created_at DESC LIMIT ?').all(newsId, limit);
  }

  let sql = 'SELECT id, title, slug, image, created_at FROM news WHERE id != ? AND active = 1 AND (';
  const conditions = [];
  const params = [newsId];

  keywords.forEach(kw => {
    conditions.push('title LIKE ?');
    params.push(`%${kw}%`);
  });

  sql += conditions.join(' OR ') + ') ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  let results = db.prepare(sql).all(...params);

  // Fallback to recent if we don't have enough
  if (results.length < limit) {
    const existingIds = results.map(r => r.id);
    existingIds.push(newsId);
    
    const placeholders = existingIds.map(() => '?').join(',');
    const fallbackSql = `SELECT id, title, slug, image, created_at FROM news WHERE id NOT IN (${placeholders}) AND active = 1 ORDER BY created_at DESC LIMIT ?`;
    const fallbackParams = [...existingIds, limit - results.length];
    
    const fallbackResults = db.prepare(fallbackSql).all(...fallbackParams);
    results = results.concat(fallbackResults);
  }

  return results;
}

function createNews(data) {
  const { title, content, image, active } = data;
  let slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  
  // ensure unique slug
  let suffix = 1;
  let baseSlug = slug;
  while (db.prepare('SELECT id FROM news WHERE slug = ?').get(slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix++;
  }

  const result = db.prepare('INSERT INTO news (title, slug, content, image, active) VALUES (?, ?, ?, ?, ?)').run(
    title, slug, content, image, active ? 1 : 0
  );
  return result.lastInsertRowid;
}

function updateNews(id, data) {
  const { title, content, image, active } = data;
  let slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  
  // ensure unique slug
  let suffix = 1;
  let baseSlug = slug;
  while (db.prepare('SELECT id FROM news WHERE slug = ? AND id != ?').get(slug, id)) {
    slug = `${baseSlug}-${suffix}`;
    suffix++;
  }

  if (image) {
    db.prepare('UPDATE news SET title=?, slug=?, content=?, image=?, active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(
      title, slug, content, image, active ? 1 : 0, id
    );
  } else {
    db.prepare('UPDATE news SET title=?, slug=?, content=?, active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(
      title, slug, content, active ? 1 : 0, id
    );
  }
}

function deleteNews(id) {
  db.prepare('DELETE FROM news WHERE id = ?').run(id);
}

function toggleNews(id) {
  const newsItem = getNewsById(id);
  if (newsItem) {
    db.prepare('UPDATE news SET active = ? WHERE id = ?').run(newsItem.active ? 0 : 1, id);
  }
}

module.exports = {
  getNews,
  getActiveNews,
  getNewsById,
  getNewsBySlug,
  getRelatedNews,
  createNews,
  updateNews,
  deleteNews,
  toggleNews
};
