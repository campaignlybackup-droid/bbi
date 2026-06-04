# BBI — Bharat Business Index

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Set up the database
```bash
node scripts/migrate.js
node scripts/seed.js
```

### 3. Start the server
```bash
npm start
```

Visit: http://localhost:3000

---

## Admin Panel

URL: http://localhost:3000/admin
Email: admin@bbi.in
Password: admin@bbi123

**Change the password after first login.**

---

## Deploying to a VPS (Ubuntu)

### Install Node.js
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### Upload files & install
```bash
# Upload the folder via SFTP or git clone
cd /var/www/bbi
npm install
node scripts/migrate.js
node scripts/seed.js
```

### Run with PM2 (keeps it alive)
```bash
npm install -g pm2
pm2 start server.js --name bbi
pm2 save
pm2 startup
```

### Nginx config (reverse proxy)
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### SSL (free with Let's Encrypt)
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

## Deploying to Render.com (free tier)

1. Push code to GitHub
2. Go to render.com → New Web Service
3. Connect your repo
4. Build command: `npm install && node scripts/migrate.js && node scripts/seed.js`
5. Start command: `npm start`
6. Done — live URL provided instantly

---

## Environment Variables (production)

Create a `.env` file:
```
PORT=3000
SESSION_SECRET=your-long-random-secret-here
```

---

## Project Structure

```
bbi/
├── server.js           # Entry point
├── config/
│   ├── db.js           # SQLite connection
│   └── bbi.db          # Database (created after migrate)
├── routes/
│   ├── public.js       # Homepage, rankings, business pages
│   └── admin.js        # Admin panel routes
├── models/
│   └── ranking.js      # Ranking engine
├── middleware/
│   └── auth.js         # Admin auth
├── views/
│   ├── index.ejs       # Homepage
│   ├── rankings.ejs    # Rankings list page
│   ├── business.ejs    # Business profile
│   ├── methodology.ejs # Methodology page
│   └── admin/          # All admin views
├── public/
│   └── css/style.css   # All styles
└── scripts/
    ├── migrate.js      # Create DB tables
    └── seed.js         # Sample data
```
