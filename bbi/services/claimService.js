/**
 * BBI — Claim Service
 * Business claim and verification workflow.
 */

const db = require('../config/db');
const { CLAIM_STATUS } = require('../config/constants');

function submitClaim(businessId, data) {
  const { contact_name, contact_email, contact_phone, verification_details } = data;

  // Check business exists
  const business = db.prepare(`SELECT id, name FROM businesses WHERE id = ? AND active = 1`).get(businessId);
  if (!business) throw new Error('Business not found');

  // Check no pending claims
  const existing = db.prepare(`SELECT id FROM claim_requests WHERE business_id = ? AND status = 'pending'`).get(businessId);
  if (existing) throw new Error('A claim request is already pending for this business.');

  const result = db.prepare(`
    INSERT INTO claim_requests (business_id, contact_name, contact_email, contact_phone, verification_details, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(businessId, contact_name, contact_email, contact_phone, verification_details, CLAIM_STATUS.PENDING);

  return result.lastInsertRowid;
}

function getClaims(status = null) {
  let sql = `
    SELECT cr.*, b.name as business_name, b.slug as business_slug,
           c.name as city_name, cat.name as cat_name, a.name as reviewer_name
    FROM claim_requests cr
    JOIN businesses b ON b.id = cr.business_id
    LEFT JOIN cities c ON c.id = b.city_id
    LEFT JOIN categories cat ON cat.id = b.category_id
    LEFT JOIN admins a ON a.id = cr.reviewed_by
  `;
  const params = [];
  if (status) { sql += ` WHERE cr.status = ?`; params.push(status); }
  sql += ` ORDER BY cr.created_at DESC`;
  return db.prepare(sql).all(...params);
}

function verifyClaim(claimId, adminId) {
  const claim = db.prepare(`SELECT * FROM claim_requests WHERE id = ?`).get(claimId);
  if (!claim) throw new Error('Claim not found');

  const transaction = db.transaction(() => {
    db.prepare(`UPDATE claim_requests SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(CLAIM_STATUS.VERIFIED, adminId, claimId);

    db.prepare(`UPDATE businesses SET claimed = 1, claim_verified_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(claim.business_id);
  });

  transaction();
}

function rejectClaim(claimId, adminId, notes = '') {
  db.prepare(`UPDATE claim_requests SET status = ?, admin_notes = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(CLAIM_STATUS.REJECTED, notes, adminId, claimId);
}

function getClaimStats() {
  return {
    pending: db.prepare(`SELECT COUNT(*) as c FROM claim_requests WHERE status='pending'`).get().c,
    verified: db.prepare(`SELECT COUNT(*) as c FROM claim_requests WHERE status='verified'`).get().c,
    rejected: db.prepare(`SELECT COUNT(*) as c FROM claim_requests WHERE status='rejected'`).get().c,
  };
}

module.exports = { submitClaim, getClaims, verifyClaim, rejectClaim, getClaimStats };
