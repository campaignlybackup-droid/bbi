const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const placesService = require('../services/placesService');

router.get('/', requireAuth, (req, res) => {
  const cities = db.prepare('SELECT * FROM cities WHERE active=1 ORDER BY name').all();
  const categories = db.prepare('SELECT * FROM categories WHERE active=1 ORDER BY name').all();
  
  res.render('admin/discovery', {
    cities, categories, results: null, error: null,
    title: 'Market Discovery', admin: req.session,
    flash: { success: req.flash('success'), error: req.flash('error') }
  });
});

router.post('/search', requireAuth, async (req, res) => {
  const { city_id, category_id } = req.body;
  try {
    const discovery = await placesService.discoverMissingBusinesses(city_id, category_id);
    
    const cities = db.prepare('SELECT * FROM cities WHERE active=1 ORDER BY name').all();
    const categories = db.prepare('SELECT * FROM categories WHERE active=1 ORDER BY name').all();

    res.render('admin/discovery', {
      cities, categories,
      results: discovery.results || [],
      currentCity: discovery.city,
      currentCategory: discovery.category,
      error: discovery.error,
      title: 'Market Discovery Results', admin: req.session,
      flash: { success: req.flash('success'), error: req.flash('error') }
    });
  } catch (error) {
    req.flash('error', error.message);
    res.redirect('/admin/discovery');
  }
});

router.post('/import', requireAuth, async (req, res) => {
  const { place_ids, city_id, category_id } = req.body;
  
  if (!place_ids || !city_id || !category_id) {
    req.flash('error', 'Missing parameters for import');
    return res.redirect('/admin/discovery');
  }
  
  const idsToImport = Array.isArray(place_ids) ? place_ids : [place_ids];
  let successCount = 0;
  let failCount = 0;
  
  for (const placeId of idsToImport) {
    try {
      const result = await placesService.importAndAutomatePlace(placeId, city_id, category_id, req.session.adminId);
      if (result.success) successCount++;
      else failCount++;
    } catch (e) {
      failCount++;
      console.error('Import failed for', placeId, e.message);
    }
  }
  
  req.flash('success', `Successfully imported ${successCount} businesses and queued them for AI automation.`);
  if (failCount > 0) req.flash('error', `Failed to import ${failCount} businesses.`);
  
  res.redirect('/admin/discovery');
});

module.exports = router;
