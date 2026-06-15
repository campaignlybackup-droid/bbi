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

// Create global site settings table
db.exec(`
  CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

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
