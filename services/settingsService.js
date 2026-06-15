const db = require('../config/db');

// Cache to avoid hitting DB on every single page load
let settingsCache = null;
let lastCacheTime = 0;
const CACHE_TTL = 60 * 1000; // 1 minute

function getAllSettings() {
  const now = Date.now();
  if (settingsCache && (now - lastCacheTime < CACHE_TTL)) {
    return settingsCache;
  }

  const rows = db.prepare('SELECT key, value FROM site_settings').all();
  const settings = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  
  settingsCache = settings;
  lastCacheTime = now;
  return settings;
}

function getSetting(key, defaultValue = '') {
  const settings = getAllSettings();
  return settings[key] !== undefined ? settings[key] : defaultValue;
}

function updateSettings(settingsObj) {
  const stmt = db.prepare(`
    INSERT INTO site_settings (key, value, updated_at) 
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);
  
  db.transaction(() => {
    for (const [key, value] of Object.entries(settingsObj)) {
      stmt.run(key, value || '');
    }
  })();

  // Invalidate cache
  settingsCache = null;
}

module.exports = {
  getAllSettings,
  getSetting,
  updateSettings
};
