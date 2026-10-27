// Bộ nhớ đệm để mở được khi mạng yếu: trang và dữ liệu lấy mạng trước, thư viện PDF lấy bộ nhớ đệm trước.
const BAN = 'mcx-y3-v4';
const VO = ['./', 'index.html', 'app.css', 'app.js', 'pdf.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'data.enc.json'];
const THU_VIEN = ['vendor/pdfmake.min.js', 'vendor/vfs_fonts.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(BAN).then(c => c.addAll(VO.concat(THU_VIEN))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== BAN).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const ghi = res => {
    if (res.ok) { const c = res.clone(); caches.open(BAN).then(ca => ca.put(e.request, c)); }
    return res;
  };
  if (u.pathname.includes('/vendor/')) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(ghi)));
    return;
  }
  e.respondWith(fetch(e.request).then(ghi).catch(() => caches.match(e.request, {ignoreSearch: true})));
});
