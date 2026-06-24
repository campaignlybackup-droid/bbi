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
  const jobQueue = require('../../services/ai/jobQueue');
  jobQueue.enqueue(`generate_${entity_type}_content`, { id: entity_id });
  req.flash('success', `AI generation queued for ${entity_type} ID ${entity_id}`);
  res.redirect('back');
});

module.exports = router;
