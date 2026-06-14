/**
 * BBI — Input Validation Middleware
 * Centralized validation for all form submissions.
 */

function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str.trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function generateSlug(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function validateBusiness(req, res, next) {
  const { name, category_id, city_id, address, phone, website, description } = req.body;
  const errors = [];

  if (!name || name.trim().length < 2) errors.push('Business name is required (min 2 characters).');
  if (name && name.length > 100) errors.push('Business name cannot exceed 100 characters.');
  if (address && address.length > 300) errors.push('Address cannot exceed 300 characters.');
  if (phone && phone.length > 20) errors.push('Phone cannot exceed 20 characters.');
  if (website && website.length > 255) errors.push('Website cannot exceed 255 characters.');
  if (description && description.length > 3000) errors.push('Description cannot exceed 3000 characters.');

  if (!category_id) errors.push('Category is required.');
  if (!city_id) errors.push('City is required.');

  if (req.body.google_rating) {
    const r = parseFloat(req.body.google_rating);
    if (isNaN(r) || r < 0 || r > 5) errors.push('Google rating must be between 0 and 5.');
  }
  if (req.body.google_review_count) {
    const v = parseInt(req.body.google_review_count);
    if (isNaN(v) || v < 0) errors.push('Review count must be a positive number.');
  }
  if (req.body.editorial_score) {
    const e = parseFloat(req.body.editorial_score);
    if (isNaN(e) || e < 0 || e > 15) errors.push('Editorial score must be between 0 and 15.');
  }
  if (req.body.manual_boost) {
    const b = parseFloat(req.body.manual_boost);
    if (isNaN(b) || b < 0 || b > 10) errors.push('Manual boost must be between 0 and 10.');
  }

  if (errors.length) {
    req.flash('error', errors.join(' '));
    return res.redirect('back');
  }

  // Sanitize
  req.body.name = sanitizeString(req.body.name);
  req.body.address = sanitizeString(req.body.address || '');
  req.body.phone = sanitizeString(req.body.phone || '');
  req.body.website = sanitizeString(req.body.website || '');
  req.body.description = sanitizeString(req.body.description || '');

  next();
}

function validateInquiry(req, res, next) {
  // Honeypot check
  if (req.body.website_confirm) {
    // Bot detected, silently redirect
    return res.redirect('/get-listed');
  }

  const { business_name, contact_name, contact_email, contact_phone, city_id, category_id, description } = req.body;
  const errors = [];

  if (!business_name || business_name.trim().length < 2) errors.push('Business name is required.');
  if (business_name && business_name.length > 100) errors.push('Business name cannot exceed 100 characters.');
  
  if (!contact_name || contact_name.trim().length < 2) errors.push('Contact name is required.');
  if (contact_name && contact_name.length > 100) errors.push('Contact name cannot exceed 100 characters.');

  if (!contact_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact_email)) errors.push('Valid email is required.');
  if (contact_email && contact_email.length > 254) errors.push('Email cannot exceed 254 characters.');

  if (!contact_phone || contact_phone.trim().length < 10) errors.push('Valid phone number is required.');
  if (contact_phone && contact_phone.length > 20) errors.push('Phone number cannot exceed 20 characters.');

  if (description && description.length > 1000) errors.push('Message cannot exceed 1000 characters.');

  if (!city_id) errors.push('City is required.');
  if (!category_id) errors.push('Category is required.');

  if (errors.length) {
    req.flash('error', errors.join(' '));
    return res.redirect('back');
  }

  req.body.business_name = sanitizeString(req.body.business_name);
  req.body.contact_name = sanitizeString(req.body.contact_name);
  req.body.contact_email = sanitizeString(req.body.contact_email);
  req.body.contact_phone = sanitizeString(req.body.contact_phone);
  req.body.description = sanitizeString(req.body.description || '');
  req.body.website = sanitizeString(req.body.website || '');

  next();
}

function validateClaim(req, res, next) {
  const { contact_name, contact_email, contact_phone, verification_details } = req.body;
  const errors = [];

  if (!contact_name || contact_name.trim().length < 2) errors.push('Your name is required.');
  if (contact_name && contact_name.length > 100) errors.push('Name cannot exceed 100 characters.');

  if (!contact_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact_email)) errors.push('Valid email is required.');
  if (contact_email && contact_email.length > 254) errors.push('Email cannot exceed 254 characters.');

  if (!contact_phone || contact_phone.trim().length < 10) errors.push('Valid phone number is required.');
  if (contact_phone && contact_phone.length > 20) errors.push('Phone number cannot exceed 20 characters.');

  if (!verification_details || verification_details.trim().length < 10) errors.push('Please provide verification details.');
  if (verification_details && verification_details.length > 1000) errors.push('Verification details cannot exceed 1000 characters.');

  if (errors.length) {
    req.flash('error', errors.join(' '));
    return res.redirect('back');
  }

  req.body.contact_name = sanitizeString(req.body.contact_name);
  req.body.contact_email = sanitizeString(req.body.contact_email);
  req.body.contact_phone = sanitizeString(req.body.contact_phone);
  req.body.verification_details = sanitizeString(req.body.verification_details);

  next();
}

function validateSearch(req, res, next) {
  if (req.query.q) {
    req.query.q = sanitizeString(req.query.q).slice(0, 200);
  }
  next();
}

module.exports = {
  sanitizeString,
  generateSlug,
  validateBusiness,
  validateInquiry,
  validateClaim,
  validateSearch,
};
