const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = new Database(path.join(__dirname, '../config/bbi.db'));

db.exec('PRAGMA foreign_keys = ON;');

// Admin
const adminPassword = bcrypt.hashSync('admin@bbi123', 10);
db.prepare(`INSERT OR IGNORE INTO admins (name, email, password, role) VALUES (?, ?, ?, ?)`)
  .run('BBI Admin', 'admin@bbi.in', adminPassword, 'superadmin');

// Cities
const cities = [
  ['Jaipur','Rajasthan'],['Delhi','Delhi'],['Mumbai','Maharashtra'],
  ['Bangalore','Karnataka'],['Hyderabad','Telangana'],['Pune','Maharashtra'],
  ['Chennai','Tamil Nadu'],['Ahmedabad','Gujarat'],['Karnal','Haryana'],
  ['Chandigarh','Punjab']
];
const insertCity = db.prepare(`INSERT OR IGNORE INTO cities (name, state) VALUES (?, ?)`);
cities.forEach(c => insertCity.run(...c));

// Categories
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
  ['PPF & Detailing','ppf-detailing','ti-car']
];
const insertCat = db.prepare(`INSERT OR IGNORE INTO categories (name, slug, icon) VALUES (?, ?, ?)`);
categories.forEach(c => insertCat.run(...c));

// Sample businesses
const jaipurId = db.prepare(`SELECT id FROM cities WHERE name='Jaipur'`).get().id;
const ppfCatId = db.prepare(`SELECT id FROM categories WHERE slug='ppf-detailing'`).get().id;

const businesses = [
  ['Detailing Spiders','detailing-spiders',ppfCatId,jaipurId,'Malviya Nagar, Jaipur','9876543210','https://detailingspiders.com','Top PPF installer in Jaipur',4.9,1240,1,0],
  ['Shield Pro Coatings','shield-pro-coatings',ppfCatId,jaipurId,'C-Scheme, Jaipur','9876543211','https://shieldpro.in','Premium PPF and ceramic coatings',4.7,890,1,0],
  ['AutoGuard Jaipur','autoguard-jaipur',ppfCatId,jaipurId,'Vaishali Nagar, Jaipur','9876543212','','PPF installation specialists',4.5,620,0,0],
  ['CoatMasters','coatmasters',ppfCatId,jaipurId,'Mansarovar, Jaipur','9876543213','','Quality coatings at fair price',4.3,410,0,0],
  ['PrimeFilms Jaipur','primefilms-jaipur',ppfCatId,jaipurId,'Bapu Nagar, Jaipur','9876543214','','Film and wrap specialists',4.2,380,0,0],
];

const insertBiz = db.prepare(`
  INSERT OR IGNORE INTO businesses
  (name,slug,category_id,city_id,address,phone,website,description,google_rating,google_review_count,verified,sponsored)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
`);
businesses.forEach(b => insertBiz.run(...b));

// Ranking scores
const bizRows = db.prepare(`SELECT id FROM businesses`).all();
const insertScore = db.prepare(`
  INSERT OR IGNORE INTO ranking_scores
  (business_id,review_score,volume_score,website_score,social_score,years_score,editorial_score,final_score)
  VALUES (?,?,?,?,?,?,?,?)
`);
const scoreData = [
  [1, 30,20,14,8,9,11,94],
  [2, 27,18,13,7,9,10,88],
  [3, 25,15,10,6,8,9,82],
  [4, 22,13,9,6,7,8,74],
  [5, 21,12,8,5,7,7,68],
];
scoreData.forEach(s => insertScore.run(...s));

// Ranking history
const insertHistory = db.prepare(`
  INSERT INTO ranking_history (business_id,city_id,category_id,rank_position,final_score,auto_score,manual_boost,ranking_date)
  VALUES (?,?,?,?,?,?,?,?)
`);
// Jan, Mar, Jun history for business 1
insertHistory.run(1,jaipurId,ppfCatId,5,78,78,0,'2026-01-01');
insertHistory.run(1,jaipurId,ppfCatId,3,86,86,0,'2026-03-01');
insertHistory.run(1,jaipurId,ppfCatId,1,94,83,11,'2026-06-01');
insertHistory.run(2,jaipurId,ppfCatId,2,88,88,0,'2026-06-01');
insertHistory.run(3,jaipurId,ppfCatId,3,82,82,0,'2026-06-01');
insertHistory.run(4,jaipurId,ppfCatId,4,74,74,0,'2026-06-01');
insertHistory.run(5,jaipurId,ppfCatId,5,68,68,0,'2026-06-01');

// Achievements
const insertAch = db.prepare(`INSERT INTO achievements (business_id,title,achieved_at) VALUES (?,?,?)`);
insertAch.run(1,'Entered Top 10','January 2026');
insertAch.run(1,'Entered Top 5','March 2026');
insertAch.run(1,'Reached #1 Position','June 2026');
insertAch.run(1,'Received BBI Verified Badge','April 2026');

console.log('✅ Seed data inserted.');
console.log('📧 Admin login: admin@bbi.in');
console.log('🔑 Password: admin@bbi123');
db.close();
