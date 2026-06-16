/**
 * BBI — Admin Routes
 * Extended with inquiries, claims, SEO, sponsored, analytics management.
 * Fixes M-06 (manual boost), M-08 (inquiry workflow).
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');
const { recalculateRankings, calculateScoreComponents } = require('../services/rankingService');
const inquiryService = require('../services/inquiryService');
const claimService = require('../services/claimService');
const analyticsService = require('../services/analyticsService');
const searchService = require('../services/searchService');
const blogService = require('../services/blogService');
const faqService = require('../services/faqService');
const placesService = require('../services/placesService');
const seoService = require('../services/seoService');
const digestService = require('../services/digestService');
const customRankingService = require('../services/customRankingService');
const settingsService = require('../services/settingsService');
const googleApiService = require('../services/googleApiService');
const jobQueue = require('../services/ai/jobQueue');
const aiProvider = require('../services/ai/index').getProvider();

// ============================================
// LOGIN
// ============================================
router.get('/login', (req, res) => {
  if (req.session.adminId) return res.redirect('/admin');
  res.render('admin/login', { title: 'Admin Login', error: req.flash('error'), success: req.flash('success') });
});

router.post('/login', (req, res, next) => {
  try {
    const { email, password } = req.body;
    const admin = db.prepare(`SELECT * FROM admins WHERE email=?`).get(email);
    if (!admin || !bcrypt.compareSync(password, admin.password)) {
      req.flash('error', 'Invalid email or password.');
      return res.redirect('/admin/login');
    }
    req.session.adminId = admin.id;
    req.session.adminName = admin.name;
    req.session.adminRole = admin.role;
    req.session.save((err) => {
      if (err) return next(err);
      res.redirect('/admin');
    });
  } catch (err) {
    next(err);
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// ============================================
// DASHBOARD
// ============================================
router.get('/', requireAuth, (req, res) => {
  const stats = {
    businesses: db.prepare(`SELECT COUNT(*) as c FROM businesses WHERE active=1`).get().c,
    cities: db.prepare(`SELECT COUNT(*) as c FROM cities WHERE active=1`).get().c,
    categories: db.prepare(`SELECT COUNT(*) as c FROM categories WHERE active=1`).get().c,
    rankings: db.prepare(`SELECT COUNT(*) as c FROM ranking_history`).get().c,
    verified: db.prepare(`SELECT COUNT(*) as c FROM businesses WHERE verified=1`).get().c,
    sponsored: db.prepare(`SELECT COUNT(*) as c FROM businesses WHERE sponsored=1`).get().c,
  };

  // Get inquiry and claim counts
  let inquiryStats = { pending: 0 };
  let claimStats = { pending: 0 };
  let dashboardAnalytics = { viewsToday: 0, viewsWeek: 0, searchesToday: 0 };
  let aiStats = { queued: 0, processing: 0, completed: 0, failed: 0 };

  try { inquiryStats = inquiryService.getInquiryStats(); } catch (e) {}
  try { claimStats = claimService.getClaimStats(); } catch (e) {}
  try { dashboardAnalytics = analyticsService.getDashboardStats(); } catch (e) {}
  try { aiStats = jobQueue.getQueueStats(); } catch (e) {}

  const recent = db.prepare(`
    SELECT b.name, b.slug, c.name as city, cat.name as category, b.created_at
    FROM businesses b
    JOIN cities c ON c.id=b.city_id
    JOIN categories cat ON cat.id=b.category_id
    ORDER BY b.created_at DESC LIMIT 5
  `).all();

  res.render('admin/dashboard', {
    stats, recent, inquiryStats, claimStats, dashboardAnalytics, aiStats,
    title: 'Dashboard', admin: req.session,
    flash: { success: req.flash('success'), error: req.flash('error') }
  });
});

// ============================================
// BUSINESSES
// ============================================
router.get('/businesses', requireAuth, (req, res) => {
  const search = req.query.search || '';
  const city_id = req.query.city || '';
  const cat_id = req.query.cat || '';
  let query = `
    SELECT b.*, c.name as city_name, cat.name as cat_name,
           rs.final_score,
           (SELECT rank_position FROM ranking_history WHERE business_id=b.id ORDER BY ranking_date DESC LIMIT 1) as current_rank
    FROM businesses b
    LEFT JOIN cities c ON c.id=b.city_id
    LEFT JOIN categories cat ON cat.id=b.category_id
    LEFT JOIN ranking_scores rs ON rs.business_id=b.id
    WHERE b.active=1
  `;
  const params = [];
  if (search) { query += ` AND b.name LIKE ?`; params.push(`%${search}%`); }
  if (city_id) { query += ` AND b.city_id=?`; params.push(city_id); }
  if (cat_id) { query += ` AND b.category_id=?`; params.push(cat_id); }
  query += ` ORDER BY b.name ASC`;

  const businesses = db.prepare(query).all(...params);
  const cities = db.prepare(`SELECT * FROM cities WHERE active=1 ORDER BY name`).all();
  const categories = db.prepare(`SELECT * FROM categories WHERE active=1 ORDER BY name`).all();
  res.render('admin/businesses', { businesses, cities, categories, search, city_id, cat_id, title: 'Businesses', admin: req.session, flash: { error: req.flash('error'), success: req.flash('success') } });
});

router.get('/businesses/new', requireAuth, (req, res) => {
  const cities = db.prepare(`SELECT * FROM cities WHERE active=1 ORDER BY name`).all();
  const categories = db.prepare(`SELECT * FROM categories WHERE active=1 ORDER BY name`).all();
  res.render('admin/business-form', { business: null, scores: null, cities, categories, title: 'Add Business', admin: req.session, flash: { error: req.flash('error') } });
});

router.post('/businesses', requireAuth, (req, res) => {
  const { name, category_id, city_id, address, phone, website, description, google_rating, google_review_count, verified, sponsored, tags, custom_attributes } = req.body;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  try {
    const bizId = db.prepare(`
      INSERT INTO businesses (name,slug,category_id,city_id,address,phone,website,description,google_rating,google_review_count,verified,sponsored,tags,custom_attributes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(name, slug, category_id, city_id, address, phone, website, description,
      parseFloat(google_rating)||0, parseInt(google_review_count)||0, verified?1:0, sponsored?1:0, tags||'', custom_attributes||'[]'
    ).lastInsertRowid;

    const components = calculateScoreComponents({
      website, verified: verified?1:0, description, phone, address,
      google_rating: parseFloat(google_rating)||0,
      google_review_count: parseInt(google_review_count)||0,
    });

    db.prepare(`
      INSERT INTO ranking_scores (business_id,review_score,volume_score,website_score,completeness_score,verified_score,editorial_score,auto_score,manual_boost,final_score)
      VALUES (?,?,?,?,?,?,0,?,0,?)
      ON CONFLICT(business_id) DO UPDATE SET
        review_score=excluded.review_score, volume_score=excluded.volume_score,
        website_score=excluded.website_score, completeness_score=excluded.completeness_score,
        verified_score=excluded.verified_score, auto_score=excluded.auto_score,
        final_score=excluded.final_score, last_calculated=CURRENT_TIMESTAMP
    `).run(bizId, components.review_score, components.volume_score, components.website_score,
      components.completeness_score, components.verified_score, components.auto_score, components.auto_score);

    // Update FTS
    searchService.updateFtsForBusiness(bizId);

    // AI Automation
    const bInfo = db.prepare(`
      SELECT b.name, c.name as city_name, cat.name as cat_name 
      FROM businesses b
      LEFT JOIN cities c ON c.id = b.city_id
      LEFT JOIN categories cat ON cat.id = b.category_id
      WHERE b.id = ?
    `).get(bizId);
    if (bInfo) {
      jobQueue.enqueue('listing_generate', bInfo);
      jobQueue.enqueue('faq_generate', bInfo);
    }

    // Ping Google Indexing API asynchronously (fire and forget)
    if (settingsService.getSetting('auto_ping_indexing') === 'true') {
      const bizUrl = `${process.env.BASE_URL || 'https://bharatbusinessindex.com'}/business/${slug}`;
      googleApiService.pingIndexingApi(bizUrl, 'URL_UPDATED').catch(console.error);
    }

    req.flash('success', 'Business added successfully.');
  } catch(e) {
    req.flash('error', 'Error: ' + e.message);
  }
  res.redirect('/admin/businesses');
});

// Quick Edit POST
router.post('/businesses/:id/quick-edit', requireAuth, (req, res) => {
  try {
    const { city_id, category_id, tags } = req.body;
    db.prepare(`UPDATE businesses SET city_id = ?, category_id = ?, tags = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(city_id, category_id, tags || '', req.params.id);
    
    // Update FTS index silently
    require('../services/searchService').updateFtsForBusiness(req.params.id);
    
    req.flash('success', 'Business updated successfully.');
  } catch(e) {
    req.flash('error', e.message);
  }
  res.redirect('/admin/businesses');
});

router.get('/businesses/:id/edit', requireAuth, (req, res) => {
  const business = db.prepare(`SELECT * FROM businesses WHERE id=?`).get(req.params.id);
  const scores = db.prepare(`SELECT * FROM ranking_scores WHERE business_id=?`).get(req.params.id);
  const cities = db.prepare(`SELECT * FROM cities WHERE active=1 ORDER BY name`).all();
  const categories = db.prepare(`SELECT * FROM categories WHERE active=1 ORDER BY name`).all();
  if (!business) return res.redirect('/admin/businesses');
  res.render('admin/business-form', { business, scores, cities, categories, title: 'Edit Business', admin: req.session, flash: { error: req.flash('error') } });
});

router.post('/businesses/:id', requireAuth, (req, res) => {
  const { name, category_id, city_id, address, phone, website, description, google_rating, google_review_count, verified, sponsored, editorial_score, manual_boost, tags, custom_attributes } = req.body;
  db.prepare(`
    UPDATE businesses SET name=?,category_id=?,city_id=?,address=?,phone=?,website=?,description=?,
    google_rating=?,google_review_count=?,verified=?,sponsored=?,tags=?,custom_attributes=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(name, category_id, city_id, address, phone, website, description,
    parseFloat(google_rating)||0, parseInt(google_review_count)||0, verified?1:0, sponsored?1:0, tags||'', custom_attributes||'[]', req.params.id);

  // M-06: Fix — properly calculate and save all score components including manual_boost
  const components = calculateScoreComponents({
    website, verified: verified?1:0, description, phone, address,
    google_rating: parseFloat(google_rating)||0,
    google_review_count: parseInt(google_review_count)||0,
  });
  const ed = parseFloat(editorial_score)||0;
  const boost = parseFloat(manual_boost)||0;
  const final = Math.min(components.auto_score + ed + boost, 100);

  db.prepare(`
    INSERT INTO ranking_scores (business_id,review_score,volume_score,website_score,completeness_score,verified_score,editorial_score,auto_score,manual_boost,final_score)
    VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(business_id) DO UPDATE SET
      review_score=excluded.review_score, volume_score=excluded.volume_score,
      website_score=excluded.website_score, completeness_score=excluded.completeness_score,
      verified_score=excluded.verified_score, editorial_score=excluded.editorial_score,
      auto_score=excluded.auto_score, manual_boost=excluded.manual_boost,
      final_score=excluded.final_score, last_calculated=CURRENT_TIMESTAMP
  `).run(req.params.id, components.review_score, components.volume_score, components.website_score,
    components.completeness_score, components.verified_score, ed, components.auto_score, boost, final);

  // Update FTS
  searchService.updateFtsForBusiness(parseInt(req.params.id));

  req.flash('success', 'Business updated.');
  res.redirect('/admin/businesses');
});

router.post('/businesses/:id/delete', requireAuth, (req, res) => {
  db.prepare(`UPDATE businesses SET active=0 WHERE id=?`).run(req.params.id);
  req.flash('success', 'Business removed.');
  res.redirect('/admin/businesses');
});

// ============================================
// API: GOOGLE PLACES AUTOFILL
// ============================================
router.post('/api/places/autofill', requireAuth, async (req, res) => {
  try {
    const { query, location } = req.body;
    if (!query) return res.status(400).json({ error: 'Query is required' });

    if (!placesService.isConfigured()) {
      return res.status(400).json({ error: 'Google Places API key is not configured.' });
    }

    const searchResult = await placesService.searchPlaces(query, location || '');
    if (searchResult.error || !searchResult.results || searchResult.results.length === 0) {
      return res.status(404).json({ error: searchResult.error || 'No business found on Google Maps.' });
    }

    const bestMatch = searchResult.results[0];
    const details = await placesService.getPlaceDetails(bestMatch.place_id);

    if (!details) {
      return res.status(404).json({ error: 'Could not fetch details for this business.' });
    }

    res.json({ success: true, data: details });
  } catch (error) {
    console.error('Places API AutoFill Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// RANKINGS
// ============================================
router.get('/rankings', requireAuth, (req, res) => {
  const cities = db.prepare(`SELECT * FROM cities WHERE active=1 ORDER BY name`).all();
  const categories = db.prepare(`SELECT * FROM categories WHERE active=1 ORDER BY name`).all();
  res.render('admin/rankings', { cities, categories, title: 'Rankings', admin: req.session, flash: { success: req.flash('success'), error: req.flash('error') } });
});

router.post('/rankings/recalculate', requireAuth, (req, res) => {
  const { city_id, category_id } = req.body;
  try {
    recalculateRankings(parseInt(city_id), parseInt(category_id));
    req.flash('success', 'Rankings recalculated successfully.');
  } catch(e) {
    req.flash('error', e.message);
  }
  res.redirect('/admin/rankings');
});

router.get('/rankings/history', requireAuth, (req, res) => {
  const history = db.prepare(`
    SELECT rh.*, b.name as biz_name, c.name as city_name, cat.name as cat_name
    FROM ranking_history rh
    JOIN businesses b ON b.id=rh.business_id
    JOIN cities c ON c.id=rh.city_id
    JOIN categories cat ON cat.id=rh.category_id
    ORDER BY rh.created_at DESC LIMIT 100
  `).all();
  res.render('admin/ranking-history', { history, title: 'Ranking History', admin: req.session, flash: { success: req.flash('success'), error: req.flash('error') } });
});

// ============================================
// CUSTOM RANKING PAGES
// ============================================
router.get('/custom-rankings', requireAuth, (req, res) => {
  const pages = customRankingService.getAllPages();
  res.render('admin/custom-rankings-list', { pages, title: 'Custom Ranking Pages', admin: req.session, flash: { success: req.flash('success'), error: req.flash('error') } });
});

router.post('/custom-rankings', requireAuth, (req, res) => {
  try {
    const slug = req.body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    customRankingService.createPage({ ...req.body, slug });
    req.flash('success', 'Custom ranking page created.');
  } catch (e) {
    req.flash('error', e.message);
  }
  res.redirect('/admin/custom-rankings');
});

router.get('/custom-rankings/:id', requireAuth, (req, res) => {
  const page = customRankingService.getPageById(req.params.id);
  if (!page) return res.redirect('/admin/custom-rankings');
  
  const items = customRankingService.getPageItems(req.params.id);
  const businesses = db.prepare('SELECT id, name, city_id FROM businesses WHERE active = 1 ORDER BY name ASC').all();
  
  res.render('admin/custom-rankings-edit', { page, items, businesses, title: 'Edit Custom Ranking', admin: req.session, flash: { success: req.flash('success'), error: req.flash('error') } });
});

router.post('/custom-rankings/:id', requireAuth, (req, res) => {
  try {
    const slug = req.body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    customRankingService.updatePage(req.params.id, { ...req.body, slug });
    req.flash('success', 'Page details updated.');
  } catch (e) {
    req.flash('error', e.message);
  }
  res.redirect(`/admin/custom-rankings/${req.params.id}`);
});

router.post('/custom-rankings/:id/items', requireAuth, (req, res) => {
  try {
    customRankingService.addItem(req.params.id, req.body.business_id, req.body.manual_rank);
    req.flash('success', 'Business added to ranking.');
  } catch (e) {
    req.flash('error', e.message);
  }
  res.redirect(`/admin/custom-rankings/${req.params.id}`);
});

router.post('/custom-rankings/:id/items/:itemId/update', requireAuth, (req, res) => {
  try {
    customRankingService.updateItemRank(req.params.itemId, req.body.manual_rank);
    req.flash('success', 'Rank updated.');
  } catch (e) {
    req.flash('error', e.message);
  }
  res.redirect(`/admin/custom-rankings/${req.params.id}`);
});

router.post('/custom-rankings/:id/items/:itemId/delete', requireAuth, (req, res) => {
  try {
    customRankingService.removeItem(req.params.itemId);
    req.flash('success', 'Business removed from ranking.');
  } catch (e) {
    req.flash('error', e.message);
  }
  res.redirect(`/admin/custom-rankings/${req.params.id}`);
});

router.post('/custom-rankings/:id/delete', requireAuth, (req, res) => {
  try {
    customRankingService.deletePage(req.params.id);
    req.flash('success', 'Custom ranking page deleted.');
  } catch (e) {
    req.flash('error', e.message);
  }
  res.redirect('/admin/custom-rankings');
});

// ============================================
// CITIES
// ============================================
router.get('/cities', requireAuth, (req, res) => {
  const cities = db.prepare(`SELECT *, (SELECT COUNT(*) FROM businesses WHERE city_id=cities.id AND active=1) as biz_count FROM cities ORDER BY name`).all();
  res.render('admin/cities', { cities, title: 'Cities', admin: req.session, flash: { success: req.flash('success') } });
});

router.post('/cities', requireAuth, (req, res) => {
  const slug = req.body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const stateSlug = (req.body.state || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  try {
    db.prepare(`INSERT INTO cities (name,slug,state,state_slug) VALUES (?,?,?,?)`).run(req.body.name, slug, req.body.state, stateSlug);
  } catch (e) {
    db.prepare(`INSERT INTO cities (name,state) VALUES (?,?)`).run(req.body.name, req.body.state);
  }
  req.flash('success', 'City added.');
  res.redirect('/admin/cities');
});

router.post('/cities/:id/toggle', requireAuth, (req, res) => {
  const city = db.prepare(`SELECT active FROM cities WHERE id=?`).get(req.params.id);
  const newStatus = city.active ? 0 : 1;
  db.prepare(`UPDATE cities SET active=? WHERE id=?`).run(newStatus, req.params.id);
  // Cascade disable (only on disable)
  if (newStatus === 0) {
    db.prepare(`UPDATE businesses SET active=0 WHERE city_id=?`).run(req.params.id);
  }
  res.redirect('/admin/cities');
});

router.post('/cities/:id/delete', requireAuth, (req, res) => {
  db.transaction(() => {
    const id = req.params.id;
    db.prepare('DELETE FROM ranking_history WHERE city_id=?').run(id);
    db.prepare('DELETE FROM search_log WHERE query LIKE ?').run(`%${id}%`); // approximate cleanup
    db.prepare('DELETE FROM businesses WHERE city_id=?').run(id);
    db.prepare('DELETE FROM cities WHERE id=?').run(id);
  })();
  req.flash('success', 'City and all associated businesses deleted safely.');
  res.redirect('/admin/cities');
});

// ============================================
// CATEGORIES
// ============================================
router.get('/categories', requireAuth, (req, res) => {
  const categories = db.prepare(`SELECT *, (SELECT COUNT(*) FROM businesses WHERE category_id=categories.id AND active=1) as biz_count FROM categories ORDER BY name`).all();
  res.render('admin/categories', { categories, title: 'Categories', admin: req.session, flash: { success: req.flash('success') } });
});

router.post('/categories', requireAuth, (req, res) => {
  const slug = req.body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  db.prepare(`INSERT INTO categories (name,slug,icon) VALUES (?,?,?)`).run(req.body.name, slug, req.body.icon || 'ti-building-store');
  req.flash('success', 'Category added.');
  res.redirect('/admin/categories');
});

router.post('/categories/:id/toggle', requireAuth, (req, res) => {
  const cat = db.prepare(`SELECT active FROM categories WHERE id=?`).get(req.params.id);
  const newStatus = cat.active ? 0 : 1;
  db.prepare(`UPDATE categories SET active=? WHERE id=?`).run(newStatus, req.params.id);
  // Cascade disable
  if (newStatus === 0) {
    db.prepare(`UPDATE businesses SET active=0 WHERE category_id=?`).run(req.params.id);
  }
  res.redirect('/admin/categories');
});

router.post('/categories/:id/delete', requireAuth, (req, res) => {
  db.transaction(() => {
    const id = req.params.id;
    db.prepare('DELETE FROM ranking_history WHERE category_id=?').run(id);
    db.prepare('DELETE FROM businesses WHERE category_id=?').run(id);
    db.prepare('DELETE FROM categories WHERE id=?').run(id);
  })();
  req.flash('success', 'Category and all associated businesses deleted safely.');
  res.redirect('/admin/categories');
});

// ============================================
// INQUIRIES (M-08)
// ============================================
router.get('/inquiries', requireAuth, (req, res) => {
  const status = req.query.status || null;
  const inquiries = inquiryService.getInquiries(status);
  const stats = inquiryService.getInquiryStats();
  res.render('admin/inquiries', {
    inquiries, stats, currentStatus: status,
    title: 'Business Inquiries', admin: req.session,
    flash: { success: req.flash('success'), error: req.flash('error') }
  });
});

router.post('/inquiries/:id/approve', requireAuth, (req, res) => {
  try {
    inquiryService.approveInquiry(parseInt(req.params.id), req.session.adminId);
    req.flash('success', 'Inquiry approved and business created.');
  } catch (e) {
    req.flash('error', e.message);
  }
  res.redirect('/admin/inquiries');
});

router.post('/inquiries/:id/reject', requireAuth, (req, res) => {
  try {
    inquiryService.rejectInquiry(parseInt(req.params.id), req.session.adminId, req.body.notes || '');
    req.flash('success', 'Inquiry rejected.');
  } catch (e) {
    req.flash('error', e.message);
  }
  res.redirect('/admin/inquiries');
});

// ============================================
// CLAIMS
// ============================================
router.get('/claims', requireAuth, (req, res) => {
  const status = req.query.status || null;
  const claims = claimService.getClaims(status);
  const stats = claimService.getClaimStats();
  res.render('admin/claims', {
    claims, stats, currentStatus: status,
    title: 'Claim Requests', admin: req.session,
    flash: { success: req.flash('success'), error: req.flash('error') }
  });
});

router.post('/claims/:id/verify', requireAuth, (req, res) => {
  try {
    claimService.verifyClaim(parseInt(req.params.id), req.session.adminId);
    req.flash('success', 'Claim verified. Business marked as claimed.');
  } catch (e) {
    req.flash('error', e.message);
  }
  res.redirect('/admin/claims');
});

router.post('/claims/:id/reject', requireAuth, (req, res) => {
  try {
    claimService.rejectClaim(parseInt(req.params.id), req.session.adminId, req.body.notes || '');
    req.flash('success', 'Claim rejected.');
  } catch (e) {
    req.flash('error', e.message);
  }
  res.redirect('/admin/claims');
});

// ============================================
// ANALYTICS
// ============================================
router.get('/analytics', requireAuth, (req, res) => {
  const searchInsights = analyticsService.getSearchInsights();
  const categoryAnalytics = analyticsService.getCategoryAnalytics();
  const dashboardStats = analyticsService.getDashboardStats();
  res.render('admin/analytics', {
    searchInsights, categoryAnalytics, dashboardStats,
    title: 'Analytics', admin: req.session,
    flash: { success: req.flash('success') }
  });
});

// ============================================
// SETTINGS & SEO PERFORMANCE
// ============================================
router.get('/settings', requireAuth, requireSuperAdmin, async (req, res) => {
  const settings = settingsService.getAllSettings();
  
  // Optional: Fetch live PageSpeed Insights if requested
  let pageSpeedData = null;
  let gscData = null;
  const targetUrl = process.env.BASE_URL || 'https://bharatbusinessindex.com';

  if (req.query.run_pagespeed === 'true') {
    try {
      const response = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(targetUrl)}&category=SEO&category=PERFORMANCE`);
      if (response.ok) {
        pageSpeedData = await response.json();
      }
    } catch (e) {
      console.error('PageSpeed API Error:', e.message);
    }
  }

  if (req.query.run_gsc === 'true') {
    // Format required by GSC is typically 'sc-domain:example.com' or 'https://example.com/'
    const siteUrl = targetUrl.includes('localhost') ? targetUrl : `sc-domain:${targetUrl.replace('https://', '').replace('http://', '')}`;
    gscData = await googleApiService.getSearchConsoleData(siteUrl, 30);
  }

  res.render('admin/settings', {
    settings,
    pageSpeedData,
    gscData,
    title: 'Global Settings & SEO',
    admin: req.session,
    flash: { success: req.flash('success'), error: req.flash('error') }
  });
});

router.post('/settings', requireAuth, requireSuperAdmin, (req, res) => {
  try {
    settingsService.updateSettings(req.body);
    req.flash('success', 'Global settings updated successfully.');
  } catch (e) {
    req.flash('error', e.message);
  }
  res.redirect('/admin/settings');
});

// ============================================
// ADMINS (superadmin only)
// ============================================
router.get('/admins', requireAuth, requireSuperAdmin, (req, res) => {
  const admins = db.prepare(`SELECT id,name,email,role,created_at FROM admins ORDER BY created_at DESC`).all();
  res.render('admin/admins', { admins, title: 'Admin Users', admin: req.session, flash: { success: req.flash('success'), error: req.flash('error') } });
});

router.post('/admins', requireAuth, requireSuperAdmin, (req, res) => {
  const { name, email, password, role } = req.body;
  if (!password || password.length < 12 || password.length > 128) {
    req.flash('error', 'Password must be between 12 and 128 characters.');
    return res.redirect('/admin/admins');
  }
  const hash = bcrypt.hashSync(password, 12);
  try {
    db.prepare(`INSERT INTO admins (name,email,password,role) VALUES (?,?,?,?)`).run(name, email, hash, role);
    req.flash('success', 'Admin user created.');
  } catch(e) { req.flash('error', 'Email already exists.'); }
  res.redirect('/admin/admins');
});

router.post('/admins/:id/delete', requireAuth, requireSuperAdmin, (req, res) => {
  if (req.params.id == req.session.adminId) { req.flash('error', 'Cannot delete yourself.'); return res.redirect('/admin/admins'); }
  db.prepare(`DELETE FROM admins WHERE id=?`).run(req.params.id);
  req.flash('success', 'Admin removed.');
  res.redirect('/admin/admins');
});

// ============================================
// PAGES & SEO
// ============================================
router.get('/pages', requireAuth, (req, res) => {
  const cities = db.prepare('SELECT id, name, slug FROM cities WHERE active=1').all();
  const categories = db.prepare('SELECT id, name, slug FROM categories WHERE active=1').all();
  const customPages = customRankingService.getAllPages();
  res.render('admin/pages-list', { cities, categories, customPages, title: 'Ranking Pages Manager', admin: req.session, flash: { success: req.flash('success'), error: req.flash('error') } });
});

router.get('/seo/:type/:id', requireAuth, (req, res) => {
  const { type, id } = req.params;
  let entity = null;
  if (type === 'city') entity = db.prepare('SELECT * FROM cities WHERE id=?').get(id);
  else if (type === 'category') entity = db.prepare('SELECT * FROM categories WHERE id=?').get(id);
  else if (type === 'custom') {
    const page = db.prepare('SELECT * FROM custom_ranking_pages WHERE id=?').get(id);
    if (page) entity = { id: page.id, name: page.title };
  }
  
  if (!entity) return res.redirect('/admin/pages');
  
  const seoContent = seoService.getSeoContent(type, id) || {
    title: `Best ${entity.name}`,
    meta_description: `Find the best ${entity.name}.`,
    editorial_content: '',
    ai_summary: '',
    faq_json: '[]'
  };
  
  res.render('admin/seo-form', { type, entity, combo: null, seoContent, title: `Edit SEO: ${entity.name}`, admin: req.session, flash: { error: req.flash('error') } });
});

router.post('/seo/:type/:id', requireAuth, (req, res) => {
  const { type, id } = req.params;
  seoService.saveSeoContent(type, id, req.body);
  req.flash('success', 'SEO Content saved successfully.');
  res.redirect('/admin/pages');
});

router.get('/seo/combo/:cityId/:catId', requireAuth, (req, res) => {
  const { cityId, catId } = req.params;
  const city = db.prepare('SELECT * FROM cities WHERE id=?').get(cityId);
  const cat = db.prepare('SELECT * FROM categories WHERE id=?').get(catId);
  
  if (!city || !cat) return res.redirect('/admin/pages');
  
  const seoContent = seoService.getSeoContent('city_category', cityId, catId) || {
    title: `Best ${cat.name} in ${city.name}`,
    meta_description: `Find the best ${cat.name} in ${city.name}. Read reviews and compare options.`,
    editorial_content: '',
    ai_summary: '',
    faq_json: '[]'
  };
  
  res.render('admin/seo-form', { 
    type: 'city_category', 
    entity: { id: cityId, name: `${cat.name} in ${city.name}` }, 
    combo: { cityId, catId },
    seoContent, 
    title: `Edit SEO: ${cat.name} in ${city.name}`, 
    admin: req.session, flash: { error: req.flash('error') } 
  });
});

router.post('/seo/combo/:cityId/:catId', requireAuth, (req, res) => {
  const { cityId, catId } = req.params;
  seoService.saveSeoContent('city_category', cityId, req.body, catId);
  req.flash('success', 'Combo SEO Content saved successfully.');
  res.redirect('/admin/pages');
});

// ============================================
// COMBO RANKING OVERRIDES
// ============================================
router.get('/combo-rankings/:cityId/:catId', requireAuth, (req, res) => {
  const { cityId, catId } = req.params;
  const city = db.prepare('SELECT * FROM cities WHERE id=?').get(cityId);
  const cat = db.prepare('SELECT * FROM categories WHERE id=?').get(catId);
  
  if (!city || !cat) return res.redirect('/admin/pages');
  
  // Get all businesses in this combo
  const businesses = db.prepare(`
    SELECT b.id, b.name, rs.strict_rank, rs.final_score, rs.manual_boost
    FROM businesses b
    LEFT JOIN ranking_scores rs ON rs.business_id = b.id
    WHERE b.city_id = ? AND b.category_id = ? AND b.active = 1
    ORDER BY rs.strict_rank ASC NULLS LAST, rs.final_score DESC
  `).all(cityId, catId);
  
  res.render('admin/combo-ranking-edit', { 
    city, cat, businesses, 
    title: `Override Ranks: ${cat.name} in ${city.name}`, 
    admin: req.session, flash: { success: req.flash('success'), error: req.flash('error') } 
  });
});

router.post('/combo-rankings/:cityId/:catId/update', requireAuth, (req, res) => {
  const { cityId, catId } = req.params;
  const { business_id, strict_rank } = req.body;
  
  try {
    const parsedRank = strict_rank ? parseInt(strict_rank, 10) : null;
    
    // Ensure ranking_score row exists
    db.prepare(`
      INSERT INTO ranking_scores (business_id, strict_rank) VALUES (?, ?)
      ON CONFLICT(business_id) DO UPDATE SET strict_rank = excluded.strict_rank
    `).run(business_id, parsedRank);
    
    // Recalculate rankings for this combo immediately to apply changes
    const rankingService = require('../services/rankingService');
    rankingService.recalculateRankings(cityId, catId);
    
    req.flash('success', 'Rank override saved successfully.');
  } catch (e) {
    req.flash('error', e.message);
  }
  
  res.redirect(`/admin/combo-rankings/${cityId}/${catId}`);
});

// ============================================
// MONTHLY DIGEST CMS
// ============================================
router.get('/digests', requireAuth, (req, res) => {
  const months = digestService.getDigestMonths();
  res.render('admin/digest-list', { months, formatMonth: digestService.formatMonth, title: 'Monthly Digests', admin: req.session, flash: { success: req.flash('success') } });
});

router.post('/digests/generate', requireAuth, (req, res) => {
  const { month } = req.body;
  if(!month) return res.redirect('/admin/digests');
  digestService.generateDigest(month);
  req.flash('success', `Digest for ${month} generated.`);
  res.redirect(`/admin/digests/${month}`);
});

router.get('/digests/:month', requireAuth, (req, res) => {
  const { month } = req.params;
  const entries = digestService.getDigest(month);
  res.render('admin/digest-form', { month, entries, formatMonth: digestService.formatMonth, title: `Digest: ${digestService.formatMonth(month)}`, admin: req.session, flash: { error: req.flash('error') } });
});

// ============================================
// BLOG
// ============================================
router.get('/blog', requireAuth, (req, res) => {
  const { posts } = blogService.getPosts({ limit: 100 });
  res.render('admin/blog-list', { posts, title: 'Blog Posts', admin: req.session, flash: { success: req.flash('success') } });
});

router.get('/blog/new', requireAuth, (req, res) => {
  res.render('admin/blog-form', { post: null, title: 'New Post', admin: req.session, flash: { error: req.flash('error') } });
});

router.post('/blog', requireAuth, (req, res) => {
  try {
    blogService.createPost(req.body, req.session.adminId);
    req.flash('success', 'Post created.');
    res.redirect('/admin/blog');
  } catch (e) {
    req.flash('error', e.message);
    res.redirect('/admin/blog/new');
  }
});

router.get('/blog/:id/edit', requireAuth, (req, res) => {
  const post = blogService.getPostById(req.params.id);
  if (!post) return res.redirect('/admin/blog');
  res.render('admin/blog-form', { post, title: 'Edit Post', admin: req.session, flash: { error: req.flash('error') } });
});

router.post('/blog/:id', requireAuth, (req, res) => {
  try {
    blogService.updatePost(req.params.id, req.body);
    req.flash('success', 'Post updated.');
  } catch (e) {
    req.flash('error', e.message);
  }
  res.redirect('/admin/blog');
});

router.post('/blog/:id/publish', requireAuth, (req, res) => {
  blogService.publishPost(req.params.id);
  res.redirect('/admin/blog');
});

router.post('/blog/:id/unpublish', requireAuth, (req, res) => {
  blogService.unpublishPost(req.params.id);
  res.redirect('/admin/blog');
});

router.post('/blog/:id/delete', requireAuth, (req, res) => {
  blogService.deletePost(req.params.id);
  req.flash('success', 'Post deleted.');
  res.redirect('/admin/blog');
});

// ============================================
// FAQS
// ============================================
router.get('/faqs', requireAuth, (req, res) => {
  const faqs = faqService.getAllFaqs();
  res.render('admin/faqs', { faqs, title: 'Manage FAQs', admin: req.session, flash: { success: req.flash('success') } });
});

router.post('/faqs', requireAuth, (req, res) => {
  try {
    faqService.createFaq(req.body);
    req.flash('success', 'FAQ added.');
  } catch (e) {
    req.flash('error', e.message);
  }
  res.redirect('/admin/faqs');
});

router.post('/faqs/:id', requireAuth, (req, res) => {
  try {
    faqService.updateFaq(req.params.id, req.body);
    req.flash('success', 'FAQ updated.');
  } catch (e) {
    req.flash('error', e.message);
  }
  res.redirect('/admin/faqs');
});

router.post('/faqs/:id/delete', requireAuth, (req, res) => {
  faqService.deleteFaq(req.params.id);
  req.flash('success', 'FAQ deleted.');
  res.redirect('/admin/faqs');
});

// ============================================
// GOOGLE PLACES IMPORT
// ============================================
router.get('/import', requireAuth, (req, res) => {
  const isConfigured = placesService.isConfigured();
  const cachedPlaces = placesService.getCachedPlaces({ imported: false, limit: 20 });
  const cities = db.prepare(`SELECT * FROM cities WHERE active=1 ORDER BY name`).all();
  const categories = db.prepare(`SELECT * FROM categories WHERE active=1 ORDER BY name`).all();
  
  res.render('admin/import', { 
    isConfigured, 
    cachedPlaces, 
    searchResults: [], 
    searchQuery: '',
    cities, 
    categories,
    title: 'Import from Google Places', 
    admin: req.session, 
    flash: { success: req.flash('success'), error: req.flash('error') } 
  });
});

router.post('/import/search', requireAuth, async (req, res) => {
  try {
    const { query, location } = req.body;
    const { results, error } = await placesService.searchPlaces(query, location);
    
    if (error) req.flash('error', error);

    const isConfigured = placesService.isConfigured();
    const cachedPlaces = placesService.getCachedPlaces({ imported: false, limit: 20 });
    const cities = db.prepare(`SELECT * FROM cities WHERE active=1 ORDER BY name`).all();
    const categories = db.prepare(`SELECT * FROM categories WHERE active=1 ORDER BY name`).all();

    res.render('admin/import', {
      isConfigured,
      cachedPlaces,
      searchResults: results || [],
      searchQuery: query,
      cities,
      categories,
      title: 'Import from Google Places',
      admin: req.session,
      flash: { success: req.flash('success'), error: req.flash('error') }
    });
  } catch (e) {
    req.flash('error', e.message);
    res.redirect('/admin/import');
  }
});

router.post('/import/cache/:placeId', requireAuth, async (req, res) => {
  try {
    await placesService.importPlace(req.params.placeId);
    req.flash('success', 'Place details fetched and cached. Please assign city and category to import.');
  } catch (e) {
    req.flash('error', e.message);
  }
  res.redirect('/admin/import');
});

router.post('/import/:cacheId/approve', requireAuth, (req, res) => {
  try {
    const { city_id, category_id } = req.body;
    const bizId = placesService.approveImport(req.params.cacheId, city_id, category_id);
    req.flash('success', 'Business successfully imported!');
    // Recalculate FTS for new business
    const searchService = require('../services/searchService');
    searchService.updateFtsForBusiness(bizId);

    // AI Automation
    const bInfo = db.prepare(`
      SELECT b.name, c.name as city_name, cat.name as cat_name 
      FROM businesses b
      LEFT JOIN cities c ON c.id = b.city_id
      LEFT JOIN categories cat ON cat.id = b.category_id
      WHERE b.id = ?
    `).get(bizId);
    if (bInfo) {
      jobQueue.enqueue('listing_generate', bInfo);
      jobQueue.enqueue('faq_generate', bInfo);
    }
  } catch (e) {
    req.flash('error', e.message);
  }
  res.redirect('/admin/import');
});

// ============================================
// AI API ROUTES (MANUAL TRIGGERS)
// ============================================
router.post('/api/ai/generate', requireAuth, async (req, res) => {
  try {
    const { type, businessInfo } = req.body;
    let result = null;
    
    if (type === 'listing') {
      result = await aiProvider.generateListingContent(businessInfo);
    } else if (type === 'faq') {
      result = await aiProvider.generateFaqContent(businessInfo);
    } else if (type === 'social') {
      result = await aiProvider.generateSocialContent(businessInfo, { rank_position: 'Top' });
    } else if (type === 'seo_tags') {
      const promptType = businessInfo.type === 'city_category' ? 'local category' : businessInfo.type;
      result = await aiProvider.generateSeoTags(businessInfo.name, promptType);
    } else if (type === 'seo_editorial') {
      const promptType = businessInfo.type === 'city_category' ? 'local category' : businessInfo.type;
      result = await aiProvider.generateSeoEditorial(businessInfo.name, promptType);
    } else if (type === 'blog_draft') {
      result = await aiProvider.generateBlogDraft(businessInfo.title);
    } else if (type === 'blog_summary') {
      result = await aiProvider.generateBlogSummary(businessInfo.content);
    } else if (type === 'digest_summary') {
      result = await aiProvider.generateDigestSummary(businessInfo.month);
    }
    
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/api/ai/moderate', requireAuth, async (req, res) => {
  try {
    const { text } = req.body;
    const result = await aiProvider.moderateContent(text);
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// CSV BULK IMPORT
// ============================================

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const csvImportService = require('../services/csvImportService');
const auditService = require('../services/auditService');

// Configure multer for CSV uploads
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const csvUpload = multer({
  dest: uploadDir,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const validMimes = ['text/csv', 'application/csv', 'application/vnd.ms-excel'];
    if (validMimes.includes(file.mimetype) || file.originalname.toLowerCase().endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed. No executables or unsupported formats.'));
    }
  },
});

// Setup multer for Image uploads
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images are allowed'));
  }
});

const sharp = require('sharp');

// Image Upload Endpoint (Converts to WebP)
router.post('/upload-image', requireAuth, imageUpload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;
    const outputPath = path.join(__dirname, '..', 'public', 'images', 'uploads', filename);

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Convert to WebP and save
    await sharp(req.file.buffer)
      .webp({ quality: 80 })
      .toFile(outputPath);

    res.json({ 
      success: true, 
      url: `/images/uploads/${filename}`,
      message: 'Image converted to WebP and uploaded successfully.' 
    });
  } catch (error) {
    console.error('Image Upload Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// CSV Import — Upload page
router.get('/csv-import', requireAuth, (req, res) => {
  const stats = csvImportService.getImportStats();
  res.render('admin/csv-import', {
    stats,
    title: 'CSV Bulk Import',
    admin: req.session,
    flash: { success: req.flash('success'), error: req.flash('error') },
  });
});

// CSV Import — Handle file upload + validation
router.post('/csv-import/upload', requireAuth, csvUpload.single('csvFile'), (req, res) => {
  try {
    if (!req.file) {
      req.flash('error', 'Please select a CSV file to upload.');
      return res.redirect('/admin/csv-import');
    }

    // Validate the CSV
    const report = csvImportService.validateCSV(req.file.path);

    // Create import record with validation results
    const importId = csvImportService.createImport(
      req.file.originalname,
      report,
      req.session.adminId
    );

    // Clean up temp file after parsing
    try { fs.unlinkSync(req.file.path); } catch (e) {}

    // Redirect to preview page
    res.redirect(`/admin/csv-import/${importId}/preview`);
  } catch (e) {
    req.flash('error', 'Upload failed: ' + e.message);
    res.redirect('/admin/csv-import');
  }
});

// CSV Import — Validation preview
router.get('/csv-import/:id/preview', requireAuth, (req, res) => {
  const importData = csvImportService.getImportDetails(req.params.id);
  if (!importData) {
    req.flash('error', 'Import not found.');
    return res.redirect('/admin/csv-import');
  }

  res.render('admin/csv-import-preview', {
    importData,
    title: 'Import Preview',
    admin: req.session,
    flash: { success: req.flash('success'), error: req.flash('error') },
  });
});

// CSV Import — Start import (after preview approval)
router.post('/csv-import/:id/start', requireAuth, (req, res) => {
  try {
    const importId = parseInt(req.params.id);

    // Run import in next tick to avoid blocking (SQLite is sync anyway, but this keeps the response fast)
    setImmediate(() => {
      try {
        csvImportService.executeImport(importId, req.session.adminId);
        console.log(`✅ Import #${importId} completed.`);
      } catch (e) {
        console.error(`❌ Import #${importId} failed:`, e.message);
        db.prepare(`UPDATE csv_imports SET status = 'failed' WHERE id = ?`).run(importId);
      }
    });

    req.flash('success', 'Import started! Track progress below.');
    res.redirect(`/admin/csv-import/${importId}/status`);
  } catch (e) {
    req.flash('error', 'Failed to start import: ' + e.message);
    res.redirect('/admin/csv-import');
  }
});

// CSV Import — Real-time status (page)
router.get('/csv-import/:id/status', requireAuth, (req, res) => {
  const status = csvImportService.getImportStatus(parseInt(req.params.id));
  if (!status) {
    req.flash('error', 'Import not found.');
    return res.redirect('/admin/csv-import');
  }

  res.render('admin/csv-import-status', {
    importStatus: status,
    title: 'Import Progress',
    admin: req.session,
    flash: { success: req.flash('success'), error: req.flash('error') },
  });
});

// CSV Import — Status API (for AJAX polling)
router.get('/api/csv-import/:id/status', requireAuth, (req, res) => {
  const status = csvImportService.getImportStatus(parseInt(req.params.id));
  if (!status) return res.status(404).json({ error: 'Import not found' });
  res.json(status);
});

// CSV Import — Rollback
router.post('/csv-import/:id/rollback', requireAuth, (req, res) => {
  try {
    const result = csvImportService.rollbackImport(parseInt(req.params.id), req.session.adminId);
    req.flash('success', `Import rolled back. ${result.rolledBack} businesses deactivated.`);
  } catch (e) {
    req.flash('error', 'Rollback failed: ' + e.message);
  }
  res.redirect('/admin/csv-import/history');
});

// CSV Import — History
router.get('/csv-import/history', requireAuth, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const history = csvImportService.getImportHistory(page, 20);

  res.render('admin/csv-import-history', {
    history,
    title: 'Import History',
    admin: req.session,
    flash: { success: req.flash('success'), error: req.flash('error') },
  });
});

// CSV Import — Detail view
router.get('/csv-import/:id', requireAuth, (req, res) => {
  const importData = csvImportService.getImportDetails(parseInt(req.params.id));
  if (!importData) {
    req.flash('error', 'Import not found.');
    return res.redirect('/admin/csv-import/history');
  }

  res.render('admin/csv-import-detail', {
    importData,
    title: `Import #${req.params.id}`,
    admin: req.session,
    flash: { success: req.flash('success'), error: req.flash('error') },
  });
});

// ============================================
// AUDIT LOGS
// ============================================

router.get('/audit-logs', requireAuth, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const filters = {
    entity_type: req.query.entity_type || null,
    action: req.query.action || null,
    from_date: req.query.from_date || null,
    to_date: req.query.to_date || null,
  };

  const auditData = auditService.getAuditLogs(filters, page, 50);

  res.render('admin/audit-logs', {
    auditData,
    filters,
    title: 'Audit Logs',
    admin: req.session,
    flash: { success: req.flash('success'), error: req.flash('error') },
  });
});

module.exports = router;

