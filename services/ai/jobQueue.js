/**
 * BBI — AI Job Queue
 * SQLite-backed job queue — no Redis dependency.
 * Processes AI jobs asynchronously with retry and backoff.
 */

const db = require('../../config/db');
const { AI_JOB_STATUS } = require('../../config/constants');

/**
 * Add a job to the queue.
 */
function enqueue(jobType, payload = {}) {
  try {
    const result = db.prepare(`
      INSERT INTO ai_jobs (job_type, payload, status) VALUES (?, ?, ?)
    `).run(jobType, JSON.stringify(payload), AI_JOB_STATUS.QUEUED);
    return result.lastInsertRowid;
  } catch (e) {
    console.error('Failed to enqueue AI job:', e.message);
    return null;
  }
}

/**
 * Get the next queued job and mark it as processing.
 */
function dequeue() {
  try {
    const job = db.prepare(`
      SELECT * FROM ai_jobs
      WHERE status = ? AND attempts < max_attempts
      ORDER BY created_at ASC LIMIT 1
    `).get(AI_JOB_STATUS.QUEUED);

    if (job) {
      db.prepare(`
        UPDATE ai_jobs SET status = ?, started_at = CURRENT_TIMESTAMP, attempts = attempts + 1
        WHERE id = ?
      `).run(AI_JOB_STATUS.PROCESSING, job.id);

      return { ...job, payload: JSON.parse(job.payload || '{}') };
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Mark a job as completed with result.
 */
function complete(jobId, result = {}) {
  db.prepare(`
    UPDATE ai_jobs SET status = ?, result = ?, completed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(AI_JOB_STATUS.COMPLETED, JSON.stringify(result), jobId);
}

/**
 * Mark a job as failed with error.
 */
function fail(jobId, error) {
  const job = db.prepare(`SELECT attempts, max_attempts FROM ai_jobs WHERE id = ?`).get(jobId);
  const newStatus = (job && job.attempts >= job.max_attempts) ? AI_JOB_STATUS.FAILED : AI_JOB_STATUS.QUEUED;

  db.prepare(`
    UPDATE ai_jobs SET status = ?, error = ? WHERE id = ?
  `).run(newStatus, error, jobId);
}

/**
 * Get job status.
 */
function getStatus(jobId) {
  return db.prepare(`SELECT * FROM ai_jobs WHERE id = ?`).get(jobId);
}

/**
 * Get all jobs, optionally filtered by status.
 */
function getQueue(status = null, limit = 50) {
  if (status) {
    return db.prepare(`SELECT * FROM ai_jobs WHERE status = ? ORDER BY created_at DESC LIMIT ?`).all(status, limit);
  }
  return db.prepare(`SELECT * FROM ai_jobs ORDER BY created_at DESC LIMIT ?`).all(limit);
}

/**
 * Get queue stats.
 */
function getQueueStats() {
  try {
    return {
      queued: db.prepare(`SELECT COUNT(*) as c FROM ai_jobs WHERE status='queued'`).get().c,
      processing: db.prepare(`SELECT COUNT(*) as c FROM ai_jobs WHERE status='processing'`).get().c,
      completed: db.prepare(`SELECT COUNT(*) as c FROM ai_jobs WHERE status='completed'`).get().c,
      failed: db.prepare(`SELECT COUNT(*) as c FROM ai_jobs WHERE status='failed'`).get().c,
    };
  } catch (e) {
    return { queued: 0, processing: 0, completed: 0, failed: 0 };
  }
}

/**
 * Process the next job in the queue using the AI provider.
 */
async function processNext(provider) {
  const job = dequeue();
  if (!job) return null;

  try {
    let result;
    switch (job.job_type) {
      case 'listing_generate':
        result = await provider.generateListingContent(job.payload);
        break;
      case 'faq_generate':
        result = await provider.generateFaqContent(job.payload);
        break;
      case 'seo_generate':
        result = await provider.generateSeoContent(job.payload.pageType, job.payload);
        break;
      case 'digest_generate':
        result = await provider.generateDigest(job.payload);
        break;
      case 'social_generate':
        result = await provider.generateSocialContent(job.payload.business, job.payload.rankData);
        break;
      case 'moderation_check':
        result = await provider.moderateContent(job.payload.text);
        break;
      case 'import_content_generate':
        result = await provider.generateImportContent(job.payload);
        // Post-process: store generated content in the database
        if (result && job.payload.business_id) {
          try {
            const bizId = job.payload.business_id;
            const importId = job.payload.import_id;

            // Update business with generated description, tags
            if (result.description || result.tags) {
              db.prepare(`
                UPDATE businesses SET
                  description = COALESCE(?, description),
                  tags = COALESCE(?, tags),
                  updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
              `).run(result.description || null, result.tags || null, bizId);

              // Update FTS index with new description
              try {
                db.prepare(`INSERT OR REPLACE INTO businesses_fts(rowid, name, description, tags) 
                  SELECT id, name, description, tags FROM businesses WHERE id = ?`).run(bizId);
              } catch (e) { /* FTS update non-critical */ }
            }

            // Store SEO content
            if (result.seo_title || result.meta_description) {
              const seoService = require('../seoService');
              seoService.saveSeoContent('business', bizId, {
                title: result.seo_title || '',
                meta_description: result.meta_description || '',
                editorial_content: result.description || '',
                ai_summary: result.summary || '',
                faq_json: result.faqs ? JSON.stringify(result.faqs) : '[]',
              });
            }

            // Store FAQs in dedicated table
            if (result.faqs && Array.isArray(result.faqs)) {
              const insertFaq = db.prepare(`
                INSERT INTO faqs (page_type, entity_id, question, answer, sort_order, active)
                VALUES ('business', ?, ?, ?, ?, 1)
              `);
              result.faqs.forEach((faq, i) => {
                try {
                  insertFaq.run(bizId, faq.question, faq.answer, i);
                } catch (e) { /* duplicate FAQ — ignore */ }
              });
            }

            // Update import row status
            if (importId) {
              db.prepare(`
                UPDATE csv_import_rows SET seo_status = 'completed', content_status = 'completed'
                WHERE import_id = ? AND business_id = ?
              `).run(importId, bizId);
            }

            // Google Indexing API Ping
            const settingsService = require('../../services/settingsService');
            if (settingsService.getSetting('auto_ping_indexing') === 'true') {
              const googleApiService = require('../../services/googleApiService');
              const bizObj = db.prepare('SELECT slug FROM businesses WHERE id = ?').get(bizId);
              if (bizObj && bizObj.slug) {
                const url = `${process.env.BASE_URL || 'https://bharatbusinessindex.com'}/business/${bizObj.slug}`;
                googleApiService.pingIndexingApi(url, 'URL_UPDATED').catch(console.error);
              }
            }

            // Trigger Ranking Recalculation so it instantly appears on the combo page
            if (job.payload.city_id && job.payload.category_id) {
              const rankingService = require('../rankingService');
              rankingService.recalculateRankings(job.payload.city_id, job.payload.category_id);
            }

          } catch (postErr) {
            console.error('Import content post-processing failed:', postErr.message);
          }
        }
        break;
      case 'combo_seo_generate':
        result = await provider.generateComboSeoContent(job.payload);
        if (result && job.payload.city_id && job.payload.cat_id) {
          try {
            const seoService = require('../seoService');
            seoService.saveSeoContent('ranking', job.payload.city_id, {
              title: result.seo_title || '',
              meta_description: result.meta_description || '',
              editorial_content: result.editorial_content || '',
              ai_summary: '',
              faq_json: result.faqs ? JSON.stringify(result.faqs) : '[]',
            }, job.payload.cat_id);

            // Google Indexing API Ping for Combo Page
            const settingsService = require('../../services/settingsService');
            if (settingsService.getSetting('auto_ping_indexing') === 'true') {
              const googleApiService = require('../../services/googleApiService');
              const url = `${process.env.BASE_URL || 'https://bharatbusinessindex.com'}/rankings/${job.payload.city_slug}/${job.payload.cat_slug}`;
              googleApiService.pingIndexingApi(url, 'URL_UPDATED').catch(console.error);
            }
          } catch (postErr) {
            console.error('Combo SEO post-processing failed:', postErr.message);
          }
        }
        break;
      default:
        result = { message: 'Unknown job type' };
    }
    complete(job.id, result);
    return { job, result };
  } catch (e) {
    fail(job.id, e.message);
    return { job, error: e.message };
  }
}

/**
 * Clean up old completed/failed jobs.
 */
function cleanup(daysOld = 30) {
  db.prepare(`DELETE FROM ai_jobs WHERE status IN ('completed','failed') AND created_at < datetime('now', '-' || ? || ' days')`).run(daysOld);
}

module.exports = {
  enqueue,
  dequeue,
  complete,
  fail,
  getStatus,
  getQueue,
  getQueueStats,
  processNext,
  cleanup,
};
