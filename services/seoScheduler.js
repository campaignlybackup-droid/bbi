/**
 * BBI - SEO Scheduler
 * Registers recurring jobs for programmatic SEO freshness and discovery.
 */

const cron = require('node-cron');
const db = require('../config/db');
const jobQueue = require('./ai/jobQueue');

/**
 * Initializes all cron jobs.
 */
function init() {
  // 1. Every Monday at 6 AM IST (00:30 UTC): Re-scrape top 20 localities by impressions
  // Cron expression: 30 0 * * 1
  cron.schedule('30 0 * * 1', () => {
    console.log('Running scheduled job: Top Localities Business Import');
    try {
      const topLocalities = db.prepare(`
        SELECT DISTINCT a.id as area_id, c.id as category_id
        FROM seo_page_performance p
        JOIN areas a ON '/' || a.slug || '/' = substr(p.page_url, 1, length('/' || a.slug || '/'))
        JOIN businesses b ON b.area_id = a.id
        JOIN categories c ON c.id = b.category_id
        WHERE a.active = 1 AND c.active = 1
        ORDER BY p.impressions DESC
        LIMIT 20
      `).all();

      topLocalities.forEach(loc => {
        jobQueue.enqueue('import_businesses', {
          area_id: loc.area_id,
          category_id: loc.category_id,
          source: 'scheduler'
        });
      });
    } catch (e) {
      console.error('Scheduler import_businesses failed:', e);
    }
  });

  // 2. Every Sunday at 2 AM IST (20:30 UTC Saturday): Re-enqueue AI content regeneration for stale pages (>30 days)
  // Cron expression: 30 20 * * 6
  cron.schedule('30 20 * * 6', () => {
    console.log('Running scheduled job: Stale Content Regeneration');
    try {
      const staleContent = db.prepare(`
        SELECT id, page_type, entity_id
        FROM seo_content
        WHERE updated_at < datetime('now', '-30 days')
        LIMIT 100
      `).all();

      staleContent.forEach(content => {
        jobQueue.enqueue('seo_generate', {
          pageType: content.page_type,
          id: content.entity_id,
          source: 'scheduler'
        });
      });
    } catch (e) {
      console.error('Scheduler stale content regen failed:', e);
    }
  });
  
  // 3. Daily at 1 AM IST (19:30 UTC): Sync Google Search Console Data
  // Cron expression: 30 19 * * *
  cron.schedule('30 19 * * *', () => {
    console.log('Running scheduled job: GSC Sync');
    jobQueue.enqueue('gsc_sync', { source: 'scheduler' });
  });

  // 4. Weekly on Tuesday 3 AM IST (21:30 UTC Monday): Competitor Gap Finder
  // Cron expression: 30 21 * * 1
  cron.schedule('30 21 * * 1', () => {
    console.log('Running scheduled job: Competitor Gap Finder');
    jobQueue.enqueue('competitor_gap_finder', { source: 'scheduler' });
  });
}

module.exports = {
  init
};
