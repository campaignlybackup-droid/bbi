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
