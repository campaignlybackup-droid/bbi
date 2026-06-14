# BBI — Bharat Business Index

India's trusted, independent business ranking platform.

## Quick Start

```bash
# 1. Create .env from template
cp .env.example .env
# Edit .env and set SESSION_SECRET (generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# 2. Install dependencies
npm install

# 3. Run migrations + seed
npm run migrate
npm run seed

# 4. Start development server
npm run dev
```

Open http://localhost:3000

**Admin Panel:** http://localhost:3000/admin  
**Login:** `admin@bharatbusinessindex.com` / `admin@bbi123`

## Architecture

```
bbi/
├── config/
│   ├── db.js          # SQLite with WAL, foreign keys
│   └── constants.js   # All score weights, thresholds, status enums
├── middleware/
│   ├── auth.js        # Session auth + role-based access
│   ├── validation.js  # Input sanitization + validation
│   └── analytics.js   # Page view tracking
├── services/
│   ├── rankingService.js    # Core ranking engine
│   ├── searchService.js     # FTS5 full-text search
│   ├── inquiryService.js    # Get Listed workflow
│   ├── claimService.js      # Business claim workflow
│   ├── seoService.js        # Sitemap, structured data
│   ├── analyticsService.js  # Analytics queries
│   ├── badgeService.js      # SVG badge/certificate generation
│   ├── sponsoredService.js  # Sponsored listings (never affects rank)
│   └── ai/
│       ├── index.js         # Provider factory
│       ├── stubProvider.js  # Template-based (no API key needed)
│       └── jobQueue.js      # SQLite-backed async queue
├── routes/
│   ├── public.js      # Homepage, rankings, business, city, category, get-listed, claim
│   ├── search.js      # Search + suggestions API
│   ├── admin.js       # Full admin panel
│   └── seo.js         # sitemap.xml, robots.txt, badges
├── views/             # EJS templates (mobile-first)
├── public/css/        # Design system (CSS custom properties)
├── scripts/
│   ├── migrate.js     # Schema + indexes + FTS5
│   └── seed.js        # Idempotent sample data
└── server.js          # Entry point: helmet, compression, cron, routes
```

## Key Features

- **Independent Rankings** — Score-based ranking with 6 weighted factors
- **Monthly Auto-Recalculation** — Cron job on the 1st of every month
- **Full-Text Search** — FTS5 with LIKE fallback + trending
- **Mobile-First UI** — Bottom nav, 44px touch targets, responsive cards
- **SEO-First** — Dynamic sitemap, structured data (LocalBusiness, ItemList, FAQ, Breadcrumb)
- **Get Listed Flow** — Public inquiry → Admin approval → Business created
- **Claim Business** — Ownership verification workflow
- **AI-Ready** — Stub provider works out of the box; swap for OpenAI/Gemini
- **Badge & Certificate** — SVG-based, no canvas dependency

## Scoring System

| Factor | Max | Weight |
|--------|-----|--------|
| Customer Reviews | 35 | 35% |
| Review Volume | 25 | 25% |
| Website & Online | 15 | 15% |
| Verification | 10 | 10% |
| Profile Completeness | 10 | 10% |
| Editorial Assessment | 15 | 15% |

Auto score max: 85 · Editorial: up to 15 · Manual boost: up to 10 · Total: 100

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SESSION_SECRET` | **Yes** (production) | dev fallback | Cookie signing secret |
| `PORT` | No | 3000 | Server port |
| `NODE_ENV` | No | development | production / development |
| `BASE_URL` | No | https://bharatbusinessindex.com | Canonical URL for sitemap/SEO |
| `AI_PROVIDER` | No | stub | stub / openai / gemini |
| `AI_API_KEY` | No | — | API key for AI provider |
| `DB_PATH` | No | bbi.db | SQLite database path |

## Deployment (Hostinger)

1. Upload all files
2. Create `.env` with production `SESSION_SECRET`
3. Set `NODE_ENV=production`
4. Run `npm install --production`
5. Run `node scripts/migrate.js && node scripts/seed.js`
6. Start with `node server.js`

## License

Proprietary — Bharat Business Index
