/**
 * BBI — Seed Script
 * Idempotent — safe to re-run. Uses INSERT OR IGNORE.
 */

const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = new Database(path.join(__dirname, '../config/bbi.db'));

db.exec('PRAGMA foreign_keys = ON;');

// ============================================
// ADMIN
// ============================================
const adminPassword = bcrypt.hashSync('admin@bbi123', 10);
db.prepare(`INSERT OR IGNORE INTO admins (name, email, password, role) VALUES (?, ?, ?, ?)`)
  .run('BBI Admin', 'admin@bharatbusinessindex.com', adminPassword, 'superadmin');

// ============================================
// CITIES (with slugs)
// ============================================
const cities = [
  ['Jaipur','jaipur','Rajasthan','rajasthan'],
  ['Delhi','delhi','Delhi','delhi'],
  ['Mumbai','mumbai','Maharashtra','maharashtra'],
  ['Bangalore','bangalore','Karnataka','karnataka'],
  ['Hyderabad','hyderabad','Telangana','telangana'],
  ['Pune','pune','Maharashtra','maharashtra'],
  ['Chennai','chennai','Tamil Nadu','tamil-nadu'],
  ['Ahmedabad','ahmedabad','Gujarat','gujarat'],
  ['Karnal','karnal','Haryana','haryana'],
  ['Chandigarh','chandigarh','Punjab','punjab'],
];

// Check if slug column exists, use appropriate insert
try {
  const insertCity = db.prepare(`INSERT OR IGNORE INTO cities (name, slug, state, state_slug) VALUES (?, ?, ?, ?)`);
  cities.forEach(c => insertCity.run(...c));
} catch (e) {
  const insertCity = db.prepare(`INSERT OR IGNORE INTO cities (name, state) VALUES (?, ?)`);
  cities.forEach(c => insertCity.run(c[0], c[2]));
}

// ============================================
// CATEGORIES
// ============================================
const categories = [
  ['Auto Services','auto-services','ti-car'],
  ['Home Services','home-services','ti-tools'],
  ['Retail & Shops','retail-shops','ti-building-store'],
  ['Healthcare','healthcare','ti-stethoscope'],
  ['Education','education','ti-school'],
  ['Restaurants','restaurants','ti-salad'],
  ['Finance & CA','finance-ca','ti-report-money'],
  ['Fitness & Gyms','fitness-gyms','ti-barbell'],
  ['IT & Tech','it-tech','ti-device-laptop'],
  ['Construction','construction','ti-hammer'],
  ['Salons & Beauty','salons-beauty','ti-scissors'],
  ['PPF & Detailing','ppf-detailing','ti-car'],
];
const insertCat = db.prepare(`INSERT OR IGNORE INTO categories (name, slug, icon) VALUES (?, ?, ?)`);
categories.forEach(c => insertCat.run(...c));

// ============================================
// SAMPLE BUSINESSES
// ============================================
const jaipurId = db.prepare(`SELECT id FROM cities WHERE name='Jaipur'`).get()?.id;
const ppfCatId = db.prepare(`SELECT id FROM categories WHERE slug='ppf-detailing'`).get()?.id;

if (jaipurId && ppfCatId) {
  const businesses = [
    ['Detailing Spiders','detailing-spiders',ppfCatId,jaipurId,'Malviya Nagar, Jaipur','9876543210','https://detailingspiders.com','Top PPF installer in Jaipur with over 5 years of experience. Specializing in paint protection film, ceramic coating, and car detailing services.',4.9,1240,1,0],
    ['Shield Pro Coatings','shield-pro-coatings',ppfCatId,jaipurId,'C-Scheme, Jaipur','9876543211','https://shieldpro.in','Premium PPF and ceramic coatings provider. Known for quality workmanship and attention to detail.',4.7,890,1,0],
    ['AutoGuard Jaipur','autoguard-jaipur',ppfCatId,jaipurId,'Vaishali Nagar, Jaipur','9876543212','','PPF installation specialists serving Jaipur for 3 years. Affordable quality protection.',4.5,620,0,0],
    ['CoatMasters','coatmasters',ppfCatId,jaipurId,'Mansarovar, Jaipur','9876543213','','Quality coatings at fair price. Trusted by hundreds of car owners in Jaipur.',4.3,410,0,0],
    ['PrimeFilms Jaipur','primefilms-jaipur',ppfCatId,jaipurId,'Bapu Nagar, Jaipur','9876543214','','Film and wrap specialists offering PPF, vinyl wraps, and window tinting services.',4.2,380,0,0],
  ];

  const insertBiz = db.prepare(`
    INSERT OR IGNORE INTO businesses
    (name,slug,category_id,city_id,address,phone,website,description,google_rating,google_review_count,verified,sponsored)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  businesses.forEach(b => insertBiz.run(...b));

  // ============================================
  // RANKING SCORES (with actual component scores)
  // ============================================
  const bizRows = db.prepare(`SELECT id, name FROM businesses WHERE city_id=? AND category_id=?`).all(jaipurId, ppfCatId);

  const insertScore = db.prepare(`
    INSERT OR IGNORE INTO ranking_scores
    (business_id,review_score,volume_score,website_score,completeness_score,verified_score,editorial_score,auto_score,manual_boost,final_score)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `);

  const scoreData = [
    // [bizIndex, review, volume, website, completeness, verified, editorial, auto, boost, final]
    [0, 35, 25, 15, 10, 10, 11, 85, 0, 96],
    [1, 30, 20, 15, 10, 10, 10, 75, 0, 85],
    [2, 25, 15, 0, 10, 0, 9, 50, 0, 59],
    [3, 18, 13, 0, 10, 0, 8, 41, 0, 49],
    [4, 18, 12, 0, 10, 0, 7, 40, 0, 47],
  ];

  scoreData.forEach(s => {
    if (bizRows[s[0]]) {
      insertScore.run(bizRows[s[0]].id, s[1], s[2], s[3], s[4], s[5], s[6], s[7], s[8], s[9]);
    }
  });

  // ============================================
  // RANKING HISTORY
  // ============================================
  const existingHistory = db.prepare(`SELECT COUNT(*) as c FROM ranking_history`).get().c;
  if (existingHistory === 0 && bizRows.length >= 5) {
    const insertHistory = db.prepare(`
      INSERT INTO ranking_history (business_id,city_id,category_id,rank_position,final_score,auto_score,manual_boost,ranking_date)
      VALUES (?,?,?,?,?,?,?,?)
    `);
    // History for business 1 (Detailing Spiders)
    insertHistory.run(bizRows[0].id,jaipurId,ppfCatId,5,78,78,0,'2026-01-01');
    insertHistory.run(bizRows[0].id,jaipurId,ppfCatId,3,86,86,0,'2026-03-01');
    insertHistory.run(bizRows[0].id,jaipurId,ppfCatId,1,96,85,11,'2026-06-01');
    // June rankings for all
    insertHistory.run(bizRows[1].id,jaipurId,ppfCatId,2,85,75,0,'2026-06-01');
    insertHistory.run(bizRows[2].id,jaipurId,ppfCatId,3,59,50,0,'2026-06-01');
    insertHistory.run(bizRows[3].id,jaipurId,ppfCatId,4,49,41,0,'2026-06-01');
    insertHistory.run(bizRows[4].id,jaipurId,ppfCatId,5,47,40,0,'2026-06-01');
  }

  // ============================================
  // ACHIEVEMENTS
  // ============================================
  if (bizRows[0]) {
    const existingAch = db.prepare(`SELECT COUNT(*) as c FROM achievements WHERE business_id=?`).get(bizRows[0].id).c;
    if (existingAch === 0) {
      const insertAch = db.prepare(`INSERT INTO achievements (business_id,title,achieved_at) VALUES (?,?,?)`);
      insertAch.run(bizRows[0].id,'Entered Top 10','January 2026');
      insertAch.run(bizRows[0].id,'Entered Top 5','March 2026');
      insertAch.run(bizRows[0].id,'Reached #1 Position','June 2026');
      insertAch.run(bizRows[0].id,'Received BBI Verified Badge','April 2026');
    }
  }

  // ============================================
  // POPULATE FTS5 INDEX
  // ============================================
  try {
    const allBiz = db.prepare(`SELECT id, name, description, tags FROM businesses`).all();
    const insertFts = db.prepare(`INSERT OR REPLACE INTO businesses_fts(rowid, name, description, tags) VALUES (?, ?, ?, ?)`);
    allBiz.forEach(b => insertFts.run(b.id, b.name, b.description || '', b.tags || ''));
    console.log(`   FTS5 index populated with ${allBiz.length} businesses.`);
  } catch (e) {
    console.log('   FTS5 population skipped:', e.message);
  }

  // ============================================
  // SAMPLE SEO CONTENT
  // ============================================
  try {
    const existingSeo = db.prepare(`SELECT COUNT(*) as c FROM seo_content`).get().c;
    if (existingSeo === 0) {
      db.prepare(`
        INSERT INTO seo_content (page_type, entity_id, title, meta_description, editorial_content, faq_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'ranking', null,
        'Top PPF & Detailing Services in Jaipur — BBI Rankings 2026',
        'Find the best PPF installers and car detailing services in Jaipur. Independent rankings based on verified reviews, service quality, and customer satisfaction.',
        'Jaipur\'s PPF and detailing industry has seen significant growth in 2026. Our monthly rankings help car owners find the most trusted service providers based on real customer feedback.',
        JSON.stringify([
          { question: 'How does BBI rank businesses?', answer: 'BBI uses a transparent scoring system based on customer reviews, review volume, online presence, business completeness, and editorial assessment. Rankings are updated monthly.' },
          { question: 'Can businesses pay to improve their ranking?', answer: 'No. BBI rankings are strictly independent. Sponsored listings are clearly labeled and never affect ranking positions.' },
          { question: 'How often are rankings updated?', answer: 'Rankings are recalculated on the 1st of every month using the latest available data.' },
        ])
      );
    }
  } catch (e) {
    // seo_content table may not exist yet
  }
}

console.log('✅ Seed data inserted.');
console.log('📧 Admin login: admin@bbi.in');
console.log('🔑 Password: admin@bbi123');
db.close();
