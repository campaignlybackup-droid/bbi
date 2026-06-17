const db = require('../config/db');

function getAllNews(activeOnly = false) {
  let query = 'SELECT * FROM news';
  if (activeOnly) {
    query += ' WHERE active = 1';
  }
  query += ' ORDER BY created_at DESC';
  return db.prepare(query).all();
}

function getNewsById(id) {
  return db.prepare('SELECT * FROM news WHERE id = ?').get(id);
}

function getNewsBySlug(slug) {
  return db.prepare('SELECT * FROM news WHERE slug = ? AND active = 1').get(slug);
}

function createNews(data) {
  const { title, content, image, active } = data;
  let slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  
  // ensure unique slug
  let count = 1;
  let uniqueSlug = slug;
  while (db.prepare('SELECT id FROM news WHERE slug = ?').get(uniqueSlug)) {
    uniqueSlug = `${slug}-${count}`;
    count++;
  }

  const result = db.prepare(`
    INSERT INTO news (title, slug, content, image, active)
    VALUES (?, ?, ?, ?, ?)
  `).run(title, uniqueSlug, content || '', image || '', active ? 1 : 0);
  
  return result.lastInsertRowid;
}

function updateNews(id, data) {
  const { title, content, image, active } = data;
  let slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  
  // ensure unique slug excluding current id
  let count = 1;
  let uniqueSlug = slug;
  while (db.prepare('SELECT id FROM news WHERE slug = ? AND id != ?').get(uniqueSlug, id)) {
    uniqueSlug = `${slug}-${count}`;
    count++;
  }

  db.prepare(`
    UPDATE news SET title = ?, slug = ?, content = ?, image = ?, active = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(title, uniqueSlug, content || '', image || '', active ? 1 : 0, id);
}

function deleteNews(id) {
  db.prepare('DELETE FROM news WHERE id = ?').run(id);
}

function toggleNews(id) {
  const news = getNewsById(id);
  if (news) {
    db.prepare('UPDATE news SET active = ? WHERE id = ?').run(news.active ? 0 : 1, id);
  }
}

module.exports = {
  getAllNews,
  getNewsById,
  getNewsBySlug,
  createNews,
  updateNews,
  deleteNews,
  toggleNews
};
