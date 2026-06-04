const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');
const { recalculateRankings, calculateAutoScore } = require('../models/ranking');

// LOGIN
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

// DASHBOARD
router.get('/', requireAuth, (req, res) => {
  const stats = {
    businesses: db.prepare(`SELECT COUNT(*) as c FROM businesses WHERE active=1`).get().c,
    cities: db.prepare(`SELECT COUNT(*) as c FROM cities WHERE active=1`).get().c,
    categories: db.prepare(`SELECT COUNT(*) as c FROM categories WHERE active=1`).get().c,
    rankings: db.prepare(`SELECT COUNT(*) as c FROM ranking_history`).get().c,
    verified: db.prepare(`SELECT COUNT(*) as c FROM businesses WHERE verified=1`).get().c,
    sponsored: db.prepare(`SELECT COUNT(*) as c FROM businesses WHERE sponsored=1`).get().c,
  };
  const recent = db.prepare(`
    SELECT b.name, b.slug, c.name as city, cat.name as category, b.created_at
    FROM businesses b
    JOIN cities c ON c.id=b.city_id
    JOIN categories cat ON cat.id=b.category_id
    ORDER BY b.created_at DESC LIMIT 5
  `).all();
  res.render('admin/dashboard', { stats, recent, title: 'Dashboard', admin: req.session, flash: { success: req.flash('success'), error: req.flash('error') } });
});

// BUSINESSES
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
  res.render('admin/business-form', { business: null, cities, categories, title: 'Add Business', admin: req.session, flash: { error: req.flash('error') } });
});

router.post('/businesses', requireAuth, (req, res) => {
  const { name, category_id, city_id, address, phone, website, description, google_rating, google_review_count, verified, sponsored } = req.body;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  try {
    const bizId = db.prepare(`
      INSERT INTO businesses (name,slug,category_id,city_id,address,phone,website,description,google_rating,google_review_count,verified,sponsored)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(name, slug, category_id, city_id, address, phone, website, description, parseFloat(google_rating)||0, parseInt(google_review_count)||0, verified?1:0, sponsored?1:0).lastInsertRowid;

    const auto = calculateAutoScore({ website, verified: verified?1:0, description, phone, google_rating: parseFloat(google_rating)||0, google_review_count: parseInt(google_review_count)||0 });
    db.prepare(`INSERT INTO ranking_scores (business_id,final_score,auto_score) VALUES (?,?,?) ON CONFLICT(business_id) DO UPDATE SET final_score=excluded.final_score`).run(bizId, auto, auto);
    req.flash('success', 'Business added successfully.');
  } catch(e) {
    req.flash('error', 'Error: ' + e.message);
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
  const { name, category_id, city_id, address, phone, website, description, google_rating, google_review_count, verified, sponsored, editorial_score, manual_boost } = req.body;
  db.prepare(`
    UPDATE businesses SET name=?,category_id=?,city_id=?,address=?,phone=?,website=?,description=?,
    google_rating=?,google_review_count=?,verified=?,sponsored=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(name, category_id, city_id, address, phone, website, description,
    parseFloat(google_rating)||0, parseInt(google_review_count)||0, verified?1:0, sponsored?1:0, req.params.id);

  const auto = calculateAutoScore({ website, verified: verified?1:0, description, phone, google_rating: parseFloat(google_rating)||0, google_review_count: parseInt(google_review_count)||0 });
  const ed = parseFloat(editorial_score)||0;
  const boost = parseFloat(manual_boost)||0;
  const final = Math.min(auto + ed + boost, 100);
  db.prepare(`
    INSERT INTO ranking_scores (business_id,editorial_score,final_score,auto_score) VALUES (?,?,?,?)
    ON CONFLICT(business_id) DO UPDATE SET editorial_score=excluded.editorial_score, final_score=excluded.final_score, last_calculated=CURRENT_TIMESTAMP
  `).run(req.params.id, ed, final, auto);

  req.flash('success', 'Business updated.');
  res.redirect('/admin/businesses');
});

router.post('/businesses/:id/delete', requireAuth, (req, res) => {
  db.prepare(`UPDATE businesses SET active=0 WHERE id=?`).run(req.params.id);
  req.flash('success', 'Business removed.');
  res.redirect('/admin/businesses');
});

// RANKINGS
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

// CITIES
router.get('/cities', requireAuth, (req, res) => {
  const cities = db.prepare(`SELECT *, (SELECT COUNT(*) FROM businesses WHERE city_id=cities.id AND active=1) as biz_count FROM cities ORDER BY name`).all();
  res.render('admin/cities', { cities, title: 'Cities', admin: req.session, flash: { success: req.flash('success') } });
});

router.post('/cities', requireAuth, (req, res) => {
  db.prepare(`INSERT INTO cities (name,state) VALUES (?,?)`).run(req.body.name, req.body.state);
  req.flash('success', 'City added.');
  res.redirect('/admin/cities');
});

router.post('/cities/:id/toggle', requireAuth, (req, res) => {
  const city = db.prepare(`SELECT active FROM cities WHERE id=?`).get(req.params.id);
  db.prepare(`UPDATE cities SET active=? WHERE id=?`).run(city.active ? 0 : 1, req.params.id);
  res.redirect('/admin/cities');
});

// CATEGORIES
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

// ADMINS (superadmin only)
router.get('/admins', requireAuth, requireSuperAdmin, (req, res) => {
  const admins = db.prepare(`SELECT id,name,email,role,created_at FROM admins ORDER BY created_at DESC`).all();
  res.render('admin/admins', { admins, title: 'Admin Users', admin: req.session, flash: { success: req.flash('success'), error: req.flash('error') } });
});

router.post('/admins', requireAuth, requireSuperAdmin, (req, res) => {
  const { name, email, password, role } = req.body;
  const hash = bcrypt.hashSync(password, 10);
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

module.exports = router;
