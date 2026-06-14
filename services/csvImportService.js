/**
 * BBI — CSV Import Service
 * Core engine for bulk CSV import: validation, import, rollback, status tracking.
 * Reuses existing ranking, SEO, search, and AI services.
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const db = require('../config/db');
const { CSV_REQUIRED_COLUMNS, IMPORT_STATUS, IMPORT_ROW_STATUS } = require('../config/constants');
const { calculateScoreComponents } = require('./rankingService');
const { calculateBBIScore } = require('./bbiScoringService');
const searchService = require('./searchService');
const jobQueue = require('./ai/jobQueue');
const auditService = require('./auditService');
const pageRebuildService = require('./pageRebuildService');

// ============================================
// VALIDATION
// ============================================

/**
 * Validate a CSV file and return a structured report.
 * @param {string} filePath - Absolute path to the uploaded CSV
 * @returns {object} { valid, errors[], warnings[], rows[], duplicates[], stats }
 */
function validateCSV(filePath) {
  const report = {
    valid: true,
    errors: [],
    warnings: [],
    rows: [],
    duplicates: [],
    stats: { total: 0, valid: 0, invalid: 0, duplicate: 0 },
  };

  // Read and parse CSV
  let rawContent;
  try {
    rawContent = fs.readFileSync(filePath, 'utf-8');
  } catch (e) {
    report.valid = false;
    report.errors.push({ row: 0, field: 'file', message: 'Cannot read CSV file: ' + e.message });
    return report;
  }

  let records;
  try {
    records = parse(rawContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
      relax_column_count: true,
    });
  } catch (e) {
    report.valid = false;
    report.errors.push({ row: 0, field: 'file', message: 'CSV parse error: ' + e.message });
    return report;
  }

  if (records.length === 0) {
    report.valid = false;
    report.errors.push({ row: 0, field: 'file', message: 'CSV file is empty.' });
    return report;
  }

  // Check required columns
  const headers = Object.keys(records[0]).map(h => h.toLowerCase().trim());
  const missingColumns = CSV_REQUIRED_COLUMNS.filter(col => !headers.includes(col));
  if (missingColumns.length > 0) {
    report.valid = false;
    report.errors.push({
      row: 0,
      field: 'columns',
      message: `Missing required columns: ${missingColumns.join(', ')}`,
    });
    return report;
  }

  // Normalize column names (lowercase) and sanitize for formula injection
  const normalizedRecords = records.map(row => {
    const normalized = {};
    for (const [key, value] of Object.entries(row)) {
      let val = (value || '').trim();
      // CSV Formula Injection Protection
      if (/^[=+\-@]/.test(val)) {
        val = "'" + val;
      }
      normalized[key.toLowerCase().trim()] = val;
    }
    return normalized;
  });

  // Track seen names for duplicate detection within CSV
  const seenNames = new Map();

  // Validate each row
  normalizedRecords.forEach((row, index) => {
    const rowNum = index + 2; // +2 because CSV has header row and is 1-indexed
    const rowErrors = [];
    const rowWarnings = [];

    // Required field: business_name
    if (!row.business_name || row.business_name.length < 2) {
      rowErrors.push({ field: 'business_name', message: 'Business name is required (min 2 chars).' });
    }

    // Required field: category
    if (!row.category || row.category.length < 2) {
      rowErrors.push({ field: 'category', message: 'Category is required.' });
    }

    // Required field: city
    if (!row.city || row.city.length < 2) {
      rowErrors.push({ field: 'city', message: 'City is required.' });
    }

    // Required field: state
    if (!row.state || row.state.length < 2) {
      rowErrors.push({ field: 'state', message: 'State is required.' });
    }

    // Validate email
    if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
      rowErrors.push({ field: 'email', message: `Invalid email: ${row.email}` });
    }

    // Validate phone
    if (row.phone && !/^[\d\s\-\+\(\)]{7,20}$/.test(row.phone)) {
      rowErrors.push({ field: 'phone', message: `Invalid phone number: ${row.phone}` });
    }

    // Validate URLs
    const urlFields = ['website', 'facebook', 'instagram', 'linkedin'];
    urlFields.forEach(field => {
      if (row[field] && row[field].length > 0) {
        if (!/^https?:\/\/.+\..+/.test(row[field]) && !/^www\..+\..+/.test(row[field])) {
          rowWarnings.push({ field, message: `Possibly invalid URL: ${row[field]}` });
        }
      }
    });

    // Validate google_rating
    if (row.google_rating) {
      const rating = parseFloat(row.google_rating);
      if (isNaN(rating) || rating < 0 || rating > 5) {
        rowErrors.push({ field: 'google_rating', message: `Rating must be 0-5, got: ${row.google_rating}` });
      }
    }

    // Validate review_count
    if (row.review_count) {
      const count = parseInt(row.review_count);
      if (isNaN(count) || count < 0) {
        rowErrors.push({ field: 'review_count', message: `Review count must be positive, got: ${row.review_count}` });
      }
    }

    // Validate year_established
    if (row.year_established) {
      const year = parseInt(row.year_established);
      const currentYear = new Date().getFullYear();
      if (isNaN(year) || year < 1800 || year > currentYear) {
        rowWarnings.push({ field: 'year_established', message: `Unusual year: ${row.year_established}` });
      }
    }

    // Check for duplicate within CSV
    const nameKey = (row.business_name || '').toLowerCase() + '|' + (row.city || '').toLowerCase();
    if (seenNames.has(nameKey)) {
      report.duplicates.push({
        row: rowNum,
        business_name: row.business_name,
        city: row.city,
        firstSeen: seenNames.get(nameKey),
      });
      report.stats.duplicate++;
    } else {
      seenNames.set(nameKey, rowNum);
    }

    // Check for existing business in database
    const slug = generateBusinessSlug(row.business_name, row.city);
    const existing = db.prepare(`SELECT id, name FROM businesses WHERE slug = ? AND active = 1`).get(slug);
    if (existing) {
      rowWarnings.push({
        field: 'business_name',
        message: `Business "${existing.name}" already exists with slug "${slug}". Will be skipped.`,
        existingId: existing.id,
      });
    }

    // Build row report
    const rowReport = {
      row: rowNum,
      data: row,
      slug,
      errors: rowErrors,
      warnings: rowWarnings,
      valid: rowErrors.length === 0,
      existing: existing ? existing.id : null,
    };

    report.rows.push(rowReport);

    if (rowErrors.length > 0) {
      report.stats.invalid++;
      rowErrors.forEach(e => report.errors.push({ row: rowNum, ...e }));
    } else {
      report.stats.valid++;
    }
    rowWarnings.forEach(w => report.warnings.push({ row: rowNum, ...w }));
  });

  report.stats.total = normalizedRecords.length;
  report.valid = report.stats.invalid === 0 && report.errors.filter(e => e.row === 0).length === 0;

  return report;
}

/**
 * Generate a business slug: business-name-city
 */
function generateBusinessSlug(businessName, city) {
  const base = `${businessName} ${city}`;
  return base
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// ============================================
// IMPORT CREATION
// ============================================

/**
 * Create an import record and store validation results.
 * @param {string} filename - Original filename
 * @param {object} validationReport - From validateCSV()
 * @param {number} adminId
 * @returns {number} Import ID
 */
function createImport(filename, validationReport, adminId) {
  const result = db.prepare(`
    INSERT INTO csv_imports (filename, total_rows, status, validation_report, admin_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    filename,
    validationReport.stats.total,
    validationReport.valid ? IMPORT_STATUS.VALIDATED : IMPORT_STATUS.FAILED,
    JSON.stringify(validationReport),
    adminId
  );

  const importId = result.lastInsertRowid;

  // Store each row
  const insertRow = db.prepare(`
    INSERT INTO csv_import_rows (import_id, row_number, raw_data, status)
    VALUES (?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    validationReport.rows.forEach(row => {
      insertRow.run(
        importId,
        row.row,
        JSON.stringify(row.data),
        row.valid ? IMPORT_ROW_STATUS.PENDING : IMPORT_ROW_STATUS.FAILED
      );
    });
  });

  transaction();

  auditService.log('import', importId, 'create', {
    admin_id: adminId,
    metadata: { filename, total_rows: validationReport.stats.total },
  });

  return importId;
}

// ============================================
// IMPORT EXECUTION
// ============================================

/**
 * Execute the import — processes all pending rows.
 * This runs synchronously in the same process (SQLite is single-threaded anyway).
 * For true background processing, wrap this call in a setImmediate/setTimeout.
 *
 * @param {number} importId
 * @param {number} adminId
 * @returns {object} Import result summary
 */
function executeImport(importId, adminId) {
  const importRecord = db.prepare(`SELECT * FROM csv_imports WHERE id = ?`).get(importId);
  if (!importRecord) throw new Error('Import not found');
  if (importRecord.status !== IMPORT_STATUS.VALIDATED) {
    throw new Error('Import is not in validated state');
  }

  // Mark as importing
  db.prepare(`UPDATE csv_imports SET status = ?, started_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(IMPORT_STATUS.IMPORTING, importId);

  const rows = db.prepare(`
    SELECT * FROM csv_import_rows
    WHERE import_id = ? AND status = ?
    ORDER BY row_number ASC
  `).all(importId, IMPORT_ROW_STATUS.PENDING);

  let imported = 0;
  let failed = 0;
  let skipped = 0;
  const importedBusinessIds = [];

  const updateRowStatus = db.prepare(`
    UPDATE csv_import_rows SET status = ?, business_id = ?, error = ? WHERE id = ?
  `);

  for (const row of rows) {
    try {
      const data = JSON.parse(row.raw_data);
      const result = importSingleRow(data, importId, adminId);

      if (result.skipped) {
        updateRowStatus.run(IMPORT_ROW_STATUS.SKIPPED, null, result.reason, row.id);
        skipped++;
      } else {
        updateRowStatus.run(IMPORT_ROW_STATUS.IMPORTED, result.businessId, null, row.id);
        importedBusinessIds.push(result.businessId);
        imported++;
      }
    } catch (e) {
      updateRowStatus.run(IMPORT_ROW_STATUS.FAILED, null, e.message, row.id);
      failed++;
    }
  }

  // Update import totals
  db.prepare(`
    UPDATE csv_imports SET
      imported_rows = ?,
      failed_rows = ?,
      skipped_rows = ?,
      status = ?,
      completed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(imported, failed, skipped, IMPORT_STATUS.GENERATING_CONTENT, importId);

  // Enqueue AI content generation for all imported businesses
  importedBusinessIds.forEach(bizId => {
    const bInfo = db.prepare(`
      SELECT b.name, c.name as city_name, cat.name as cat_name, b.verified
      FROM businesses b
      LEFT JOIN cities c ON c.id = b.city_id
      LEFT JOIN categories cat ON cat.id = b.category_id
      WHERE b.id = ?
    `).get(bizId);

    if (bInfo) {
      // Enqueue comprehensive import content generation
      jobQueue.enqueue('import_content_generate', {
        business_id: bizId,
        name: bInfo.name,
        city_name: bInfo.city_name,
        cat_name: bInfo.cat_name,
        verified: bInfo.verified,
        import_id: importId,
      });

      // Also enqueue standard listing + FAQ generation
      jobQueue.enqueue('listing_generate', bInfo);
      jobQueue.enqueue('faq_generate', bInfo);
    }
  });

  // Rebuild affected pages (rankings, city pages, category pages)
  if (importedBusinessIds.length > 0) {
    try {
      pageRebuildService.rebuildForBusinesses(importedBusinessIds);
    } catch (e) {
      console.error('Page rebuild failed:', e.message);
    }
  }

  // Mark as completed
  db.prepare(`UPDATE csv_imports SET status = ? WHERE id = ?`)
    .run(IMPORT_STATUS.COMPLETED, importId);

  auditService.log('import', importId, 'complete', {
    admin_id: adminId,
    metadata: { imported, failed, skipped, total: rows.length },
  });

  return { imported, failed, skipped, total: rows.length, businessIds: importedBusinessIds };
}

/**
 * Import a single CSV row into the database.
 * @param {object} data - Normalized CSV row data
 * @param {number} importId
 * @param {number} adminId
 * @returns {object} { businessId, skipped?, reason? }
 */
function importSingleRow(data, importId, adminId) {
  // 1. Find or create city
  const cityId = findOrCreateCity(data.city, data.state);

  // 2. Find or create category
  const categoryId = findOrCreateCategory(data.category);

  // 3. Generate slug
  const slug = generateBusinessSlug(data.business_name, data.city);

  // 4. Check for existing business
  const existing = db.prepare(`SELECT id FROM businesses WHERE slug = ? AND active = 1`).get(slug);
  if (existing) {
    return { skipped: true, reason: `Business with slug "${slug}" already exists (ID: ${existing.id}).` };
  }

  // 5. Sanitize and prepare data
  const phone = sanitize(data.phone);
  const email = sanitize(data.email);
  const website = sanitize(data.website);
  const address = sanitize(data.address);
  const services = sanitize(data.services);
  const facebook = sanitize(data.facebook);
  const instagram = sanitize(data.instagram);
  const linkedin = sanitize(data.linkedin);
  const googleRating = parseFloat(data.google_rating) || 0;
  const reviewCount = parseInt(data.review_count) || 0;
  const yearEstablished = parseInt(data.year_established) || 0;
  const currentYear = new Date().getFullYear();
  const yearsInBusiness = yearEstablished > 0 ? currentYear - yearEstablished : 0;

  // 6. Insert business
  const result = db.prepare(`
    INSERT INTO businesses (
      name, slug, category_id, city_id, address, phone, email, website,
      google_rating, google_review_count, years_in_business,
      services, facebook_url, instagram_url, linkedin_url,
      import_id, active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    data.business_name, slug, categoryId, cityId,
    address, phone, email, website,
    googleRating, reviewCount, yearsInBusiness,
    services, facebook, instagram, linkedin,
    importId
  );

  const businessId = result.lastInsertRowid;

  // 7. Calculate BBI Score (formula-based, no AI)
  const bbiScore = calculateBBIScore({
    google_rating: googleRating,
    google_review_count: reviewCount,
    website,
    facebook_url: facebook,
    instagram_url: instagram,
    linkedin_url: linkedin,
    phone,
    address,
    email,
    services,
    description: '', // Will be generated by AI later
    verified: 0,
  });

  db.prepare(`UPDATE businesses SET bbi_score = ? WHERE id = ?`).run(bbiScore, businessId);

  // 8. Calculate and store ranking score components (reuse existing system)
  const components = calculateScoreComponents({
    website,
    verified: 0,
    description: '',
    phone,
    address,
    google_rating: googleRating,
    google_review_count: reviewCount,
    social_url: facebook || instagram || linkedin,
  });

  db.prepare(`
    INSERT INTO ranking_scores (business_id, review_score, volume_score, website_score,
      completeness_score, verified_score, editorial_score, auto_score, manual_boost, final_score)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, 0, ?)
    ON CONFLICT(business_id) DO UPDATE SET
      review_score=excluded.review_score, volume_score=excluded.volume_score,
      website_score=excluded.website_score, completeness_score=excluded.completeness_score,
      verified_score=excluded.verified_score, auto_score=excluded.auto_score,
      final_score=excluded.final_score, last_calculated=CURRENT_TIMESTAMP
  `).run(
    businessId,
    components.review_score, components.volume_score, components.website_score,
    components.completeness_score, components.verified_score,
    components.auto_score, components.auto_score
  );

  // 9. Update FTS index
  searchService.updateFtsForBusiness(businessId);

  // 10. Audit log
  auditService.log('business', businessId, 'import', {
    admin_id: adminId,
    metadata: { import_id: importId, slug, bbi_score: bbiScore },
  });

  return { businessId };
}

// ============================================
// CITY / CATEGORY RESOLUTION
// ============================================

/**
 * Find existing city or create a new one.
 */
function findOrCreateCity(cityName, stateName) {
  const slug = cityName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const stateSlug = stateName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  // Try exact slug match first
  let city = db.prepare(`SELECT id FROM cities WHERE slug = ? AND active = 1`).get(slug);
  if (city) return city.id;

  // Try name match
  city = db.prepare(`SELECT id FROM cities WHERE LOWER(name) = LOWER(?) AND active = 1`).get(cityName);
  if (city) return city.id;

  // Create new city
  const result = db.prepare(`
    INSERT INTO cities (name, slug, state, state_slug, active)
    VALUES (?, ?, ?, ?, 1)
  `).run(cityName, slug, stateName, stateSlug);

  console.log(`  ✨ Created new city: ${cityName}, ${stateName}`);
  return result.lastInsertRowid;
}

/**
 * Find existing category or create a new one.
 */
function findOrCreateCategory(categoryName) {
  const slug = categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  // Try exact slug match first
  let cat = db.prepare(`SELECT id FROM categories WHERE slug = ? AND active = 1`).get(slug);
  if (cat) return cat.id;

  // Try name match
  cat = db.prepare(`SELECT id FROM categories WHERE LOWER(name) = LOWER(?) AND active = 1`).get(categoryName);
  if (cat) return cat.id;

  // Create new category
  const result = db.prepare(`
    INSERT INTO categories (name, slug, active)
    VALUES (?, ?, 1)
  `).run(categoryName, slug);

  console.log(`  ✨ Created new category: ${categoryName}`);
  return result.lastInsertRowid;
}

// ============================================
// ROLLBACK
// ============================================

/**
 * Rollback an entire import — soft-deletes all imported businesses.
 * @param {number} importId
 * @param {number} adminId
 */
function rollbackImport(importId, adminId) {
  const importRecord = db.prepare(`SELECT * FROM csv_imports WHERE id = ?`).get(importId);
  if (!importRecord) throw new Error('Import not found');

  if (importRecord.status === IMPORT_STATUS.ROLLED_BACK) {
    throw new Error('Import has already been rolled back.');
  }

  const importedRows = db.prepare(`
    SELECT business_id FROM csv_import_rows
    WHERE import_id = ? AND business_id IS NOT NULL AND status = ?
  `).all(importId, IMPORT_ROW_STATUS.IMPORTED);

  const businessIds = importedRows.map(r => r.business_id);

  if (businessIds.length === 0) {
    db.prepare(`UPDATE csv_imports SET status = ? WHERE id = ?`)
      .run(IMPORT_STATUS.ROLLED_BACK, importId);
    return { rolledBack: 0 };
  }

  const placeholders = businessIds.map(() => '?').join(',');

  const transaction = db.transaction(() => {
    // Soft-delete businesses
    db.prepare(`UPDATE businesses SET active = 0 WHERE id IN (${placeholders})`).run(...businessIds);

    // Remove ranking history for these businesses
    db.prepare(`DELETE FROM ranking_history WHERE business_id IN (${placeholders})`).run(...businessIds);

    // Remove ranking scores
    db.prepare(`DELETE FROM ranking_scores WHERE business_id IN (${placeholders})`).run(...businessIds);

    // Remove FTS entries
    try {
      db.prepare(`DELETE FROM businesses_fts WHERE rowid IN (${placeholders})`).run(...businessIds);
    } catch (e) {
      // FTS cleanup failed — not critical
    }

    // Mark import as rolled back
    db.prepare(`UPDATE csv_imports SET status = ? WHERE id = ?`)
      .run(IMPORT_STATUS.ROLLED_BACK, importId);

    // Mark all import rows as rolled back
    db.prepare(`UPDATE csv_import_rows SET status = 'rolled_back' WHERE import_id = ? AND status = ?`)
      .run(importId, IMPORT_ROW_STATUS.IMPORTED);
  });

  transaction();

  auditService.log('import', importId, 'rollback', {
    admin_id: adminId,
    metadata: { businesses_rolled_back: businessIds.length },
  });

  console.log(`🔄 Import #${importId} rolled back: ${businessIds.length} businesses deactivated.`);

  return { rolledBack: businessIds.length };
}

// ============================================
// STATUS & HISTORY
// ============================================

/**
 * Get real-time import status for the progress UI.
 */
function getImportStatus(importId) {
  const importRecord = db.prepare(`SELECT * FROM csv_imports WHERE id = ?`).get(importId);
  if (!importRecord) return null;

  const rowStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'imported' THEN 1 ELSE 0 END) as imported,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN seo_status = 'completed' THEN 1 ELSE 0 END) as seo_done,
      SUM(CASE WHEN content_status = 'completed' THEN 1 ELSE 0 END) as content_done
    FROM csv_import_rows WHERE import_id = ?
  `).get(importId);

  return {
    ...importRecord,
    validation_report: importRecord.validation_report ? JSON.parse(importRecord.validation_report) : null,
    rowStats,
    progress: rowStats.total > 0
      ? Math.round(((rowStats.imported + rowStats.failed + rowStats.skipped) / rowStats.total) * 100)
      : 0,
  };
}

/**
 * Get paginated import history.
 */
function getImportHistory(page = 1, limit = 20) {
  const total = db.prepare(`SELECT COUNT(*) as c FROM csv_imports`).get().c;
  const offset = (page - 1) * limit;

  const imports = db.prepare(`
    SELECT ci.*, a.name as admin_name
    FROM csv_imports ci
    LEFT JOIN admins a ON a.id = ci.admin_id
    ORDER BY ci.created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);

  return {
    imports,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Get full import details with per-row breakdown.
 */
function getImportDetails(importId) {
  const importRecord = db.prepare(`
    SELECT ci.*, a.name as admin_name
    FROM csv_imports ci
    LEFT JOIN admins a ON a.id = ci.admin_id
    WHERE ci.id = ?
  `).get(importId);

  if (!importRecord) return null;

  const rows = db.prepare(`
    SELECT cir.*, b.name as business_name, b.slug as business_slug
    FROM csv_import_rows cir
    LEFT JOIN businesses b ON b.id = cir.business_id
    WHERE cir.import_id = ?
    ORDER BY cir.row_number ASC
  `).all(importId);

  return {
    ...importRecord,
    validation_report: importRecord.validation_report ? JSON.parse(importRecord.validation_report) : null,
    rows,
  };
}

/**
 * Get import stats for the dashboard.
 */
function getImportStats() {
  try {
    return {
      total: db.prepare(`SELECT COUNT(*) as c FROM csv_imports`).get().c,
      completed: db.prepare(`SELECT COUNT(*) as c FROM csv_imports WHERE status = 'completed'`).get().c,
      failed: db.prepare(`SELECT COUNT(*) as c FROM csv_imports WHERE status = 'failed'`).get().c,
      totalImported: db.prepare(`SELECT COALESCE(SUM(imported_rows), 0) as c FROM csv_imports WHERE status = 'completed'`).get().c,
    };
  } catch (e) {
    return { total: 0, completed: 0, failed: 0, totalImported: 0 };
  }
}

// ============================================
// HELPERS
// ============================================

function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

module.exports = {
  validateCSV,
  generateBusinessSlug,
  createImport,
  executeImport,
  rollbackImport,
  getImportStatus,
  getImportHistory,
  getImportDetails,
  getImportStats,
};
