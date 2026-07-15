/**
 * BBI — Bharat Business Index
 * Main server entry point.
 * M-01: No hardcoded session secret — requires SESSION_SECRET env var.
 * M-10: Monthly ranking recalculation via node-cron.
 */

require('dotenv').config();

const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const path = require('path');
const { recalculateAllRankings } = require('./services/rankingService');
const settingsService = require('./services/settingsService');

const app = express();
app.set('trust proxy', 1); // Trust first proxy for secure cookies

const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// ============================================
// M-01: Session secret security
// ============================================
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET || SESSION_SECRET.length < 16) {
  if (IS_PROD) {
    console.error('❌ FATAL: SESSION_SECRET environment variable is required in production.');
    console.error('   Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(1);
  } else {
    console.warn('⚠️  WARNING: Using development session secret. Set SESSION_SECRET in .env for production.');
  }
}

// ============================================
// View engine
// ============================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ============================================
// Security & Performance middleware
// ============================================

// M-99: Smart cache headers — public pages get short cache, admin stays no-cache
app.use((req, res, next) => {
  // Static assets and SEO files have their own cache headers (set by express.static or route handlers)
  const skipPaths = ['/css/', '/js/', '/images/', '/favicon', '/sitemap.xml', '/robots.txt', '/llms.txt', '/llms-rankings.txt', '/api/badge/', '/api/certificate/', '/api/og/'];
  const shouldSkip = skipPaths.some(p => req.path.startsWith(p));
  
  if (shouldSkip) {
    // Let express.static or route handler set cache headers
    return next();
  }
  
  if (req.path.startsWith('/admin')) {
    // Admin pages: never cache (dynamic content, forms, session-dependent)
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  } else {
    // Public pages: short cache with stale-while-revalidate for smooth UX
    // 5 min browser cache, 10 min CDN/proxy cache, serve stale up to 24h while revalidating
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400');
  }
  
  next();
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://www.googletagmanager.com", "https://pagead2.googlesyndication.com", "https://www.google-analytics.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://www.google-analytics.com", "https://www.googletagmanager.com", "https://pagead2.googlesyndication.com"],
    },
  },
}));
app.use(compression());

// Rate limiting on auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: 'Too many login attempts. Please try again later.',
});

// Rate limiting on public forms and API
const formLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: 'Too many submissions from this IP. Please try again later.',
});

const searchLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100,
  message: 'Too many search requests. Please slow down.',
});

// ============================================
// Standard middleware
// ============================================
if (!IS_PROD) app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(methodOverride('_method'));

// Static files with aggressive cache headers
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: IS_PROD ? '1y' : 0,
  etag: true,
  lastModified: true,
  immutable: IS_PROD, // Tell browsers these files never change (cache-busted via filename changes)
}));

// ============================================
// Session
// ============================================
app.use(session({
  secret: SESSION_SECRET || 'dev-only-bbi-secret-not-for-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
  },
}));
app.use(flash());

// ============================================
// Global template variables
// ============================================
app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  res.locals.BASE_URL = process.env.BASE_URL || 'https://bharatbusinessindex.com';
  
  // Inject global site settings
  try {
    res.locals.globalSettings = settingsService.getAllSettings();
  } catch (e) {
    res.locals.globalSettings = {};
  }

  // Inject latest news for the footer
  try {
    res.locals.latestNews = db.prepare('SELECT title, slug, created_at FROM news WHERE active = 1 ORDER BY created_at DESC LIMIT 4').all();
  } catch (e) {
    res.locals.latestNews = [];
  }
  
  next();
});

// ============================================
// Routes
// ============================================
app.use('/', require('./routes/seo'));        // sitemap.xml, robots.txt, badges
app.use('/', searchLimiter, require('./routes/search'));     // /search, /api/search/*
app.use('/get-listed', formLimiter);
app.use('/business/*/claim', formLimiter);
app.use('/blog', require('./routes/blog'));
app.use('/digest', require('./routes/digest'));
app.use('/', require('./routes/public'));     // homepage, rankings, business, city, category, methodology, get-listed, claim
app.use('/admin/login', authLimiter);        // Rate limit login attempts — must be before admin router
app.use('/admin/discovery', require('./routes/adminDiscovery'));
app.use('/admin', require('./routes/admin'));

// ============================================
// 404 handler
// ============================================
app.use((req, res) => res.status(404).render('404', { title: 'Page Not Found' }));

// ============================================
// Error handler
// ============================================
app.use((err, req, res, next) => {
  // Always log the full error internally
  console.error('ERROR [Internal]:', err.stack || err.message || err);
  
  // Never leak the stack trace to the user, regardless of environment
  if (req.accepts('html')) {
    res.status(500).render('404', { title: 'Server Error' });
  } else {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============================================
// M-10: Monthly ranking cron job
// ============================================
cron.schedule('0 2 1 * *', async () => {
  // Runs at 2:00 AM on the 1st of every month
  console.log('🔄 Running monthly tasks...');
  try {
    // 1. Recalculate Rankings
    const result = recalculateAllRankings();
    console.log(`✅ Monthly recalculation complete: ${result.combos} combos, ${result.businesses} businesses ranked.`);
    
    // 2. Generate movements and achievements
    const achievementService = require('./services/achievementService');
    const movementsResult = achievementService.generateMonthlyMovements();
    console.log(`✅ Movements generated: ${movementsResult} processed.`);
    const achievementsResult = achievementService.generateMonthlyAchievements();
    console.log(`✅ Achievements generated: ${achievementsResult} processed.`);
    
    // 3. Auto-generate the monthly digest
    const digestService = require('./services/digestService');
    const digestResult = digestService.autoGenerateMonthlyDigest();
    if (digestResult) console.log(`✅ Monthly digest generated for ${digestResult.month_year}.`);
    
    // 4. Trigger ranking update emails
    const emailService = require('./services/emailService');
    const emailResult = await emailService.triggerRankingEmails();
    console.log(`✅ Ranking emails queued/sent.`);

  } catch (e) {
    console.error('❌ Monthly tasks failed:', e.message);
  }
}, {
  timezone: 'Asia/Kolkata',
});

// Initialize Programmatic SEO Scheduler
require('./services/seoScheduler').init();

// ============================================
// Start server
// ============================================
app.listen(PORT, () => {
  console.log(`🚀 BBI Server running on port ${PORT}`);
  console.log(`   Environment: ${IS_PROD ? 'production' : 'development'}`);
  console.log(`   Monthly cron: Active (1st of every month, 2:00 AM IST)`);
  
  // Start AI Job Queue Worker
  const jobQueue = require('./services/ai/jobQueue');
  const aiProvider = require('./services/ai/openaiProvider'); // Or use stubProvider depending on config
  console.log(`   AI Worker: Active (Processing queue every 5 seconds)`);
  setInterval(() => {
    jobQueue.processNext(aiProvider).catch(e => console.error('[AI Worker] Error:', e.message));
  }, 5000);
});
