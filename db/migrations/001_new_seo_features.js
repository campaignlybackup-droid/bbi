/**
 * Migration: 001_new_seo_features
 * Adds tables for GSC Performance Feedback Loop and Competitor Gap Finder.
 */

const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '../../config/bbi.db'));

try {
  db.exec(`
    PRAGMA foreign_keys = ON;

    -- ============================================
    -- GSC PERFORMANCE FEEDBACK LOOP
    -- ============================================
    CREATE TABLE IF NOT EXISTS seo_page_performance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_url TEXT UNIQUE NOT NULL,
      impressions INTEGER DEFAULT 0,
      clicks INTEGER DEFAULT 0,
      ctr REAL DEFAULT 0,
      position REAL DEFAULT 0,
      fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_seo_page_perf_url ON seo_page_performance(page_url);
    CREATE INDEX IF NOT EXISTS idx_seo_page_perf_ctr ON seo_page_performance(ctr);
    CREATE INDEX IF NOT EXISTS idx_seo_page_perf_impressions ON seo_page_performance(impressions);

    -- ============================================
    -- COMPETITOR GAP FINDER
    -- ============================================
    CREATE TABLE IF NOT EXISTS seo_gaps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      area_slug TEXT NOT NULL,
      category_slug TEXT NOT NULL,
      competitor_domain TEXT NOT NULL,
      competitor_rank INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(area_slug, category_slug, competitor_domain)
    );

    CREATE INDEX IF NOT EXISTS idx_seo_gaps_area_cat ON seo_gaps(area_slug, category_slug);
    CREATE INDEX IF NOT EXISTS idx_seo_gaps_status ON seo_gaps(status);
  `);

  console.log('✅ Migration 001_new_seo_features completed successfully.');
  console.log('   Tables created: seo_page_performance, seo_gaps');
} catch (error) {
  console.error('❌ Migration failed:', error.message);
  process.exit(1);
} finally {
  db.close();
}
