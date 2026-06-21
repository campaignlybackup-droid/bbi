/**
 * BBI — Inquiry Service
 * Business inquiry workflow: submit, list, approve, reject.
 * Implements M-08.
 */

const db = require('../config/db');
const { INQUIRY_STATUS } = require('../config/constants');
const { generateSlug } = require('../middleware/validation');

/**
 * Submit a new business inquiry (from Get Listed page).
 */
function submitInquiry(data) {
  const { business_name, contact_name, contact_email, contact_phone, city_id, category_id, website, description } = data;

  const result = db.prepare(`
    INSERT INTO business_inquiries (business_name, contact_name, contact_email, contact_phone, city_id, category_id, website, description, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(business_name, contact_name, contact_email, contact_phone, city_id || null, category_id || null, website || '', description || '', INQUIRY_STATUS.PENDING);

  return result.lastInsertRowid;
}

/**
 * Get inquiries with optional status filter.
 */
function getInquiries(status = null) {
  let sql = `
    SELECT bi.*, c.name as city_name, cat.name as cat_name, a.name as reviewer_name
    FROM business_inquiries bi
    LEFT JOIN cities c ON c.id = bi.city_id
    LEFT JOIN categories cat ON cat.id = bi.category_id
    LEFT JOIN admins a ON a.id = bi.reviewed_by
  `;
  const params = [];

  if (status) {
    sql += ` WHERE bi.status = ?`;
    params.push(status);
  }

  sql += ` ORDER BY bi.created_at DESC`;
  return db.prepare(sql).all(...params);
}

/**
 * Get a single inquiry by ID.
 */
function getInquiry(id) {
  return db.prepare(`
    SELECT bi.*, c.name as city_name, cat.name as cat_name
    FROM business_inquiries bi
    LEFT JOIN cities c ON c.id = bi.city_id
    LEFT JOIN categories cat ON cat.id = bi.category_id
    WHERE bi.id = ?
  `).get(id);
}

/**
 * Approve an inquiry — creates a new business from it.
 * Immediately triggers ranking recalculation and page rebuild.
 */
function approveInquiry(id, adminId) {
  const inquiry = getInquiry(id);
  if (!inquiry) throw new Error('Inquiry not found');
  if (inquiry.status !== INQUIRY_STATUS.PENDING) throw new Error('Inquiry already processed');

  const slug = generateSlug(inquiry.business_name);

  const transaction = db.transaction(() => {
    // Create business
    const bizResult = db.prepare(`
      INSERT INTO businesses (name, slug, category_id, city_id, website, description, phone)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      inquiry.business_name, slug,
      inquiry.category_id, inquiry.city_id,
      inquiry.website || '', inquiry.description || '',
      inquiry.contact_phone
    );

    // Create initial ranking scores with proper component calculation
    const { calculateScoreComponents } = require('./rankingService');
    const components = calculateScoreComponents({
      website: inquiry.website || '',
      verified: 0,
      description: inquiry.description || '',
      phone: inquiry.contact_phone || '',
      address: '',
      google_rating: 0,
      google_review_count: 0,
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
      bizResult.lastInsertRowid,
      components.review_score, components.volume_score, components.website_score,
      components.completeness_score, components.verified_score,
      components.auto_score, components.auto_score
    );

    // Update inquiry status
    db.prepare(`
      UPDATE business_inquiries SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(INQUIRY_STATUS.APPROVED, adminId, id);

    return bizResult.lastInsertRowid;
  });

  const bizId = transaction();

  // Immediately recalculate rankings and rebuild pages so ranking/SEO pages appear instantly
  try {
    const pageRebuildService = require('./pageRebuildService');
    pageRebuildService.rebuildForBusinesses([Number(bizId)]);
  } catch (rebuildErr) {
    console.error('Page rebuild after inquiry approval failed:', rebuildErr.message);
  }

  // Flush public page cache so updated rankings are visible immediately
  try {
    const { publicCache } = require('../routes/public');
    if (publicCache) publicCache.flushAll();
  } catch (e) { /* cache flush is best-effort */ }

  return bizId;
}

/**
 * Reject an inquiry with optional notes.
 */
function rejectInquiry(id, adminId, notes = '') {
  db.prepare(`
    UPDATE business_inquiries SET status = ?, admin_notes = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(INQUIRY_STATUS.REJECTED, notes, adminId, id);
}

/**
 * Get inquiry stats for admin dashboard.
 */
function getInquiryStats() {
  return {
    pending: db.prepare(`SELECT COUNT(*) as c FROM business_inquiries WHERE status='pending'`).get().c,
    approved: db.prepare(`SELECT COUNT(*) as c FROM business_inquiries WHERE status='approved'`).get().c,
    rejected: db.prepare(`SELECT COUNT(*) as c FROM business_inquiries WHERE status='rejected'`).get().c,
  };
}

module.exports = {
  submitInquiry,
  getInquiries,
  getInquiry,
  approveInquiry,
  rejectInquiry,
  getInquiryStats,
};
