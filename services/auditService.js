/**
 * BBI — Audit Service
 * Tracks all changes to entities with old/new values, admin identity, and timestamps.
 * Provides paginated, filterable audit log queries.
 */

const db = require('../config/db');

/**
 * Log an audit entry.
 * @param {string} entityType - business, city, category, import, ranking, claim
 * @param {number|null} entityId - ID of the entity
 * @param {string} action - create, update, delete, import, rollback, score_change
 * @param {object} options - { field_name, old_value, new_value, admin_id, admin_name, ip_address, metadata }
 */
function log(entityType, entityId, action, options = {}) {
  try {
    db.prepare(`
      INSERT INTO audit_logs (entity_type, entity_id, action, field_name, old_value, new_value, admin_id, admin_name, ip_address, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entityType,
      entityId || null,
      action,
      options.field_name || null,
      options.old_value != null ? String(options.old_value) : null,
      options.new_value != null ? String(options.new_value) : null,
      options.admin_id || null,
      options.admin_name || null,
      options.ip_address || null,
      options.metadata ? JSON.stringify(options.metadata) : null
    );
  } catch (e) {
    console.error('Audit log failed:', e.message);
  }
}

/**
 * Log multiple field changes for a single entity in one batch.
 * @param {string} entityType
 * @param {number} entityId
 * @param {string} action
 * @param {object} oldValues - { field1: 'old', field2: 'old' }
 * @param {object} newValues - { field1: 'new', field2: 'new' }
 * @param {object} options - { admin_id, admin_name, ip_address }
 */
function logChanges(entityType, entityId, action, oldValues, newValues, options = {}) {
  const insert = db.prepare(`
    INSERT INTO audit_logs (entity_type, entity_id, action, field_name, old_value, new_value, admin_id, admin_name, ip_address, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    for (const field of Object.keys(newValues)) {
      const oldVal = oldValues[field];
      const newVal = newValues[field];
      // Only log if the value actually changed
      if (String(oldVal || '') !== String(newVal || '')) {
        insert.run(
          entityType, entityId, action, field,
          oldVal != null ? String(oldVal) : null,
          newVal != null ? String(newVal) : null,
          options.admin_id || null,
          options.admin_name || null,
          options.ip_address || null,
          null
        );
      }
    }
  });

  try {
    transaction();
  } catch (e) {
    console.error('Audit log batch failed:', e.message);
  }
}

/**
 * Get paginated audit logs with optional filters.
 * @param {object} filters - { entity_type, entity_id, action, admin_id, from_date, to_date }
 * @param {number} page - 1-indexed
 * @param {number} limit
 */
function getAuditLogs(filters = {}, page = 1, limit = 50) {
  let where = '1=1';
  const params = [];

  if (filters.entity_type) {
    where += ' AND entity_type = ?';
    params.push(filters.entity_type);
  }
  if (filters.entity_id) {
    where += ' AND entity_id = ?';
    params.push(filters.entity_id);
  }
  if (filters.action) {
    where += ' AND action = ?';
    params.push(filters.action);
  }
  if (filters.admin_id) {
    where += ' AND admin_id = ?';
    params.push(filters.admin_id);
  }
  if (filters.from_date) {
    where += ' AND created_at >= ?';
    params.push(filters.from_date);
  }
  if (filters.to_date) {
    where += ' AND created_at <= ?';
    params.push(filters.to_date + ' 23:59:59');
  }

  const total = db.prepare(`SELECT COUNT(*) as c FROM audit_logs WHERE ${where}`).get(...params).c;
  const offset = (page - 1) * limit;

  const logs = db.prepare(`
    SELECT * FROM audit_logs
    WHERE ${where}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  return {
    logs,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Get audit history for a specific entity.
 */
function getEntityHistory(entityType, entityId, limit = 100) {
  return db.prepare(`
    SELECT * FROM audit_logs
    WHERE entity_type = ? AND entity_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(entityType, entityId, limit);
}

/**
 * Get audit stats for the dashboard.
 */
function getAuditStats() {
  try {
    return {
      today: db.prepare(`SELECT COUNT(*) as c FROM audit_logs WHERE created_at >= date('now')`).get().c,
      thisWeek: db.prepare(`SELECT COUNT(*) as c FROM audit_logs WHERE created_at >= date('now', '-7 days')`).get().c,
      total: db.prepare(`SELECT COUNT(*) as c FROM audit_logs`).get().c,
    };
  } catch (e) {
    return { today: 0, thisWeek: 0, total: 0 };
  }
}

module.exports = {
  log,
  logChanges,
  getAuditLogs,
  getEntityHistory,
  getAuditStats,
};
