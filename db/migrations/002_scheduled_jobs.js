/**
 * Migration: 002_scheduled_jobs
 * Adds the scheduled_jobs table for dynamic cron job management.
 */

const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '../../config/bbi.db'));

try {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS scheduled_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      cron_expression TEXT NOT NULL,
      job_type TEXT NOT NULL,
      params TEXT DEFAULT '{}',
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Insert default jobs if table is empty
    INSERT INTO scheduled_jobs (name, description, cron_expression, job_type)
    SELECT 'Import Top Localities', 'Re-scrape top 20 localities by GSC impressions', '30 0 * * 1', 'import_businesses_top'
    WHERE NOT EXISTS (SELECT 1 FROM scheduled_jobs);

    INSERT INTO scheduled_jobs (name, description, cron_expression, job_type)
    SELECT 'Stale Content Regeneration', 'Re-enqueue AI generation for SEO content older than 30 days', '30 20 * * 6', 'stale_content_regen'
    WHERE (SELECT COUNT(*) FROM scheduled_jobs) = 1;

    INSERT INTO scheduled_jobs (name, description, cron_expression, job_type)
    SELECT 'GSC Data Sync', 'Fetch latest Search Console data and populate performance tables', '30 19 * * *', 'gsc_sync'
    WHERE (SELECT COUNT(*) FROM scheduled_jobs) = 2;

    INSERT INTO scheduled_jobs (name, description, cron_expression, job_type)
    SELECT 'Competitor Gap Scan', 'Scan SERPs for defined competitors to find missing pages', '30 21 * * 1', 'competitor_gap_finder'
    WHERE (SELECT COUNT(*) FROM scheduled_jobs) = 3;
  `);

  console.log('✅ Migration 002_scheduled_jobs completed successfully.');
} catch (error) {
  console.error('❌ Migration failed:', error.message);
  process.exit(1);
} finally {
  db.close();
}
