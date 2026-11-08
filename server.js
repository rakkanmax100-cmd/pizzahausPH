// Back end: Express API + JSON-file storage
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load settings from a local .env file (never uploaded; hosts use their own settings page)
try {
  fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/).forEach(l => {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  });
} catch {}
const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const FILE = path.join(__dirname, 'orders.json');
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const CRUSTS = { 'Pan': 0, 'Thin & Crispy': 0, 'Cheese Stuffed': 79 };
const DELIVERY_FEE = 49;
const VOUCHERS = {
  FREEDEL: { desc: 'Free delivery', min: 300, freeDelivery: true },
  PIZZA10: { desc: '10% off your order', min: 400, percent: 10 }
};
const IMG = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=600&h=420&q=80`;
const pz = (id, name, desc, p, m, l, image) => ({ id, name, category: 'Pizza', emoji: '🍕', image, desc, prices: { Personal: p, Medium: m, Large: l } });
const MENU = [
  pz(1, "Pepperoni Lover's", 'Double pepperoni, mozzarella, signature tomato sauce.', 199, 399, 599, IMG('1542282811-943ef1a977c3')),
  pz(2, 'Hawaiian Supreme', 'Ham, pineapple and extra cheese.', 189, 379, 569, IMG('1604068549290-dea0e4a305ca')),
  pz(3, "Meat Lover's", 'Pepperoni, ham, sausage, bacon and ground beef.', 229, 449, 669, IMG('1565299624946-b28f40a0ae38')),
  pz(4, 'Cheese Overload', 'Four-cheese blend on a rich creamy base.', 199, 399, 599, IMG('1513104890138-7c749659a591')),
  pz(5, 'Supreme', 'Pepperoni, sausage, peppers, onions, mushrooms, olives.', 219, 429, 649, IMG('1574071318508-1cdbab80d002')),
  pz(6, 'Veggie Delight', 'Bell peppers, mushrooms, onions, olives, tomatoes.', 179, 369, 549, IMG('1595854341625-f33ee10dbf94')),
  { id: 7, name: 'Baked Spaghetti', category: 'Pasta', emoji: '🍝', image: IMG('1621996346565-e3dbc646d9a9'), desc: 'Meaty tomato sauce, melted cheese.', price: 149 },
  { id: 8, name: 'Creamy Carbonara', category: 'Pasta', emoji: '🍝', image: IMG('1633337474564-1d9478ca4e2e'), desc: 'Bacon, mushrooms, white cream sauce.', price: 159 },
  { id: 9, name: 'Lasagna', category: 'Pasta', emoji: '🍝', image: 'https://www.thespruceeats.com/thmb/Lm5HsN9T6Z9DHJ0Qca4w_n-VDAg=/2811x1874/filters:no_upscale():max_bytes(150000):strip_icc()/Step_1_Basic_Lasagna_with_Meaty_Sauce-5a99f20ec67335003717d34b.jpg', desc: 'Layered pasta, beef ragu, béchamel.', price: 179 },
  { id: 10, name: 'Garlic Bread', category: 'Sides', emoji: '🥖', image: 'https://thefoodcharlatan.com/wp-content/uploads/2023/05/Garlic-Bread-Recipe-15.jpg', desc: 'Toasted, buttery, with cheese dip.', price: 99 },
  { id: 11, name: 'Chicken Wings (6)', category: 'Sides', emoji: '🍗', image: 'https://drdavinahseats.com/wp-content/uploads/2020/06/Crispy-Baked-Chicken-Wings-Close-up-1025x1536.jpg', desc: 'Buffalo or honey garlic glaze.', price: 189 },
  { id: 12, name: 'Cheesy Fries', category: 'Sides', emoji: '🍟', image: 'https://www.acouplecooks.com/wp-content/uploads/2022/06/Cheese-Fries-005.jpg', desc: 'Crinkle fries with cheese sauce.', price: 119 },
  { id: 13, name: 'Choco Lava Cake', category: 'Desserts', emoji: '🍫', image: 'https://insanelygoodrecipes.com/wp-content/uploads/2024/12/Lava-Cake-2.jpg', desc: 'Warm cake with molten chocolate center.', price: 89 },
  { id: 14, name: 'Iced Tea', category: 'Drinks', emoji: '🥤', image: 'https://insanelygoodrecipes.com/wp-content/uploads/2022/09/Classic-Lemon-Iced-Tea-in-Glass.jpg', desc: 'House-brewed, lightly sweet.', price: 59 },
  { id: 15, name: 'Cola', category: 'Drinks', emoji: '🥤', image: 'https://images.pexels.com/photos/24860314/pexels-photo-24860314/free-photo-of-close-up-of-a-coca-cola-can.jpeg?auto=compress&cs=tinysrgb&w=1200', desc: 'Ice-cold, 500 ml.', price: 59 }
];
const STATUSES = ['Received', 'Preparing', 'Ready', 'Completed'];
// ---------- Storage: Postgres when DATABASE_URL is set, otherwise local JSON files ----------
const FILES = { orders: FILE, users: path.join(__dirname, 'users.json'), menu: path.join(__dirname, 'menu.json') };
const pool = process.env.DATABASE_URL
  ? new (require('pg').Pool)({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }) : null;
const cache = {};
let queue = Promise.resolve();
async function loadStore() {
  if (!pool) return;
  await pool.query('CREATE TABLE IF NOT EXISTS store (k text PRIMARY KEY, v jsonb NOT NULL)');
  (await pool.query('SELECT k, v FROM store')).rows.forEach(r => { cache[r.k] = r.v; });
}
const load = (k) => cache[k] ?? (cache[k] = pool ? [] : (() => { try { return JSON.parse(fs.readFileSync(FILES[k], 'utf8')); } catch { return []; } })());
const save = (k, v) => {
  cache[k] = v;
  if (!pool) return fs.writeFileSync(FILES[k], JSON.stringify(v, null, 2));
  queue = queue.then(() => pool.query('INSERT INTO store (k, v) VALUES ($1, $2) ON CONFLICT (k) DO UPDATE SET v = $2', [k, JSON.stringify(v)])).catch(console.error);
};
const read = () => [...load('orders')], write = (o) => save('orders', o);
const getMenu = () => load('menu');
const clean = (v, n) => String(v || '').trim().slice(0, n);


// ---------- Accounts & sessions (customers and staff) ----------
const STAFF_CODE = process.env.STAFF_CODE; // set in .env (local) or the host's settings; staff need it to register
const readUsers = () => [...load('users')], writeUsers = (u) => save('users', u);
const hashPw = (pw, salt = crypto.randomBytes(16).toString('hex')) => ({ salt, hash: crypto.scryptSync(pw, salt, 64).toString('hex') });
const sessions = new Map();
const getCookie = (req, n) => (req.headers.cookie || '').split(';').map(c => c.trim().split('=')).find(([k]) => k === n)?.[1];
app.use((req, res, next) => {
  const id = sessions.get(getCookie(req, 'sid'));
  req.user = id ? readUsers().find(u => u.id === id) || null : null;
  next();
});
const pub = (u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role });
const needLogin = (req, res, next) => req.user ? next() : res.status(401).json({ error: 'Please log in first.' });
const needStaff = (req, res, next) => req.user?.role === 'staff' ? next() : res.status(403).json({ error: 'Staff only.' });
function startSession(res, user) {
  const t = crypto.randomBytes(24).toString('hex');
  sessions.set(t, user.id);
  res.setHeader('Set-Cookie', `sid=${t}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
}
app.post('/api/register', (req, res) => {
  const b = req.body || {}, name = clean(b.name, 40), email = clean(b.email, 80).toLowerCase(), phone = clean(b.phone, 20);
  const role = b.role === 'staff' ? 'staff' : 'customer';
  if (name.length < 2) return res.status(400).json({ error: 'Enter your full name.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email.' });
  if (String(b.password || '').length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (role === 'staff' && (!STAFF_CODE || b.staffCode !== STAFF_CODE)) return res.status(403).json({ error: 'Wrong staff access code.' });
  const users = readUsers();
  if (users.some(u => u.email === email)) return res.status(409).json({ error: 'That email is already registered. Try logging in.' });
  const user = { id: (users.at(-1)?.id || 0) + 1, name, email, phone, role, ...hashPw(String(b.password)) };
  users.push(user); writeUsers(users);
  startSession(res, user); res.status(201).json(pub(user));
});
const attempts = new Map();
app.use('/api/login', (req, res, next) => {
  const now = Date.now(), list = (attempts.get(req.ip) || []).filter(t => now - t < 15 * 60 * 1000);
  if (list.length >= 20) return res.status(429).json({ error: 'Too many login attempts. Try again in 15 minutes.' });
  list.push(now); attempts.set(req.ip, list); next();
});
app.post('/api/login', (req, res) => {
  const b = req.body || {}, u = readUsers().find(x => x.email === clean(b.email, 80).toLowerCase());
  const ok = u && crypto.timingSafeEqual(Buffer.from(hashPw(String(b.password || ''), u.salt).hash, 'hex'), Buffer.from(u.hash, 'hex'));
  if (!ok) return res.status(401).json({ error: 'Wrong email or password.' });
  startSession(res, u); res.json(pub(u));
});
app.post('/api/logout', (req, res) => {
  sessions.delete(getCookie(req, 'sid'));
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0'); res.json({ ok: true });
});
app.get('/api/me', (req, res) => res.json(req.user ? pub(req.user) : null));

app.get('/api/menu', (req, res) => res.json({ items: getMenu(), crusts: CRUSTS, deliveryFee: DELIVERY_FEE, vouchers: VOUCHERS }));

app.post('/api/orders', needLogin, (req, res) => {
  const b = req.body || {};
  const type = b.type === 'Pickup' ? 'Pickup' : 'Delivery';
  const customer = clean(b.customer, 40), phone = clean(b.phone, 20), address = clean(b.address, 150);
  if (!customer) return res.status(400).json({ error: 'Enter your name.' });
  if (!/^[0-9+\s-]{7,20}$/.test(phone)) return res.status(400).json({ error: 'Enter a valid phone number.' });
  if (type === 'Delivery' && address.length < 5) return res.status(400).json({ error: 'Enter your delivery address.' });
  if (!Array.isArray(b.items) || !b.items.length) return res.status(400).json({ error: 'Your cart is empty.' });

  const items = [];
  for (const it of b.items) {
    const m = getMenu().find(x => x.id === it.id), qty = Number(it.qty);
    if (!m || !Number.isInteger(qty) || qty < 1 || qty > 20) return res.status(400).json({ error: 'Invalid item in cart.' });
    if (m.soldOut) return res.status(400).json({ error: `${m.name} is sold out. Please remove it from your cart.` });
    let price = m.price, label = m.name;
    if (m.prices) {
      if (!(it.size in m.prices) || !(it.crust in CRUSTS)) return res.status(400).json({ error: 'Invalid size or crust.' });
      price = m.prices[it.size] + CRUSTS[it.crust];
      label = `${m.name} (${it.size}, ${it.crust})`;
    }
    items.push({ name: label, price, qty });
  }
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const code = clean(b.voucher, 20).toUpperCase();
  const v = code ? VOUCHERS[code] : null;
  if (code && !v) return res.status(400).json({ error: 'Invalid voucher code.' });
  if (v && subtotal < v.min) return res.status(400).json({ error: `Voucher ${code} needs a minimum order of ₱${v.min}.` });
  const discount = v?.percent ? Math.round(subtotal * v.percent / 100) : 0;
  const deliveryFee = type === 'Delivery' && !v?.freeDelivery ? DELIVERY_FEE : 0;
  const lat = parseFloat(b.lat), lng = parseFloat(b.lng);
  const orders = read();
  const order = {
    userId: req.user.id, lat: isFinite(lat) ? lat : null, lng: isFinite(lng) ? lng : null,
    id: (orders.at(-1)?.id || 1000) + 1, customer, phone, type, address: type === 'Delivery' ? address : '',
    payment: ['Cash', 'GCash', 'Card'].includes(b.payment) ? b.payment : 'Cash', notes: clean(b.notes, 200),
    items, subtotal, discount, voucher: v ? code : '', deliveryFee, total: subtotal - discount + deliveryFee, status: 'Received', createdAt: new Date().toISOString()
  };
  orders.push(order); write(orders);
  res.status(201).json(order);
});

// ---------- Menu management (staff only) ----------
const num = (v) => { v = Number(v); return Number.isFinite(v) && v > 0 && v < 100000 ? Math.round(v) : null; };
function applyDish(d, b) {
  if (b.name !== undefined) d.name = clean(b.name, 60);
  if (b.desc !== undefined) d.desc = clean(b.desc, 160);
  if (b.category !== undefined) d.category = clean(b.category, 20) || 'Other';
  if (b.image !== undefined) d.image = clean(b.image, 500);
  if (b.soldOut !== undefined) d.soldOut = !!b.soldOut;
  if (b.prices) {
    const p = {};
    for (const k of ['Personal', 'Medium', 'Large']) { p[k] = num(b.prices[k]); if (!p[k]) return 'Enter a price for every size.'; }
    d.prices = p; delete d.price;
  } else if (b.price !== undefined) {
    const p = num(b.price); if (!p) return 'Enter a valid price.'; d.price = p; delete d.prices;
  }
  if (!d.name) return 'Enter a dish name.';
  return (d.price || d.prices) ? null : 'Enter a price.';
}
app.post('/api/menu', needStaff, (req, res) => {
  const menu = getMenu(), d = { id: Math.max(0, ...menu.map(x => x.id)) + 1, emoji: '' };
  const err = applyDish(d, req.body || {});
  if (err) return res.status(400).json({ error: err });
  save('menu', [...menu, d]); res.status(201).json(d);
});
app.patch('/api/menu/:id', needStaff, (req, res) => {
  const menu = getMenu(), d = menu.find(x => x.id === Number(req.params.id));
  if (!d) return res.status(404).json({ error: 'Dish not found.' });
  const copy = { ...d }, err = applyDish(copy, req.body || {});
  if (err) return res.status(400).json({ error: err });
  save('menu', menu.map(x => x.id === d.id ? copy : x)); res.json(copy);
});
app.delete('/api/menu/:id', needStaff, (req, res) => {
  save('menu', getMenu().filter(x => x.id !== Number(req.params.id))); res.json({ ok: true });
});
app.get('/api/orders', needStaff, (req, res) => res.json(read().reverse()));
app.get('/api/my-orders', needLogin, (req, res) => res.json(read().filter(o => o.userId === req.user.id).reverse().slice(0, 50)));
app.get('/api/orders/:id', needLogin, (req, res) => {
  const o = read().find(x => x.id === Number(req.params.id) && (req.user.role === 'staff' || x.userId === req.user.id));
  o ? res.json(o) : res.status(404).json({ error: 'Order not found. Check the number and try again.' });
});
app.patch('/api/orders/:id', needStaff, (req, res) => {
  const orders = read(), o = orders.find(x => x.id === Number(req.params.id));
  if (!o) return res.status(404).json({ error: 'Order not found.' });
  if (!STATUSES.includes(req.body.status)) return res.status(400).json({ error: 'Invalid status.' });
  o.status = req.body.status; write(orders); res.json(o);
});
loadStore()
  .then(() => { if (!load('menu').length) save('menu', MENU); })
  .then(() => app.listen(PORT, () => console.log(`Pizza Haus running on port ${PORT}`)))
  .catch(e => { console.error('Could not start:', e.message); process.exit(1); });
