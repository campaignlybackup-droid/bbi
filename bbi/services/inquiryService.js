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

    // Create initial ranking scores
    db.prepare(`
      INSERT INTO ranking_scores (business_id, final_score, auto_score) VALUES (?, 0, 0)
    `).run(bizResult.lastInsertRowid);

    // Update inquiry status
    db.prepare(`
      UPDATE business_inquiries SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(INQUIRY_STATUS.APPROVED, adminId, id);

    return bizResult.lastInsertRowid;
  });

  return transaction();
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
