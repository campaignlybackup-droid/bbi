/**
 * BBI — Blog Service
 * Full blog CRUD, publishing workflow, pagination, related posts.
 */

const db = require('../config/db');
const { generateSlug } = require('../middleware/validation');

/**
 * Create a new blog post.
 */
function createPost(data, authorId) {
  let slug = generateSlug(data.title);
  
  // ensure unique slug
  let suffix = 1;
  let baseSlug = slug;
  while (db.prepare('SELECT id FROM blog_posts WHERE slug = ?').get(slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix++;
  }

  const result = db.prepare(`
    INSERT INTO blog_posts (title, slug, content, excerpt, featured_image, category, tags, author_id, status, meta_description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)
  `).run(
    data.title || 'Untitled', slug, data.content || '', data.excerpt || '',
    data.featured_image || '', data.category || '', data.tags || '',
    authorId || null, data.meta_description || ''
  );
  return { id: result.lastInsertRowid, slug };
}

/**
 * Update an existing blog post.
 */
function updatePost(id, data) {
  let slug = generateSlug(data.title);
  
  // ensure unique slug
  let suffix = 1;
  let baseSlug = slug;
  while (db.prepare('SELECT id FROM blog_posts WHERE slug = ? AND id != ?').get(slug, id)) {
    slug = `${baseSlug}-${suffix}`;
    suffix++;
  }

  db.prepare(`
    UPDATE blog_posts SET title=?, slug=?, content=?, excerpt=?, featured_image=?,
    category=?, tags=?, meta_description=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(
    data.title || 'Untitled', slug, data.content || '', data.excerpt || '',
    data.featured_image || '', data.category || '', data.tags || '',
    data.meta_description || '', id
  );
  return slug;
}

/**
 * Publish a blog post.
 */
function publishPost(id) {
  db.prepare(`
    UPDATE blog_posts SET status='published', published_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?
  `).run(id);
}

/**
 * Unpublish (set to draft) a blog post.
 */
function unpublishPost(id) {
  db.prepare(`
    UPDATE blog_posts SET status='draft', updated_at=CURRENT_TIMESTAMP WHERE id=?
  `).run(id);
}

/**
 * Delete a blog post.
 */
function deletePost(id) {
  db.prepare(`DELETE FROM blog_posts WHERE id=?`).run(id);
}

/**
 * Get a single post by slug (published only for public).
 */
function getPost(slug, publicOnly = true) {
  let sql = `
    SELECT bp.*, a.name as author_name
    FROM blog_posts bp
    LEFT JOIN admins a ON a.id = bp.author_id
    WHERE bp.slug = ?
  `;
  if (publicOnly) sql += ` AND bp.status = 'published'`;
  return db.prepare(sql).get(slug);
}

/**
 * Get a single post by ID (admin).
 */
function getPostById(id) {
  return db.prepare(`
    SELECT bp.*, a.name as author_name
    FROM blog_posts bp
    LEFT JOIN admins a ON a.id = bp.author_id
    WHERE bp.id = ?
  `).get(id);
}

/**
 * Get posts with pagination and filters.
 */
function getPosts(options = {}) {
  const { status, category, limit = 20, offset = 0, publicOnly = false } = options;
  let sql = `
    SELECT bp.*, a.name as author_name
    FROM blog_posts bp
    LEFT JOIN admins a ON a.id = bp.author_id
    WHERE 1=1
  `;
  const params = [];

  if (publicOnly) {
    sql += ` AND bp.status = 'published'`;
  } else if (status) {
    sql += ` AND bp.status = ?`;
    params.push(status);
  }

  if (category) {
    sql += ` AND bp.category = ?`;
    params.push(category);
  }

  sql += ` ORDER BY COALESCE(bp.published_at, bp.created_at) DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const posts = db.prepare(sql).all(...params);

  // Get total count
  let countSql = `SELECT COUNT(*) as c FROM blog_posts WHERE 1=1`;
  const countParams = [];
  if (publicOnly) {
    countSql += ` AND status = 'published'`;
  } else if (status) {
    countSql += ` AND status = ?`;
    countParams.push(status);
  }
  if (category) {
    countSql += ` AND category = ?`;
    countParams.push(category);
  }
  const total = db.prepare(countSql).get(...countParams).c;

  return { posts, total };
}

const { extractKeywords } = require('../utils/keywordUtils');

/**
 * Get related posts by category, tags, or keywords in title.
 */
function getRelatedPosts(postId, limit = 3) {
  const post = db.prepare(`SELECT title, category, tags FROM blog_posts WHERE id=?`).get(postId);
  if (!post) return [];

  // Extract keywords from title
  const keywords = extractKeywords(post.title);
  
  // Also add any explicitly defined tags
  if (post.tags) {
    post.tags.split(',').map(t => t.trim().toLowerCase()).forEach(t => {
      if (t.length > 2 && !keywords.includes(t)) keywords.push(t);
    });
  }

  let sql = 'SELECT id, title, slug, excerpt, featured_image, category, published_at FROM blog_posts WHERE id != ? AND status = ? AND (category = ?';
  const conditions = [];
  const params = [postId, 'published', post.category || ''];

  if (keywords.length > 0) {
    keywords.forEach(kw => {
      conditions.push('title LIKE ? OR tags LIKE ?');
      params.push(`%${kw}%`, `%${kw}%`);
    });
    sql += ' OR ' + conditions.join(' OR ');
  }
  
  sql += ') ORDER BY published_at DESC LIMIT ?';
  params.push(limit);

  let results = db.prepare(sql).all(...params);
  
  // Fallback to recent if we don't have enough
  if (results.length < limit) {
    const existingIds = results.map(r => r.id);
    existingIds.push(postId);
    
    const placeholders = existingIds.map(() => '?').join(',');
    const fallbackSql = `SELECT id, title, slug, excerpt, featured_image, category, published_at FROM blog_posts WHERE id NOT IN (${placeholders}) AND status = 'published' ORDER BY published_at DESC LIMIT ?`;
    const fallbackParams = [...existingIds, limit - results.length];
    
    const fallbackResults = db.prepare(fallbackSql).all(...fallbackParams);
    results = results.concat(fallbackResults);
  }

  return results;
}

/**
 * Get all unique blog categories.
 */
function getCategories() {
  return db.prepare(`
    SELECT DISTINCT category, COUNT(*) as count
    FROM blog_posts
    WHERE status = 'published' AND category IS NOT NULL AND category != ''
    GROUP BY category
    ORDER BY count DESC
  `).all();
}

/**
 * Get blog stats for admin.
 */
function getStats() {
  return {
    total: db.prepare(`SELECT COUNT(*) as c FROM blog_posts`).get().c,
    published: db.prepare(`SELECT COUNT(*) as c FROM blog_posts WHERE status='published'`).get().c,
    drafts: db.prepare(`SELECT COUNT(*) as c FROM blog_posts WHERE status='draft'`).get().c,
  };
}

module.exports = {
  createPost,
  updatePost,
  publishPost,
  unpublishPost,
  deletePost,
  getPost,
  getPostById,
  getPosts,
  getRelatedPosts,
  getCategories,
  getStats,
};
