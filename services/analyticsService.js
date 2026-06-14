/**
 * BBI — Analytics Service
 * Page views, search insights, business view stats, category analytics.
 */

const db = require('../config/db');

function trackPageView(pageType, entityId, path, userAgent, ip) {
  try {
    db.prepare(`INSERT INTO page_views (page_type, entity_id, path, user_agent, ip_address) VALUES (?, ?, ?, ?, ?)`)
      .run(pageType, entityId, path, (userAgent || '').slice(0, 500), ip || '');
  } catch (e) { /* silent */ }
}

function getRankingInsights(cityId, categoryId) {
  try {
    const latestDate = db.prepare(`
      SELECT MAX(ranking_date) as d FROM ranking_history WHERE city_id=? AND category_id=?
    `).get(cityId, categoryId)?.d;

    const prevDate = db.prepare(`
      SELECT MAX(ranking_date) as d FROM ranking_history WHERE city_id=? AND category_id=? AND ranking_date < ?
    `).get(cityId, categoryId, latestDate)?.d;

    if (!latestDate) return null;

    const current = db.prepare(`
      SELECT rh.*, b.name FROM ranking_history rh JOIN businesses b ON b.id=rh.business_id
      WHERE rh.city_id=? AND rh.category_id=? AND rh.ranking_date=? ORDER BY rh.rank_position
    `).all(cityId, categoryId, latestDate);

    const totalViews = db.prepare(`
      SELECT COUNT(*) as c FROM page_views WHERE page_type='ranking' AND path LIKE ?
    `).get(`%/${cityId}/${categoryId}%`)?.c || 0;

    return { latestDate, prevDate, current, totalViews };
  } catch (e) {
    return null;
  }
}

function getSearchInsights(days = 30) {
  try {
    const topQueries = db.prepare(`
      SELECT query, COUNT(*) as count FROM search_log
      WHERE created_at >= datetime('now', '-${days} days')
      GROUP BY query ORDER BY count DESC LIMIT 20
    `).all();

    const totalSearches = db.prepare(`
      SELECT COUNT(*) as c FROM search_log WHERE created_at >= datetime('now', '-${days} days')
    `).get()?.c || 0;

    const zeroResults = db.prepare(`
      SELECT query, COUNT(*) as count FROM search_log
      WHERE results_count = 0 AND created_at >= datetime('now', '-${days} days')
      GROUP BY query ORDER BY count DESC LIMIT 10
    `).all();

    return { topQueries, totalSearches, zeroResults };
  } catch (e) {
    return { topQueries: [], totalSearches: 0, zeroResults: [] };
  }
}

function getBusinessViewStats(businessId, days = 30) {
  try {
    const totalViews = db.prepare(`
      SELECT COUNT(*) as c FROM page_views
      WHERE page_type='business' AND entity_id=? AND created_at >= datetime('now', '-${days} days')
    `).get(businessId)?.c || 0;

    const dailyViews = db.prepare(`
      SELECT DATE(created_at) as date, COUNT(*) as views FROM page_views
      WHERE page_type='business' AND entity_id=? AND created_at >= datetime('now', '-${days} days')
      GROUP BY DATE(created_at) ORDER BY date
    `).all(businessId);

    return { totalViews, dailyViews };
  } catch (e) {
    return { totalViews: 0, dailyViews: [] };
  }
}

function getCategoryAnalytics() {
  try {
    return db.prepare(`
      SELECT cat.name, cat.slug, COUNT(b.id) as biz_count,
             COALESCE(pv.views, 0) as total_views
      FROM categories cat
      LEFT JOIN businesses b ON b.category_id = cat.id AND b.active = 1
      LEFT JOIN (
        SELECT entity_id, COUNT(*) as views FROM page_views WHERE page_type='category' GROUP BY entity_id
      ) pv ON pv.entity_id = cat.id
      WHERE cat.active = 1
      GROUP BY cat.id
      ORDER BY total_views DESC
    `).all();
  } catch (e) {
    return [];
  }
}

function getDashboardStats() {
  try {
    const viewsToday = db.prepare(`SELECT COUNT(*) as c FROM page_views WHERE DATE(created_at) = DATE('now')`).get()?.c || 0;
    const viewsWeek = db.prepare(`SELECT COUNT(*) as c FROM page_views WHERE created_at >= datetime('now', '-7 days')`).get()?.c || 0;
    const searchesToday = db.prepare(`SELECT COUNT(*) as c FROM search_log WHERE DATE(created_at) = DATE('now')`).get()?.c || 0;
    return { viewsToday, viewsWeek, searchesToday };
  } catch (e) {
    return { viewsToday: 0, viewsWeek: 0, searchesToday: 0 };
  }
}

module.exports = {
  trackPageView,
  getRankingInsights,
  getSearchInsights,
  getBusinessViewStats,
  getCategoryAnalytics,
  getDashboardStats,
};
