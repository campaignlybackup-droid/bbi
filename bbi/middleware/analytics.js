/**
 * BBI — Page View Analytics Middleware
 * Tracks views for businesses, categories, cities, and pages.
 */

const db = require('../config/db');

// Prepared statement (lazy init to avoid issues if table doesn't exist yet)
let insertStmt = null;

function getInsertStmt() {
  if (!insertStmt) {
    try {
      insertStmt = db.prepare(`
        INSERT INTO page_views (page_type, entity_id, path, user_agent, ip_address)
        VALUES (?, ?, ?, ?, ?)
      `);
    } catch (e) {
      // Table may not exist yet during initial setup
      return null;
    }
  }
  return insertStmt;
}

function trackPageView(pageType, entityIdExtractor) {
  return (req, res, next) => {
    // Don't block the request — track asynchronously
    try {
      const stmt = getInsertStmt();
      if (stmt) {
        const entityId = typeof entityIdExtractor === 'function'
          ? entityIdExtractor(req)
          : (entityIdExtractor || null);
        const ua = (req.headers['user-agent'] || '').slice(0, 500);
        const ip = req.ip || req.connection.remoteAddress || '';
        stmt.run(pageType, entityId, req.path, ua, ip);
      }
    } catch (e) {
      // Never block request due to analytics failure
    }
    next();
  };
}

module.exports = { trackPageView };
