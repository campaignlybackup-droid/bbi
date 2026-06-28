const express = require('express');
const router = express.Router();
const db = require('../config/db');
const slugify = require('slugify');

// ============================================
// DASHBOARD
// ============================================
router.get('/', (req, res) => {
  const stats = {
    states: db.prepare(`SELECT COUNT(*) as c FROM states`).get().c,
    areas: db.prepare(`SELECT COUNT(*) as c FROM areas`).get().c,
    useCases: db.prepare(`SELECT COUNT(*) as c FROM use_cases`).get().c,
    variations: db.prepare(`SELECT COUNT(*) as c FROM seo_variations`).get().c,
    templates: db.prepare(`SELECT COUNT(*) as c FROM seo_templates`).get().c,
  };

  res.render('admin/seo-engine-dashboard', { 
    title: 'Programmatic SEO Manager', 
    stats,
    admin: req.session,
    flash: { success: req.flash('success'), error: req.flash('error') }
  });
});

// ============================================
// FIX MIGRATIONS (For Shared Hosting)
// ============================================
router.get('/run-migrations', (req, res) => {
  try {
    db.exec(`
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
    
    // Reload scheduler with new table
    require('../services/seoScheduler').reloadAllJobs();

    req.flash('success', 'Database successfully migrated! The new tables are ready.');
    res.redirect('/admin/seo-engine');
  } catch (e) {
    req.flash('error', 'Migration failed: ' + e.message);
    res.redirect('/admin/seo-engine');
  }
});

// ============================================
// CONFLICT DETECTOR
// ============================================
router.get('/conflicts', (req, res) => {
  const seoConflictService = require('../services/seoConflictService');
  const conflicts = seoConflictService.detectConflicts();
  res.render('admin/seo-conflicts', {
    title: 'SEO Conflicts',
    conflicts,
    admin: req.session,
    flash: { success: req.flash('success'), error: req.flash('error') }
  });
});

// ============================================
// GAPS AND JOBS
// ============================================
router.get('/gaps', (req, res) => {
  const gaps = db.prepare(`SELECT * FROM seo_gaps WHERE status='pending' ORDER BY discovered_at DESC`).all();
  res.render('admin/seo-gaps', {
    title: 'Competitor Gaps',
    gaps,
    admin: req.session,
    flash: { success: req.flash('success'), error: req.flash('error') }
  });
});

router.post('/gaps/:id/create', (req, res) => {
  // Mark gap as resolved and enqueue AI job
  db.prepare(`UPDATE seo_gaps SET status='resolved' WHERE id=?`).run(req.params.id);
  const gap = db.prepare(`SELECT * FROM seo_gaps WHERE id=?`).get(req.params.id);
  if (gap) {
    const jobQueue = require('../services/ai/jobQueue');
    jobQueue.enqueue('generate_area_category_content', { area_slug: gap.area_slug, cat_slug: gap.category_slug });
    req.flash('success', 'Page creation and content generation queued.');
  }
  res.redirect('/admin/seo-engine/gaps');
});

router.get('/jobs', (req, res) => {
  const jobs = db.prepare(`SELECT * FROM scheduled_jobs ORDER BY created_at ASC`).all();
  res.render('admin/scheduled-jobs', {
    title: 'Scheduled Jobs',
    jobs,
    admin: req.session,
    flash: { success: req.flash('success'), error: req.flash('error') }
  });
});

router.post('/jobs/add', (req, res) => {
  try {
    const { name, description, cron_expression, job_type } = req.body;
    db.prepare(`INSERT INTO scheduled_jobs (name, description, cron_expression, job_type) VALUES (?, ?, ?, ?)`).run(name, description, cron_expression, job_type);
    require('../../services/seoScheduler').reloadAllJobs();
    req.flash('success', 'Job added and scheduler reloaded.');
  } catch (e) {
    req.flash('error', e.message);
  }
  res.redirect('/admin/seo-engine/jobs');
});

router.post('/jobs/:id/edit', (req, res) => {
  try {
    const { name, description, cron_expression, job_type } = req.body;
    db.prepare(`UPDATE scheduled_jobs SET name=?, description=?, cron_expression=?, job_type=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(name, description, cron_expression, job_type, req.params.id);
    require('../../services/seoScheduler').reloadAllJobs();
    req.flash('success', 'Job updated and scheduler reloaded.');
  } catch (e) {
    req.flash('error', e.message);
  }
  res.redirect('/admin/seo-engine/jobs');
});

router.post('/jobs/:id/toggle', (req, res) => {
  try {
    const job = db.prepare(`SELECT is_active FROM scheduled_jobs WHERE id=?`).get(req.params.id);
    const newStatus = job.is_active ? 0 : 1;
    db.prepare(`UPDATE scheduled_jobs SET is_active=? WHERE id=?`).run(newStatus, req.params.id);
    require('../../services/seoScheduler').reloadAllJobs();
    req.flash('success', `Job turned ${newStatus ? 'ON' : 'OFF'}.`);
  } catch (e) {
    req.flash('error', e.message);
  }
  res.redirect('/admin/seo-engine/jobs');
});

router.post('/jobs/:id/run', (req, res) => {
  try {
    const job = db.prepare(`SELECT * FROM scheduled_jobs WHERE id=?`).get(req.params.id);
    if (job) {
      require('../../services/seoScheduler').executeJobAction(job);
      req.flash('success', 'Job execution triggered manually.');
    }
  } catch (e) {
    req.flash('error', e.message);
  }
  res.redirect('/admin/seo-engine/jobs');
});

// ============================================
// STATES
// ============================================
router.get('/states', (req, res) => {
  const states = db.prepare(`SELECT * FROM states ORDER BY name`).all();
  res.render('admin/seo-states', { 
    title: 'Manage States', 
    states,
    admin: req.session,
    flash: { success: req.flash('success'), error: req.flash('error') }
  });
});

router.post('/states', (req, res) => {
  const { name, description, meta_description } = req.body;
  const slug = slugify(name, { lower: true, strict: true });
  db.prepare(`INSERT INTO states (name, slug, description, meta_description) VALUES (?, ?, ?, ?)`).run(name, slug, description, meta_description);
  req.flash('success', 'State added successfully.');
  res.redirect('/admin/seo-engine/states');
});

// ============================================
// AREAS
// ============================================
router.get('/areas', (req, res) => {
  const areas = db.prepare(`SELECT a.*, c.name as city_name FROM areas a JOIN cities c ON c.id = a.city_id ORDER BY a.name`).all();
  const cities = db.prepare(`SELECT id, name FROM cities WHERE active=1 ORDER BY name`).all();
  res.render('admin/seo-areas', { 
    title: 'Manage Areas', 
    areas, 
    cities,
    admin: req.session,
    flash: { success: req.flash('success'), error: req.flash('error') }
  });
});

router.post('/areas', (req, res) => {
  const { name, city_id } = req.body;
  const city = db.prepare(`SELECT slug FROM cities WHERE id=?`).get(city_id);
  const slug = `${slugify(name, { lower: true, strict: true })}-${city.slug}`;
  db.prepare(`INSERT INTO areas (name, slug, city_id) VALUES (?, ?, ?)`).run(name, slug, city_id);
  req.flash('success', 'Area added successfully.');
  res.redirect('/admin/seo-engine/areas');
});

// ============================================
// USE CASES
// ============================================
router.get('/use-cases', (req, res) => {
  const useCases = db.prepare(`SELECT u.*, c.name as cat_name FROM use_cases u JOIN categories c ON c.id = u.category_id ORDER BY u.name`).all();
  const categories = db.prepare(`SELECT id, name FROM categories WHERE active=1 ORDER BY name`).all();
  res.render('admin/seo-usecases', { 
    title: 'Manage Use Cases', 
    useCases, 
    categories,
    admin: req.session,
    flash: { success: req.flash('success'), error: req.flash('error') }
  });
});

router.post('/use-cases', (req, res) => {
  const { name, category_id } = req.body;
  const slug = slugify(name, { lower: true, strict: true });
  db.prepare(`INSERT INTO use_cases (name, slug, category_id) VALUES (?, ?, ?)`).run(name, slug, category_id);
  req.flash('success', 'Use Case added successfully.');
  res.redirect('/admin/seo-engine/use-cases');
});

// ============================================
// VARIATIONS
// ============================================
router.get('/variations', (req, res) => {
  const variations = db.prepare(`SELECT * FROM seo_variations ORDER BY created_at DESC`).all();
  res.render('admin/seo-variations', { 
    title: 'SEO Variations Engine', 
    variations,
    admin: req.session,
    flash: { success: req.flash('success'), error: req.flash('error') }
  });
});

router.post('/variations', (req, res) => {
  const { primary_url, variation_slug, mode, title, meta_description, h1, content } = req.body;
  const slug = slugify(variation_slug, { lower: true, strict: true });
  db.prepare(`
    INSERT INTO seo_variations (primary_url, variation_slug, mode, title, meta_description, h1, content)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(primary_url, slug, mode, title, meta_description, h1, content);
  req.flash('success', 'Variation created.');
  res.redirect('/admin/seo-engine/variations');
});

// ============================================
// AI GENERATION TRIGGERS
// ============================================
router.post('/generate-content', (req, res) => {
  const { entity_type, entity_id } = req.body;
  // Push to jobQueue
  const jobQueue = require('../services/ai/jobQueue');
  jobQueue.enqueue(`generate_${entity_type}_content`, { id: entity_id });
  req.flash('success', `AI generation queued for ${entity_type} ID ${entity_id}`);
  res.redirect('back');
});

module.exports = router;
