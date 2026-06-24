const express = require('express');
const router = express.Router();
const db = require('../config/db');
const jobQueue = require('../services/ai/jobQueue');

// ============================================
// HIERARCHY MANAGER
// ============================================
router.get('/', (req, res) => {
  const cities = db.prepare('SELECT * FROM cities ORDER BY name').all();
  const areas = db.prepare('SELECT * FROM areas ORDER BY name').all();
  
  // Find which categories exist in which areas
  const areaCategories = db.prepare(`
    SELECT DISTINCT b.area_id, c.id, c.name, c.slug 
    FROM businesses b
    JOIN categories c ON c.id = b.category_id
    WHERE b.area_id IS NOT NULL AND b.active = 1
  `).all();

  // Find counts of businesses for AI generation buttons
  const bizCounts = db.prepare(`
    SELECT area_id, category_id, COUNT(*) as count 
    FROM businesses 
    WHERE active = 1 AND area_id IS NOT NULL
    GROUP BY area_id, category_id
  `).all();

  res.render('admin/hierarchy', {
    title: 'Hierarchy Manager',
    admin: req.session,
    cities,
    areas,
    areaCategories,
    bizCounts,
    flash: { success: req.flash('success'), error: req.flash('error') }
  });
});

// ============================================
// AI SEO GENERATION
// ============================================
router.post('/generate', (req, res) => {
  const { type, entity_id, secondary_id } = req.body;
  
  if (type === 'city') {
    jobQueue.enqueue('generate_city_seo', { id: entity_id });
    req.flash('success', `AI generation queued for City ID ${entity_id}`);
  } else if (type === 'area') {
    jobQueue.enqueue('generate_area_seo', { id: entity_id });
    req.flash('success', `AI generation queued for Locality ID ${entity_id}`);
  } else if (type === 'area_category') {
    jobQueue.enqueue('generate_area_category_seo', { area_id: entity_id, category_id: secondary_id });
    req.flash('success', `AI generation queued for Locality/Category combination.`);
  }

  res.redirect('/admin/hierarchy');
});

// ============================================
// AI BUSINESS IMPORT
// ============================================
router.post('/import-businesses', (req, res) => {
  const { area_id, category_id } = req.body;
  
  // Enqueue a background job for Google Places search
  jobQueue.enqueue('import_businesses', { area_id, category_id });
  req.flash('success', `AI Business Import queued. The system will search and import businesses into this Locality & Category.`);
  
  res.redirect('/admin/hierarchy');
});

module.exports = router;
