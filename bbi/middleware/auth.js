function requireAuth(req, res, next) {
  if (req.session && req.session.adminId) return next();
  req.flash('error', 'Please log in to access the admin panel.');
  res.redirect('/admin/login');
}

function requireSuperAdmin(req, res, next) {
  if (req.session && req.session.adminRole === 'superadmin') return next();
  req.flash('error', 'Access denied.');
  res.redirect('/admin');
}

module.exports = { requireAuth, requireSuperAdmin };
