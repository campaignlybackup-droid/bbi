/**
 * BBI - SEO Scheduler
 * Registers recurring jobs for programmatic SEO freshness and discovery dynamically from the database.
 */

const cron = require('node-cron');
const db = require('../config/db');
const jobQueue = require('./ai/jobQueue');

// Store active cron tasks so we can stop/restart them dynamically
const activeCronTasks = new Map();

/**
 * Initializes all cron jobs from the database.
 */
function init() {
  reloadAllJobs();
}

/**
 * Stops all active cron jobs and reloads them from the database.
 */
function reloadAllJobs() {
  // Stop existing
  activeCronTasks.forEach(task => task.stop());
  activeCronTasks.clear();

  try {
    const jobs = db.prepare(`SELECT * FROM scheduled_jobs WHERE is_active = 1`).all();
    
    jobs.forEach(job => {
      const task = cron.schedule(job.cron_expression, () => {
        console.log(`[Scheduler] Running job: ${job.name}`);
        executeJobAction(job);
      });
      activeCronTasks.set(job.id, task);
    });
    
    console.log(`[Scheduler] Loaded ${jobs.length} active jobs from database.`);
  } catch (e) {
    console.error('[Scheduler] Failed to load jobs:', e);
  }
}

/**
 * Executes the specific logic for a job type.
 * @param {Object} job 
 */
function executeJobAction(job) {
  try {
    switch (job.job_type) {
      case 'import_businesses_top':
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
        break;

      case 'stale_content_regen':
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
        break;

      case 'gsc_sync':
        jobQueue.enqueue('gsc_sync', { source: 'scheduler' });
        break;

      case 'competitor_gap_finder':
        jobQueue.enqueue('competitor_gap_finder', { source: 'scheduler' });
        break;
        
      default:
        console.warn(`[Scheduler] Unknown job_type: ${job.job_type}`);
    }
  } catch (e) {
    console.error(`[Scheduler] Error executing job ${job.name}:`, e);
  }
}

module.exports = {
  init,
  reloadAllJobs,
  executeJobAction
};
