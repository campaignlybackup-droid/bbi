const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const morgan = require('morgan');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'bbi-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(flash());

app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  next();
});

app.use('/', require('./routes/public'));
app.use('/admin', require('./routes/admin'));

app.use((req, res) => res.status(404).render('404', { title: 'Page Not Found' }));

app.listen(PORT, () => {
  console.log(`🚀 BBI Server running on port ${PORT}`);
});
