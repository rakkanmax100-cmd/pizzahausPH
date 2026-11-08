// Front end: menu, customization dialog, cart, checkout, tracking, kitchen
const $ = (s) => document.querySelector(s);
const peso = (n) => '₱' + n.toLocaleString('en-PH');
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const STEPS = ['Received', 'Preparing', 'Ready', 'Completed'];
let menu = [], crusts = {}, fee = 0, vouchers = {}, voucher = '', cat = 'All', cart = [], poll;

const unit = (it, size, crust) => it.prices ? it.prices[size] + crusts[crust] : it.price;
const orderType = () => document.querySelector('[name=type]:checked').value;
const setMsg = (t, c) => { $('#msg').textContent = t; $('#msg').className = 'msg ' + (c || ''); };

async function loadMenu() {
  const d = await (await fetch('/api/menu')).json();
  menu = d.items; crusts = d.crusts; fee = d.deliveryFee; vouchers = d.vouchers;
  cart = cart.filter(l => menu.some(m => m.id === l.id));
  renderCats(); renderMenu(); renderCart();
}
async function init() { await loadMenu(); await loadMe(); renderCart(); }
function renderCats() {
  $('#categories').innerHTML = ['All', ...new Set(menu.map(m => m.category))]
    .map(c => `<button class="chip ${c === cat ? 'active' : ''}" data-cat="${c}">${c}</button>`).join('');
}
let q = '', sort = '';
const low = (m) => m.prices ? m.prices.Personal : m.price;
function renderMenu() {
  const t = q.trim().toLowerCase();
  const list = menu.filter(m => (cat === 'All' || m.category === cat) && (!t || (m.name + ' ' + (m.desc || '')).toLowerCase().includes(t)));
  if (sort === 'low') list.sort((x, y) => low(x) - low(y));
  if (sort === 'high') list.sort((x, y) => low(y) - low(x));
  if (sort === 'az') list.sort((x, y) => x.name.localeCompare(y.name));
  $('#menu').innerHTML = list.length ? list.map(m => `
    <article class="dish ${m.soldOut ? 'out' : ''}"><div class="pic">${m.image ? `<img src="${esc(m.image)}" alt="${esc(m.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</div>
      <div class="body"><h3>${esc(m.name)}</h3><p>${esc(m.desc || '')}</p>
        <div class="row"><span>${m.prices ? 'From ' + peso(m.prices.Personal) : peso(m.price)}</span>
        ${m.soldOut ? '<span class="soldtag">Sold out</span>' : `<button class="add" data-item="${m.id}">${m.prices ? 'Customize' : 'Add'}</button>`}</div></div></article>`).join('')
    : '<p class="empty">No dishes match your search.</p>';
}
function renderCart() {
  $('#count').textContent = cart.reduce((s, l) => s + l.qty, 0);
  $('#cartItems').innerHTML = cart.length ? cart.map((l, i) => {
    const it = menu.find(m => m.id === l.id);
    return `<div class="line"><div class="n">${esc(it.name)}${l.size ? `<small>${l.size}, ${l.crust}</small>` : ''}</div>
      <div class="qty"><button data-dec="${i}" aria-label="Remove one">−</button>${l.qty}<button data-inc="${i}" aria-label="Add one">+</button></div>
      <div>${peso(unit(it, l.size, l.crust) * l.qty)}</div></div>`;
  }).join('') : '<p class="empty">Your cart is empty. Pick something from the menu.</p>';
  const sub = cart.reduce((s, l) => s + unit(menu.find(m => m.id === l.id), l.size, l.crust) * l.qty, 0);
  const v = vouchers[voucher], ok = !!v && sub >= v.min, isDel = orderType() === 'Delivery';
  const disc = ok && v.percent ? Math.round(sub * v.percent / 100) : 0;
  const f = sub > 0 && isDel && !(ok && v.freeDelivery) ? fee : 0;
  $('#subtotal').textContent = peso(sub);
  $('#disc').textContent = '−' + peso(disc); $('#discRow').classList.toggle('hidden', !disc);
  $('#fee').textContent = f || sub === 0 ? peso(f) : 'FREE';
  $('#total').textContent = peso(sub - disc + f);
  $('#mbCount').textContent = cart.reduce((s, l) => s + l.qty, 0); $('#mbTotal').textContent = peso(sub - disc + f); $('#mobileBar').classList.toggle('has', cart.length > 0);
  $('#feeRow').classList.toggle('hidden', !isDel); $('#addrRow').classList.toggle('hidden', !isDel);
  $('#vmsg').textContent = !v ? '' : ok ? `✓ ${voucher} applied: ${v.desc}` : `${voucher}: add ${peso(v.min - sub)} more to use this voucher.`;
  $('#vmsg').className = 'msg ' + (ok ? 'ok' : '');
}
function addToCart(id, size, crust, qty = 1) {
  const l = cart.find(x => x.id === id && x.size === size && x.crust === crust);
  l ? l.qty = Math.min(l.qty + qty, 20) : cart.push({ id, size, crust, qty });
  renderCart();
}
function openDialog(it) {
  const sizes = Object.keys(it.prices), cr = Object.keys(crusts);
  $('#dlgBody').innerHTML = `<div class="dlg"><h3>${esc(it.name)}</h3><p>${esc(it.desc)}</p>
    <strong>Size</strong><div class="opt">${sizes.map((s, i) => `<label><input type="radio" name="size" value="${s}" ${i === 1 ? 'checked' : ''}>${s}<br>${peso(it.prices[s])}</label>`).join('')}</div>
    <strong>Crust</strong><div class="opt">${cr.map((c, i) => `<label><input type="radio" name="crust" value="${c}" ${i === 0 ? 'checked' : ''}>${c}${crusts[c] ? '<br>+' + peso(crusts[c]) : ''}</label>`).join('')}</div>
    <div class="dlgfoot"><button class="ghost" value="cancel">Cancel</button><button class="add" id="dlgAdd" value="ok"></button></div></div>`;
  const upd = () => { const s = $('[name=size]:checked').value, c = $('[name=crust]:checked').value;
    $('#dlgAdd').textContent = 'Add to cart · ' + peso(unit(it, s, c)); $('#dlgAdd').onclick = () => addToCart(it.id, s, c); };
  $('#dlgBody').onchange = upd; upd(); $('#dlg').showModal();
}

document.addEventListener('click', (e) => {
  const d = e.target.dataset;
  if (d.cat) { cat = d.cat; renderCats(); renderMenu(); }
  if (d.item) { const it = menu.find(m => m.id == d.item); it.prices ? openDialog(it) : addToCart(it.id, null, null); }
  if (d.inc) { cart[d.inc].qty = Math.min(cart[d.inc].qty + 1, 20); renderCart(); }
  if (d.dec) { if (--cart[d.dec].qty <= 0) cart.splice(d.dec, 1); renderCart(); }
  if (e.target.classList.contains('tab')) show(d.view);
  if (e.target.id === 'cartToggle') { show('menuView'); setTimeout(() => $('#cart').scrollIntoView({ behavior: 'smooth' }), 260); }
});
document.addEventListener('change', async (e) => {
  if (e.target.name === 'type') renderCart();
  if (e.target.dataset.status) {
    await fetch('/api/orders/' + e.target.dataset.status, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: e.target.value }) });
    loadOrders();
  }
});

$('#placeOrder').onclick = async () => {
  if (!me) return openAuth('login', 'Please log in or sign up to place your order.');
  const btn = $('#placeOrder'); btn.disabled = true;
  try {
    const res = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      type: orderType(), customer: $('#customer').value, phone: $('#phone').value, address: $('#address').value, lat: pin?.lat, lng: pin?.lng,
      payment: $('#payment').value, notes: $('#notes').value, voucher, items: cart }) });
    const data = await res.json();
    if (res.status === 401) { me = null; renderAuth(); return openAuth('login', 'Your session ended. Please log in again.'); }
    if (!res.ok) return setMsg(data.error, 'err');
    cart = []; clearVoucher(); setMsg('');
    $('#trackId').value = data.id; show('trackView'); track();
  } catch { setMsg('Cannot reach the server. Make sure it is running.', 'err'); }
  finally { btn.disabled = false; }
};

async function track() {
  const id = $('#trackId').value.trim(); if (!id) return;
  const res = await fetch('/api/orders/' + encodeURIComponent(id)), o = await res.json();
  if (!res.ok) return $('#trackResult').innerHTML = `<p class="msg err">${esc(o.error)}</p>`;
  const at = STEPS.indexOf(o.status); orderCache[o.id] = o;
  $('#trackResult').innerHTML = `<div class="steps">${STEPS.map((s, i) => `<div class="step ${i < at || o.status === 'Completed' ? 'done' : i === at ? 'now' : ''}">${s}</div>`).join('')}</div>
    <div class="box"><h3>Order #${o.id} · ${o.type}</h3>
    <ul>${o.items.map(i => `<li>${i.qty} × ${esc(i.name)}</li>`).join('')}</ul>
    <p>Total: <strong>${peso(o.total)}</strong> · Pay by ${o.payment}</p><button class="chip" data-receipt="${o.id}">View receipt</button>${o.address ? `<p>Deliver to: ${esc(o.address)}</p>` : ''}</div>`;
}
$('#trackBtn').onclick = track;

async function loadOrders() {
  const r = await fetch('/api/orders'); if (!r.ok) return show('homeView');
  const orders = await r.json();
  $('#orders').innerHTML = orders.length ? orders.map(o => `<article class="ticket ${o.status}">
    <h3>#${o.id} · ${esc(o.customer)}</h3>
    <small>${o.type} · ${esc(o.phone)} · ${new Date(o.createdAt).toLocaleTimeString()}</small>
    ${o.address ? `<small>${esc(o.address)}</small>` : ''}
    ${o.lat ? `<small><a href="https://www.google.com/maps?q=${o.lat},${o.lng}" target="_blank" rel="noopener">Open map pin</a></small>` : ''}
    <ul>${o.items.map(i => `<li>${i.qty} × ${esc(i.name)}</li>`).join('')}</ul>
    ${o.notes ? `<small>Note: ${esc(o.notes)}</small>` : ''}
    <p><strong>${peso(o.total)}</strong> · ${o.payment}</p>
    <select data-status="${o.id}" aria-label="Status for order ${o.id}">${STEPS.map(s => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select></article>`).join('')
    : '<p class="empty pad">No orders yet. New orders appear here automatically.</p>';
}
function showNow(v) {
  if ((v === 'kitchenView' || v === 'editorView') && me?.role !== 'staff') v = 'homeView';
  if (v === 'ordersView' && !me) v = 'homeView';
  $('#mobileBar').classList.toggle('onmenu', v === 'menuView');
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  document.querySelectorAll('.view').forEach(s => s.classList.toggle('hidden', s.id !== v));
  const el = $('#' + v); el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter'); window.scrollTo(0, 0);
  clearInterval(poll);
  if (v === 'kitchenView') { loadOrders(); poll = setInterval(loadOrders, 5000); }
  if (v === 'trackView') { loadMyOrders(); poll = setInterval(track, 5000); }
  if (v === 'ordersView') loadHistory();
  if (v === 'editorView') loadEditor();
}
// Vouchers
function applyVoucher(code) {
  if (!vouchers[code]) { voucher = ''; renderCart(); $('#vmsg').textContent = 'Invalid voucher code.'; $('#vmsg').className = 'msg err'; return false; }
  voucher = code; $('#voucherInput').value = code;
  const v = vouchers[code], b = $('#vbanner');
  b.textContent = `Voucher ${code} added: ${v.desc} on orders of ₱${v.min}+`; b.classList.remove('hidden');
  renderCart(); return true;
}
function clearVoucher() { voucher = ''; $('#voucherInput').value = ''; $('#vbanner').classList.add('hidden'); renderCart(); }
$('#applyVoucher').onclick = () => applyVoucher($('#voucherInput').value.trim().toUpperCase());
document.querySelectorAll('[data-voucher]').forEach(p => p.onclick = () => {
  const addr = $('#homeAddress').value.trim();
  if (addr.length >= 5) $('#address').value = addr;
  startOrder('Delivery', addr.length >= 5 ? addr : 'enter your address at checkout');
  applyVoucher(p.dataset.voucher);
});

// Home: delivery / pickup locator
const setMode = (m) => { document.querySelectorAll('.ltab').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
  $('#paneDelivery').classList.toggle('hidden', m !== 'Delivery'); $('#panePickup').classList.toggle('hidden', m !== 'Pickup'); };
document.querySelectorAll('.ltab').forEach(b => b.onclick = () => setMode(b.dataset.mode));
const warn = (t) => { $('#locMsg').textContent = t; $('#locMsg').classList.toggle('hidden', !t); };
function startOrder(mode, label) {
  document.querySelector(`[name=type][value=${mode}]`).checked = true;
  $('#deliverTo').textContent = mode + ' · ' + label; renderCart(); show('menuView'); window.scrollTo(0, 0);
}
$('#goDelivery').onclick = () => {
  const a = $('#homeAddress').value.trim();
  if (a.length < 5) return warn('Search and enter your full address first.');
  warn(''); $('#address').value = a; startOrder('Delivery', a);
};
$('#goPickup').onclick = () => { const b = $('#branch').value; $('#notes').value = 'Pickup at ' + b; startOrder('Pickup', b); };
$('#useLoc').onclick = () => {
  if (!navigator.geolocation) return warn('Location is not available on this browser.');
  navigator.geolocation.getCurrentPosition(
    p => { $('#homeAddress').value = `Current location (${p.coords.latitude.toFixed(4)}, ${p.coords.longitude.toFixed(4)})`; warn(''); },
    () => warn('Could not get your location. Please type your address.'));
};
$('#changeAddr').onclick = () => show('homeView');
// ---------- Accounts ----------
let me = null, pin = null, authMode = 'login';
async function loadMe() { try { me = await (await fetch('/api/me')).json(); } catch { me = null; } renderAuth(); }
function renderAuth() {
  $('#authBox').innerHTML = me
    ? `<span class="hi">Hi, ${esc(me.name.split(' ')[0])}${me.role === 'staff' ? ' <b class="badge">STAFF</b>' : ''}</span><button class="authbtn" id="logoutBtn">Logout</button>`
    : '<button class="authbtn" id="loginBtn">Login</button><button class="authbtn solid" id="signupBtn">Sign up</button>';
  $('#kitchenTab').classList.toggle('hidden', me?.role !== 'staff');
  $('#editorTab').classList.toggle('hidden', me?.role !== 'staff');
  $('#ordersTab').classList.toggle('hidden', !me);
  if (me) { if (!$('#customer').value) $('#customer').value = me.name; if (!$('#phone').value) $('#phone').value = me.phone || ''; }
}
function setAuth(m) {
  authMode = m; $('#authDlg').dataset.mode = m;
  document.querySelectorAll('.atab').forEach(b => b.classList.toggle('active', b.dataset.auth === m));
  $('#authGo').textContent = m === 'login' ? 'Login' : 'Create account';
  $('#aPass').autocomplete = m === 'login' ? 'current-password' : 'new-password';
}
function openAuth(mode = 'login', note = '') { setAuth(mode); $('#authNote').textContent = note; $('#authMsg').textContent = ''; $('#authDlg').showModal(); }
async function loadMyOrders() {
  if (!me) return $('#myOrders').innerHTML = '<p class="empty">Log in to see your orders.</p>';
  const list = await (await fetch('/api/my-orders')).json();
  $('#myOrders').innerHTML = list.length ? '<strong>Your recent orders</strong><div class="chips">' + list.map(o => `<button class="chip" data-track="${o.id}">#${o.id} · ${peso(o.total)} · ${o.status}</button>`).join('') + '</div>' : '';
}
$('#authGo').onclick = async () => {
  const body = { name: $('#aName').value, email: $('#aEmail').value, phone: $('#aPhone').value, password: $('#aPass').value,
    role: $('#aStaff').checked ? 'staff' : 'customer', staffCode: $('#aCode').value };
  const res = await fetch(authMode === 'login' ? '/api/login' : '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await res.json();
  if (!res.ok) return $('#authMsg').textContent = d.error;
  me = d; $('#authDlg').close(); $('#aPass').value = ''; $('#aCode').value = ''; renderAuth();
  if (me.role === 'staff') show('kitchenView');
};
$('#authClose').onclick = () => $('#authDlg').close();
document.addEventListener('click', async (e) => {
  const t = e.target, id = t.id, d = t.dataset;
  if (id === 'loginBtn') openAuth('login'); if (id === 'signupBtn') openAuth('signup');
  if (d.auth) setAuth(d.auth);
  if (d.track) { $('#trackId').value = d.track; show('trackView'); track(); }
  if (id === 'logoutBtn') { await fetch('/api/logout', { method: 'POST' }); me = null; renderAuth(); show('homeView'); }
});
document.addEventListener('change', (e) => { if (e.target.id === 'aStaff') $('#staffRow').classList.toggle('hidden', !e.target.checked); });

// ---------- Map pin (OpenStreetMap + Leaflet) ----------
let map, marker;
const CITY = [14.7566, 121.0450];
async function reverse(lat, lng) {
  $('#mapAddr').value = 'Finding address…';
  try { const j = await (await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`)).json();
    $('#mapAddr').value = j.display_name || `Pinned location (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
  } catch { $('#mapAddr').value = `Pinned location (${lat.toFixed(5)}, ${lng.toFixed(5)})`; }
}
function setPin(lat, lng, text) {
  pin = { lat, lng }; marker.setLatLng([lat, lng]); map.setView([lat, lng], 17);
  text ? $('#mapAddr').value = text : reverse(lat, lng);
}
function openMap() {
  if (typeof L === 'undefined') return alert('The map needs an internet connection.');
  $('#mapDlg').showModal();
  if (!map) {
    map = L.map('map').setView(CITY, 15);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
    marker = L.marker(CITY, { draggable: true }).addTo(map);
    marker.on('dragend', () => { const p = marker.getLatLng(); setPin(p.lat, p.lng); });
    map.on('click', (e) => setPin(e.latlng.lat, e.latlng.lng));
  }
  setTimeout(() => map.invalidateSize(), 150);
  if (pin) return setPin(pin.lat, pin.lng, $('#address').value || $('#homeAddress').value);
  reverse(...CITY);
  navigator.geolocation?.getCurrentPosition(p => setPin(p.coords.latitude, p.coords.longitude), () => {}, { timeout: 8000 });
}
$('#useLoc').onclick = openMap; $('#pinCart').onclick = openMap;
$('#mapCancel').onclick = () => $('#mapDlg').close();
$('#mapOk').onclick = () => { const t = $('#mapAddr').value.trim(); $('#homeAddress').value = t; $('#address').value = t; $('#mapDlg').close(); warn(''); };
$('#mapFind').onclick = async () => {
  const q = $('#mapSearch').value.trim(); if (!q) return;
  try { const r = await (await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ph&q=${encodeURIComponent(q)}`)).json();
    r[0] ? setPin(+r[0].lat, +r[0].lon, r[0].display_name) : $('#mapAddr').value = 'No result. Try a nearby landmark or drag the pin.';
  } catch { $('#mapAddr').value = 'Search failed. Drag the pin instead.'; }
};
['#address', '#homeAddress'].forEach(sel => $(sel).addEventListener('input', () => { pin = null; }));
// ---------- Search & sort ----------
$('#search').oninput = (e) => { q = e.target.value; renderMenu(); };
$('#sort').onchange = (e) => { sort = e.target.value; renderMenu(); };
$('#mbGo').onclick = () => $('#cart').scrollIntoView({ behavior: 'smooth' });

// ---------- Order history & receipts ----------
const orderCache = {};
const fmtDate = (d) => new Date(d).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
async function loadHistory() {
  const r = await fetch('/api/my-orders'); if (!r.ok) return show('homeView');
  const list = await r.json(); list.forEach(o => { orderCache[o.id] = o; });
  $('#history').innerHTML = list.length ? list.map(o => `<article class="box hist">
    <div class="histtop"><strong>Order #${o.id}</strong><span class="pill ${o.status}">${o.status}</span></div>
    <small>${fmtDate(o.createdAt)} · ${o.type}</small>
    <ul>${o.items.map(i => `<li>${i.qty} × ${esc(i.name)}</li>`).join('')}</ul>
    <div class="histtop"><strong>${peso(o.total)}</strong><span><button class="chip" data-track="${o.id}">Track</button> <button class="chip" data-receipt="${o.id}">Receipt</button></span></div></article>`).join('')
    : '<p class="empty">You have no orders yet. Browse the menu to place your first order.</p>';
}
function openReceipt(o) {
  $('#receiptBody').innerHTML = `<div class="receipt"><h3>Pizza Haus</h3><p class="rc">Order receipt</p>
    <p>Order #${o.id}<br>${fmtDate(o.createdAt)}<br>${esc(o.customer)} · ${esc(o.phone)}<br>${o.type}${o.address ? ': ' + esc(o.address) : ''}</p>
    <table>${o.items.map(i => `<tr><td>${i.qty} × ${esc(i.name)}</td><td>${peso(i.price * i.qty)}</td></tr>`).join('')}
    <tr class="sep"><td>Subtotal</td><td>${peso(o.subtotal)}</td></tr>
    ${o.discount ? `<tr><td>Voucher ${esc(o.voucher)}</td><td>−${peso(o.discount)}</td></tr>` : ''}
    ${o.type === 'Delivery' ? `<tr><td>Delivery fee</td><td>${o.deliveryFee ? peso(o.deliveryFee) : 'FREE'}</td></tr>` : ''}
    <tr class="tot"><td>Total</td><td>${peso(o.total)}</td></tr></table>
    <p>Payment: ${o.payment}</p><p class="rc">Thank you for ordering!</p></div>
    <div class="dlgfoot noprint"><button class="ghost" id="rcClose">Close</button><button class="add" id="rcPrint">Print</button></div>`;
  $('#receiptDlg').showModal();
}

// ---------- Staff menu editor ----------
async function loadEditor() {
  await loadMenu();
  const cats = [...new Set(menu.map(m => m.category))];
  $('#editor').innerHTML = `<div class="box"><h3>Add a dish</h3><div class="egrid">
      <input id="nName" placeholder="Dish name" maxlength="60"><input id="nCat" list="catlist" placeholder="Category (Pizza, Drinks...)"><datalist id="catlist">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
      <input id="nDesc" placeholder="Short description" maxlength="160"><input id="nImg" placeholder="Photo link or /images/file.jpg">
      <input id="nPrice" type="number" min="1" placeholder="Price (₱)"><input id="nP1" type="number" min="1" placeholder="Personal ₱"><input id="nP2" type="number" min="1" placeholder="Medium ₱"><input id="nP3" type="number" min="1" placeholder="Large ₱"></div>
    <p class="hint">For the Pizza category fill the three sizes. For everything else fill Price.</p>
    <button class="add" id="nAdd">Add dish</button><p id="eMsg" class="msg err"></p></div>` +
    menu.map(m => `<div class="erow" data-id="${m.id}">
      <div class="ename"><strong>${esc(m.name)}</strong><small>${esc(m.category)}</small></div>
      <div class="eprices">${m.prices ? ['Personal', 'Medium', 'Large'].map(k => `<label>${k}<input type="number" min="1" data-k="${k}" value="${m.prices[k]}"></label>`).join('') : `<label>Price<input type="number" min="1" data-k="price" value="${m.price}"></label>`}</div>
      <label class="check"><input type="checkbox" data-k="soldOut" ${m.soldOut ? 'checked' : ''}> Sold out</label>
      <div class="eact"><button class="add" data-save="${m.id}">Save</button><button class="ghost del" data-del="${m.id}">Delete</button></div></div>`).join('');
}
const sendMenu = (url, method, body) => fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
document.addEventListener('click', async (e) => {
  const t = e.target, d = t.dataset;
  if (d.receipt && orderCache[d.receipt]) openReceipt(orderCache[d.receipt]);
  if (t.id === 'rcClose') $('#receiptDlg').close();
  if (t.id === 'rcPrint') window.print();
  if (d.save) {
    const row = t.closest('.erow'), val = (k) => row.querySelector(`[data-k="${k}"]`)?.value;
    const body = { soldOut: row.querySelector('[data-k=soldOut]').checked };
    if (row.querySelector('[data-k=Personal]')) body.prices = { Personal: val('Personal'), Medium: val('Medium'), Large: val('Large') }; else body.price = val('price');
    const r = await sendMenu('/api/menu/' + d.save, 'PATCH', body);
    if (!r.ok) return alert((await r.json()).error);
    t.textContent = 'Saved'; setTimeout(() => { t.textContent = 'Save'; }, 1200); loadMenu();
  }
  if (d.del && confirm('Delete this dish from the menu?')) { await sendMenu('/api/menu/' + d.del, 'DELETE'); loadEditor(); }
  if (t.id === 'nAdd') {
    const cat = $('#nCat').value.trim(), body = { name: $('#nName').value, category: cat, desc: $('#nDesc').value, image: $('#nImg').value };
    if (cat.toLowerCase() === 'pizza') body.prices = { Personal: $('#nP1').value, Medium: $('#nP2').value, Large: $('#nP3').value }; else body.price = $('#nPrice').value;
    const r = await sendMenu('/api/menu', 'POST', body);
    if (!r.ok) return $('#eMsg').textContent = (await r.json()).error;
    loadEditor();
  }
});
// Smooth page transition: fade the current page out, then fade the next one in
let tok = 0;
function show(v) {
  const my = ++tok, cur = document.querySelector('.view:not(.hidden)');
  if (!cur || cur.id === v || matchMedia('(prefers-reduced-motion: reduce)').matches) return showNow(v);
  cur.classList.add('leave');
  setTimeout(() => { cur.classList.remove('leave'); if (my === tok) showNow(v); }, 170);
}
// ---------- Footer links ----------
const LEGAL = {
  privacy: ['Privacy Policy', 'We collect your name, phone number, email and delivery address only to process your orders. We never sell your information. Passwords are stored in scrambled form, and you can ask us to delete your account at any time.'],
  terms: ['Terms & Conditions', 'Orders are prepared as soon as they are placed, so changes or cancellations must be requested right away by calling the branch. Prices and availability may change. Vouchers cannot be combined and have minimum order amounts.']
};
document.addEventListener('click', (e) => {
  const d = e.target.dataset;
  if (d.fcat) { cat = d.fcat; renderCats(); renderMenu(); show('menuView'); }
  if (d.fview) { d.fview === 'ordersView' && !me ? openAuth('login', 'Log in to see your orders.') : show(d.fview); }
  if (d.fauth) openAuth(d.fauth);
  if (d.legal) { $('#legalBody').innerHTML = `<h3>${LEGAL[d.legal][0]}</h3><p>${LEGAL[d.legal][1]}</p><button class="primary wide" id="legalClose">Close</button>`; $('#legalDlg').showModal(); }
  if (e.target.id === 'legalClose') $('#legalDlg').close();
});
init();
