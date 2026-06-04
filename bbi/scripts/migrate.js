const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '../config/bbi.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

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
    state TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    icon TEXT DEFAULT 'ti-building-store',
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
    google_rating REAL DEFAULT 0,
    google_review_count INTEGER DEFAULT 0,
    verified INTEGER DEFAULT 0,
    sponsored INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (city_id) REFERENCES cities(id)
  );

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
    social_score REAL DEFAULT 0,
    years_score REAL DEFAULT 0,
    editorial_score REAL DEFAULT 0,
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
`);

console.log('✅ Database migrated successfully.');
db.close();
