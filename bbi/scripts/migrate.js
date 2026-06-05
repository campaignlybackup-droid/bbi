/**
 * BBI — Database Migration
 * Creates all tables, indexes, FTS5 virtual tables, and triggers.
 * Safe to re-run — uses CREATE TABLE IF NOT EXISTS.
 */

const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '../config/bbi.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  -- ============================================
  -- CORE TABLES
  -- ============================================

  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'editor',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT,
    state TEXT NOT NULL,
    state_slug TEXT,
    description TEXT,
    meta_description TEXT,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    icon TEXT DEFAULT 'ti-building-store',
    description TEXT,
    meta_description TEXT,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS businesses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    category_id INTEGER,
    city_id INTEGER,
    address TEXT,
    phone TEXT,
    website TEXT,
    description TEXT,
    tags TEXT,
    years_in_business INTEGER DEFAULT 0,
    social_url TEXT,
    google_rating REAL DEFAULT 0,
    google_review_count INTEGER DEFAULT 0,
    verified INTEGER DEFAULT 0,
    sponsored INTEGER DEFAULT 0,
    claimed INTEGER DEFAULT 0,
    claim_verified_at DATETIME,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (city_id) REFERENCES cities(id)
  );

  -- ============================================
  -- RANKING TABLES
  -- ============================================

  CREATE TABLE IF NOT EXISTS ranking_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL,
    city_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    rank_position INTEGER NOT NULL,
    final_score REAL NOT NULL,
    auto_score REAL NOT NULL,
    manual_boost REAL DEFAULT 0,
    ranking_date TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (business_id) REFERENCES businesses(id),
    FOREIGN KEY (city_id) REFERENCES cities(id),
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );

  CREATE TABLE IF NOT EXISTS ranking_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER UNIQUE NOT NULL,
    review_score REAL DEFAULT 0,
    volume_score REAL DEFAULT 0,
    website_score REAL DEFAULT 0,
    completeness_score REAL DEFAULT 0,
    verified_score REAL DEFAULT 0,
    editorial_score REAL DEFAULT 0,
    auto_score REAL DEFAULT 0,
    manual_boost REAL DEFAULT 0,
    final_score REAL DEFAULT 0,
    last_calculated DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (business_id) REFERENCES businesses(id)
  );

  CREATE TABLE IF NOT EXISTS achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    achieved_at TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (business_id) REFERENCES businesses(id)
  );

  -- ============================================
  -- BUSINESS INQUIRY & CLAIMS
  -- ============================================

  CREATE TABLE IF NOT EXISTS business_inquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_name TEXT NOT NULL,
    contact_name TEXT NOT NULL,
    contact_email TEXT NOT NULL,
    contact_phone TEXT NOT NULL,
    city_id INTEGER,
    category_id INTEGER,
    website TEXT,
    description TEXT,
    status TEXT DEFAULT 'pending',
    admin_notes TEXT,
    reviewed_by INTEGER,
    reviewed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (city_id) REFERENCES cities(id),
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (reviewed_by) REFERENCES admins(id)
  );

  CREATE TABLE IF NOT EXISTS claim_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL,
    contact_name TEXT NOT NULL,
    contact_email TEXT NOT NULL,
    contact_phone TEXT NOT NULL,
    verification_details TEXT,
    status TEXT DEFAULT 'pending',
    admin_notes TEXT,
    reviewed_by INTEGER,
    reviewed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (business_id) REFERENCES businesses(id),
    FOREIGN KEY (reviewed_by) REFERENCES admins(id)
  );

  -- ============================================
  -- SEO
  -- ============================================

  CREATE TABLE IF NOT EXISTS seo_content (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_type TEXT NOT NULL,
    entity_id INTEGER,
    title TEXT,
    meta_description TEXT,
    editorial_content TEXT,
    ai_summary TEXT,
    faq_json TEXT,
    og_image TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS related_rankings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_city_id INTEGER,
    source_category_id INTEGER,
    related_city_id INTEGER,
    related_category_id INTEGER,
    relevance_score REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- ============================================
  -- SEARCH & ANALYTICS
  -- ============================================

  CREATE TABLE IF NOT EXISTS search_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT NOT NULL,
    results_count INTEGER DEFAULT 0,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS trending_searches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT UNIQUE NOT NULL,
    search_count INTEGER DEFAULT 1,
    last_searched DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS page_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_type TEXT NOT NULL,
    entity_id INTEGER,
    path TEXT,
    user_agent TEXT,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- ============================================
  -- SPONSORED LISTINGS
  -- ============================================

  CREATE TABLE IF NOT EXISTS sponsored_listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL,
    city_id INTEGER,
    category_id INTEGER,
    placement TEXT DEFAULT 'sidebar',
    start_date TEXT,
    end_date TEXT,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (business_id) REFERENCES businesses(id),
    FOREIGN KEY (city_id) REFERENCES cities(id),
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );

  -- ============================================
  -- AI JOB QUEUE
  -- ============================================

  CREATE TABLE IF NOT EXISTS ai_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_type TEXT NOT NULL,
    payload TEXT,
    status TEXT DEFAULT 'queued',
    result TEXT,
    error TEXT,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    scheduled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    started_at DATETIME,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- ============================================
  -- BADGES & CERTIFICATES
  -- ============================================

  CREATE TABLE IF NOT EXISTS badges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL,
    badge_type TEXT NOT NULL,
    image_data TEXT,
    generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (business_id) REFERENCES businesses(id)
  );

  CREATE TABLE IF NOT EXISTS certificates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL,
    rank_position INTEGER,
    ranking_date TEXT,
    city_name TEXT,
    category_name TEXT,
    image_data TEXT,
    generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (business_id) REFERENCES businesses(id)
  );

  -- ============================================
  -- INDEXES
  -- ============================================

  CREATE INDEX IF NOT EXISTS idx_businesses_city ON businesses(city_id);
  CREATE INDEX IF NOT EXISTS idx_businesses_category ON businesses(category_id);
  CREATE INDEX IF NOT EXISTS idx_businesses_slug ON businesses(slug);
  CREATE INDEX IF NOT EXISTS idx_businesses_active ON businesses(active);
  CREATE INDEX IF NOT EXISTS idx_businesses_name ON businesses(name);

  CREATE INDEX IF NOT EXISTS idx_ranking_history_business ON ranking_history(business_id);
  CREATE INDEX IF NOT EXISTS idx_ranking_history_city_cat ON ranking_history(city_id, category_id);
  CREATE INDEX IF NOT EXISTS idx_ranking_history_date ON ranking_history(ranking_date);
  CREATE INDEX IF NOT EXISTS idx_ranking_history_lookup ON ranking_history(city_id, category_id, ranking_date);

  CREATE INDEX IF NOT EXISTS idx_ranking_scores_business ON ranking_scores(business_id);

  CREATE INDEX IF NOT EXISTS idx_inquiries_status ON business_inquiries(status);
  CREATE INDEX IF NOT EXISTS idx_claims_status ON claim_requests(status);
  CREATE INDEX IF NOT EXISTS idx_claims_business ON claim_requests(business_id);

  CREATE INDEX IF NOT EXISTS idx_seo_content_page ON seo_content(page_type, entity_id);

  CREATE INDEX IF NOT EXISTS idx_search_log_created ON search_log(created_at);
  CREATE INDEX IF NOT EXISTS idx_search_log_query ON search_log(query);

  CREATE INDEX IF NOT EXISTS idx_page_views_type ON page_views(page_type, entity_id);
  CREATE INDEX IF NOT EXISTS idx_page_views_created ON page_views(created_at);

  CREATE INDEX IF NOT EXISTS idx_ai_jobs_status ON ai_jobs(status);
  CREATE INDEX IF NOT EXISTS idx_ai_jobs_type ON ai_jobs(job_type);

  CREATE INDEX IF NOT EXISTS idx_sponsored_active ON sponsored_listings(active, city_id, category_id);

  CREATE INDEX IF NOT EXISTS idx_cities_slug ON cities(slug);
  CREATE INDEX IF NOT EXISTS idx_cities_active ON cities(active);
`);

// ============================================
// ADD COLUMNS TO EXISTING TABLES (safe migration)
// ============================================

const safeAddColumn = (table, column, type) => {
  try {
    db.exec('ALTER TABLE ' + table + ' ADD COLUMN ' + column + ' ' + type);
  } catch (e) {
    // Column already exists — ignore
  }
};

// Cities - add slug columns
safeAddColumn('cities', 'slug', 'TEXT');
safeAddColumn('cities', 'state_slug', 'TEXT');
safeAddColumn('cities', 'description', 'TEXT');
safeAddColumn('cities', 'meta_description', 'TEXT');

// Categories - add description columns
safeAddColumn('categories', 'description', 'TEXT');
safeAddColumn('categories', 'meta_description', 'TEXT');

// Businesses - add new fields
safeAddColumn('businesses', 'tags', 'TEXT');
safeAddColumn('businesses', 'years_in_business', 'INTEGER DEFAULT 0');
safeAddColumn('businesses', 'social_url', 'TEXT');
safeAddColumn('businesses', 'claimed', 'INTEGER DEFAULT 0');
safeAddColumn('businesses', 'claim_verified_at', 'DATETIME');

// Ranking scores - add missing columns
safeAddColumn('ranking_scores', 'auto_score', 'REAL DEFAULT 0');
safeAddColumn('ranking_scores', 'manual_boost', 'REAL DEFAULT 0');
safeAddColumn('ranking_scores', 'completeness_score', 'REAL DEFAULT 0');
safeAddColumn('ranking_scores', 'verified_score', 'REAL DEFAULT 0');

// ============================================
// FTS5 VIRTUAL TABLE
// ============================================

try {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS businesses_fts USING fts5(
      name, description, tags,
      content='businesses', content_rowid='id'
    );
  `);
} catch (e) {
  console.log('FTS5 already exists or not available:', e.message);
}

// ============================================
// Update city slugs for existing records
// ============================================

const citiesWithoutSlug = db.prepare('SELECT id, name, state FROM cities WHERE slug IS NULL OR slug = \'\'').all();
const updateCitySlug = db.prepare('UPDATE cities SET slug = ?, state_slug = ? WHERE id = ?');
citiesWithoutSlug.forEach(function(city) {
  var slug = city.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  var stateSlug = city.state.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  updateCitySlug.run(slug, stateSlug, city.id);
});

console.log('✅ Database migrated successfully.');
console.log('   Tables: admins, cities, categories, businesses, ranking_history, ranking_scores,');
console.log('   achievements, business_inquiries, claim_requests, seo_content, related_rankings,');
console.log('   search_log, trending_searches, page_views, sponsored_listings, ai_jobs, badges, certificates');
console.log('   FTS5 virtual table: businesses_fts');
console.log('   Indexes: 20+ indexes created');
db.close();
