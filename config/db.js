/**
 * BBI — Database Configuration
 * SQLite with WAL mode, foreign keys, FTS5 support.
 * Designed for future MySQL migration compatibility.
 */

const Database = require('better-sqlite3');
const path = require('path');

let DB_PATH = process.env.DB_PATH || 'bbi.db';
if (!path.isAbsolute(DB_PATH)) {
  DB_PATH = path.join(__dirname, DB_PATH);
}
const db = new Database(DB_PATH);

// Performance & integrity pragmas
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.pragma('cache_size = -20000'); // 20MB cache

// Seamless migration for hierarchical combo SEO
try {
  db.exec('ALTER TABLE seo_content ADD COLUMN secondary_entity_id INTEGER');
} catch (e) {}

// Seamless migration for custom business attributes
try {
  db.exec('ALTER TABLE businesses ADD COLUMN custom_attributes TEXT');
} catch (e) {}

// Seamless migration for import system columns
try { db.exec('ALTER TABLE businesses ADD COLUMN services TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE businesses ADD COLUMN facebook_url TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE businesses ADD COLUMN instagram_url TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE businesses ADD COLUMN linkedin_url TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE businesses ADD COLUMN import_id INTEGER'); } catch (e) {}
try { db.exec('ALTER TABLE businesses ADD COLUMN bbi_score REAL DEFAULT 0'); } catch (e) {}
try { db.exec('ALTER TABLE businesses ADD COLUMN latitude REAL'); } catch (e) {}
try { db.exec('ALTER TABLE businesses ADD COLUMN longitude REAL'); } catch (e) {}
try { db.exec('ALTER TABLE businesses ADD COLUMN is_ranked INTEGER DEFAULT 1'); } catch (e) {}
try { db.exec('ALTER TABLE businesses ADD COLUMN ai_sentiment TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE businesses ADD COLUMN ai_sentiment_date DATETIME'); } catch (e) {}

// Create global site settings table
db.exec(`
  CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Create news table
db.exec(`
  CREATE TABLE IF NOT EXISTS news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    content TEXT,
    image TEXT,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Auto-migrate Programmatic SEO & AI Tables on boot for production
db.exec(`
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

  CREATE TABLE IF NOT EXISTS faqs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_type TEXT NOT NULL,
    entity_id INTEGER,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  
  CREATE TABLE IF NOT EXISTS states (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    active INTEGER DEFAULT 1,
    description TEXT,
    meta_description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS areas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    city_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (city_id) REFERENCES cities(id)
  );

  CREATE TABLE IF NOT EXISTS use_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );

  CREATE TABLE IF NOT EXISTS use_case_businesses (
    use_case_id INTEGER NOT NULL,
    business_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (use_case_id, business_id),
    FOREIGN KEY (use_case_id) REFERENCES use_cases(id),
    FOREIGN KEY (business_id) REFERENCES businesses(id)
  );

  CREATE TABLE IF NOT EXISTS seo_variations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    primary_url TEXT NOT NULL,
    variation_slug TEXT UNIQUE NOT NULL,
    mode TEXT DEFAULT 'canonical', 
    title TEXT,
    meta_description TEXT,
    h1 TEXT,
    content TEXT,
    faqs TEXT,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS seo_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    template_string TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS seo_landing_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    meta_description TEXT,
    h1 TEXT NOT NULL,
    hero_subtitle TEXT,
    content_intro TEXT,
    content_body TEXT,
    content_conclusion TEXT,
    faq_json TEXT DEFAULT '[]',
    internal_links_json TEXT DEFAULT '[]',
    linked_city_id INTEGER,
    linked_category_id INTEGER,
    og_image TEXT,
    schema_type TEXT DEFAULT 'WebPage',
    target_keywords TEXT,
    sort_order INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (linked_city_id) REFERENCES cities(id),
    FOREIGN KEY (linked_category_id) REFERENCES categories(id)
  );
`);
try { db.exec('ALTER TABLE businesses ADD COLUMN area_id INTEGER'); } catch (e) {}

/**
 * Run multiple statements in a transaction.
 * @param {Function} fn - Function receiving the db instance
 * @returns {*} Return value of fn
 */
function runTransaction(fn) {
  const transaction = db.transaction(fn);
  return transaction();
}

/**
 * Health check — returns true if DB is accessible.
 */
function isHealthy() {
  try {
    db.prepare('SELECT 1').get();
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = db;
module.exports.runTransaction = runTransaction;
module.exports.isHealthy = isHealthy;
module.exports.DB_PATH = DB_PATH;
