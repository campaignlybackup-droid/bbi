/**
 * BBI — Database Configuration
 * SQLite with WAL mode, foreign keys, FTS5 support.
 * Designed for future MySQL migration compatibility.
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, process.env.DB_PATH || 'bbi.db');
const db = new Database(DB_PATH);

// Performance & integrity pragmas
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.pragma('cache_size = -20000'); // 20MB cache

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
