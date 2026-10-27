'use strict';
// Chấm Mini-CEX tư vấn người bệnh – thực tập Ngoại khoa Y3 (Tổ bộ môn Ngoại – BV. Nhân dân Gia Định).
// Dữ liệu tình huống: data.enc.json (AES-256-GCM, khóa sinh từ mật khẩu bằng PBKDF2), dựng bằng _nguon\dung_webapp.py.
// Bản ghi chấm lưu trong IndexedDB của máy giảng viên; phiếu PDF tạo tại máy (pdf.js).

const LS = {khoa: 'mcx-y3:khoa', mac_dinh: 'mcx-y3:mac-dinh'};
const LUOT = [1, 2, 3, 4, 'bs'];
const DONG_VAI = ['Sinh viên cùng nhóm', 'Bác sĩ nội trú', 'Giảng viên khác', 'Khác'];
const KHOA_TT = ['Ngoại Tiêu hóa', 'Ngoại Gan mật', 'Lồng ngực – Mạch máu', 'Ngoại Niệu', 'Cấp cứu'];
const BUOC = ['Tình huống', 'Sinh viên', 'Quan sát', 'Chấm điểm', 'Phản hồi'];
const KQ_TC = [[1, 'Đủ'], [0.5, 'Một phần'], [0, 'Không']];
// [khóa, nhãn, gợi ý, bắt buộc] – phần E của phiếu chấm, mô hình hỏi – nói – hỏi
const PH = [
  ['sv_tu_nhan_xet', 'Sinh viên tự nhận xét', '“Em thấy phần nào làm được? Nếu làm lại, em muốn làm khác chỗ nào?”', false],
  ['nguoi_dong_vai', 'Cảm nhận của người đóng vai', '“Khi là người bệnh, tôi thấy…”', false],
  ['lam_tot', 'Điểm làm tốt (hành vi cụ thể)', 'Hai hành vi làm tốt, kèm câu nói hoặc hành động quan sát được', true],
  ['cai_thien', 'Điểm cần cải thiện', 'Một đến hai hành vi cần cải thiện, kèm câu nói mẫu thay thế', true],
  ['lan_toi', 'Việc em sẽ làm lần tới', '“Lần tới em sẽ làm gì khác?” – ghi theo lời sinh viên', true],
];

let GOI = null, DL = null, TH = {}, BG = [], R = null;
const UI = {man: 'tai', buoc: 1, loc_nhom: '', xem: null, tab_xem: 'sv', tab_ben: 'sv', tab_chu: 'luot', tim: '',
            loc_nam: '', loc_dot: '', mo_muc: {}, pdf: null, da_bao: {}, doc_bat_dau: null};

// ============================================================ tiện ích
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const soTC = x => String(Math.round(x * 10) / 10).replace('.', ',');
const d10 = t => (t / 10).toFixed(1).replace('.', ',');
const khongDau = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
const chuanTim = s => khongDau(s).toLowerCase().trim();
const chuanMSSV = s => String(s ?? '').trim().toUpperCase();
const tenLuot = l => l === 'bs' ? 'Lượt bổ sung' : l ? `Lượt ${l}` : '';
const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64e = u => btoa(String.fromCharCode(...u));
const docJSON = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const ghiLS = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* chế độ riêng tư */ } };

function homNay() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function namHocMacDinh() {
  const d = new Date(), y = d.getFullYear();
  return d.getMonth() >= 7 ? `${y}–${y + 1}` : `${y - 1}–${y}`;
}
function ngayVN(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
function dinhDangGio(ms) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
function layDuong(o, p) { return p.split('.').reduce((a, k) => a?.[k], o); }
function datDuong(o, p, v) {
  const ks = p.split('.'), cuoi = ks.pop();
  ks.reduce((a, k) => a[k], o)[cuoi] = v;
}
function bao(msg, manh) {
  const el = document.createElement('div');
  el.className = 'tb' + (manh ? ' manh' : '');
  el.textContent = msg;
  $('#thong-bao').appendChild(el);
  setTimeout(() => el.remove(), manh ? 5000 : 3000);
}
function taiTep(blob, ten) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = ten;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

// ============================================================ lưu trữ: IndexedDB
const KHO = {
  db: null,
  mo() {
    return new Promise(ok => {
      try {
        const q = indexedDB.open('mcx-y3', 1);
        q.onupgradeneeded = () => q.result.createObjectStore('ban_ghi', {keyPath: 'id'});
        q.onsuccess = () => { this.db = q.result; ok(); };
        q.onerror = () => ok();
      } catch { ok(); }
    });
  },
  _goi(mode, fn) {
    if (!this.db) return Promise.resolve(mode === 'readonly' ? [] : undefined);
    return new Promise((ok, ko) => {
      const q = fn(this.db.transaction('ban_ghi', mode).objectStore('ban_ghi'));
      q.onsuccess = () => ok(q.result);
      q.onerror = () => ko(q.error);
    });
  },
  tatCa() { return this._goi('readonly', s => s.getAll()); },
  luu(r) { return this._goi('readwrite', s => s.put(r)); },
  xoa(id) { return this._goi('readwrite', s => s.delete(id)); },
};
let henLuu = null;
function daSua() {
  if (!R) return;
  R.sua_luc = new Date().toISOString();
  if (R.ma_th && !BG.includes(R)) BG.push(R);
  clearTimeout(henLuu);
  henLuu = setTimeout(luuNgay, 400);
}
function luuNgay() {
  clearTimeout(henLuu);
  henLuu = null;
  if (R && R.ma_th) KHO.luu(R).catch(() => bao('Không lưu được trên máy này. Hãy xuất PDF ngay.', true));
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') luuNgay();
  else if (R?.dong_ho.bat_dau) giuManHinh(true);
});
window.addEventListener('pagehide', luuNgay);

function docMacDinh() { return docJSON(LS.mac_dinh) || {}; }
function luuMacDinh() {
  if (!R) return;
  ghiLS(LS.mac_dinh, {gv: R.gv, lop: R.sv.lop, to: R.sv.to, dot: R.sv.dot, nam_hoc: R.sv.nam_hoc, khoa: R.sv.khoa,
                      dia_diem: R.dia_diem});
}

// ============================================================ mã hóa
async function khoaTuMatKhau(mk, goi) {
  const goc = await crypto.subtle.importKey('raw', new TextEncoder().encode(mk.normalize('NFC').trim().toLowerCase()),
                                            'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name: 'PBKDF2', salt: b64d(goi.muoi), iterations: goi.vong, hash: 'SHA-256'}, goc,
                                 {name: 'AES-GCM', length: 256}, true, ['decrypt']);
}
async function giaiMa(goi, khoa) {
  const tho = await crypto.subtle.decrypt({name: 'AES-GCM', iv: b64d(goi.iv)}, khoa, b64d(goi.ma));
  return JSON.parse(new TextDecoder().decode(tho));
}

// ============================================================ bản ghi và quy tắc chấm
function banGhiMoi(mau) {
  const m = docMacDinh();
  return {
    id: 'mc' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    tao_luc: new Date().toISOString(), sua_luc: new Date().toISOString(), trang_thai: 'nhap',
    phien_ban_dl: GOI.phien_ban, ma_th: null,
    sv: {ho_ten: '', mssv: '', lop: mau?.sv.lop ?? m.lop ?? '', to: mau?.sv.to ?? m.to ?? '', dot: mau?.sv.dot ?? m.dot ?? '',
         nam_hoc: mau?.sv.nam_hoc ?? m.nam_hoc ?? namHocMacDinh(), khoa: mau?.sv.khoa ?? m.khoa ?? ''},
    luot: null, ngay: mau?.ngay ?? homNay(), dia_diem: mau?.dia_diem ?? m.dia_diem ?? '', gv: mau?.gv ?? m.gv ?? '',
    dong_vai: {loai: mau?.dong_vai.loai ?? '', ho_ten: mau?.dong_vai.ho_ten ?? '', mssv: mau?.dong_vai.mssv ?? ''},
    dong_ho: {bat_dau: null, tich_luy: 0},
    then_chot: [], loi: [], diem: Array(7).fill(null), nhan_dinh: null, ly_do_nhan_dinh: '', giam_sat: null,
    ghi_chu: '', phan_hoi: Object.fromEntries(PH.map(([k]) => [k, ''])), phut_quan_sat: null, phut_phan_hoi: 5,
    chu_ky: {gv: null, sv: null}, pdf: {diem_day: true, ghi_chu: false}, hoan_tat_luc: null,
  };
}
function datTinhHuong(r, ma) {
  const th = TH[ma];
  r.ma_th = ma;
  r.then_chot = th.then_chot.map(() => null);
  r.loi = th.loi.map(() => false);
  r.diem = Array(DL.linh_vuc.length).fill(null);
  r.nhan_dinh = null;
  r.ly_do_nhan_dinh = '';
  r.giam_sat = null;
  if (!r.dong_vai.loai) r.dong_vai.loai = DONG_VAI.includes(th.dong_vai) ? th.dong_vai : 'Khác';
}
// Bản ghi cũ hoặc nhập từ máy khác: bổ sung trường thiếu, khớp độ dài với tình huống hiện hành.
function chuanHoa(r) {
  const mau = banGhiMoi();
  for (const k of Object.keys(mau)) if (r[k] === undefined) r[k] = mau[k];
  for (const k of ['sv', 'dong_vai', 'dong_ho', 'phan_hoi', 'chu_ky', 'pdf']) r[k] = {...mau[k], ...r[k]};
  const th = TH[r.ma_th];
  if (th) {
    const khop = (a, n, v) => Array.from({length: n}, (_, i) => a?.[i] ?? v);
    r.then_chot = khop(r.then_chot, th.then_chot.length, null);
    r.loi = khop(r.loi, th.loi.length, false);
    r.diem = khop(r.diem, DL.linh_vuc.length, null);
  }
  return r;
}

const tongTC = r => r.then_chot.reduce((a, x) => a + (x || 0), 0);
const soTCChua = r => r.then_chot.filter(x => x == null).length;
const tong = r => r.diem.reduce((a, x) => a + (x || 0), 0);
const coLoi = r => r.loi.some(Boolean);
function mucTheoDiem(i, d) {
  if (d == null) return null;
  const k = DL.linh_vuc[i].muc.findIndex(m => d >= m.tu && d <= m.den);
  return k < 0 ? null : k;
}
function mucNoiDung(r) {
  const t = tongTC(r), q = DL.quy_tac;
  return t >= q.then_chot_tot ? 2 : t >= q.then_chot_dat ? 1 : 0;
}
function loiCuaLV(r, i) {
  const th = TH[r.ma_th];
  return th.loi_lv.map((lv, k) => (r.loi[k] && lv - 1 === i ? k : -1)).filter(k => k >= 0);
}
function mucChoPhep(r, i) {
  if (loiCuaLV(r, i).length) return [0];
  if (i === 2) return [mucNoiDung(r)];
  return [0, 1, 2];
}
// Lĩnh vực 3: gợi ý điểm nội suy trong khoảng của mức, theo tổng điểm then chốt.
function goiYNoiDung(r) {
  if (loiCuaLV(r, 2).length) return null;
  const q = DL.quy_tac, n = r.then_chot.length, t = tongTC(r), m = mucNoiDung(r), muc = DL.linh_vuc[2].muc[m];
  const [lo, hi] = m === 2 ? [q.then_chot_tot, n] : m === 1 ? [q.then_chot_dat, q.then_chot_tot - 0.5] : [0, q.then_chot_dat - 0.5];
  return Math.round(muc.tu + (Math.min(Math.max(t, lo), hi) - lo) / (hi - lo || 1) * (muc.den - muc.tu));
}
const diemHopLe = (r, i) => r.diem[i] != null && mucChoPhep(r, i).includes(mucTheoDiem(i, r.diem[i]));
const duDiem = r => r.diem.every((_, i) => diemHopLe(r, i));
function nhanDinhGoiY(r) {
  if (coLoi(r)) return 0;
  const t = tong(r), q = DL.quy_tac;
  return t < q.nhan_dinh_dat ? 0 : t < q.nhan_dinh_tot ? 1 : 2;
}
function nhanDinh(r) {
  if (!duDiem(r)) return null;
  const g = nhanDinhGoiY(r);
  if (coLoi(r)) return 0;
  return r.nhan_dinh != null && Math.abs(r.nhan_dinh - g) <= 1 ? r.nhan_dinh : g;
}
const canLyDo = r => { const n = nhanDinh(r); return n != null && n !== nhanDinhGoiY(r); };
const msDongHo = r => r.dong_ho.tich_luy + (r.dong_ho.bat_dau ? Date.now() - r.dong_ho.bat_dau : 0);
function phutQS(r) {
  if (r.phut_quan_sat != null && r.phut_quan_sat !== '') return r.phut_quan_sat;
  const ms = msDongHo(r);
  return ms > 0 ? Math.max(1, Math.round(ms / 60000)) : null;
}
function coDuLieuCham(r) {
  return r.then_chot.some(x => x != null) || r.loi.some(Boolean) || r.diem.some(x => x != null) || msDongHo(r) > 0;
}
function thieu(r) {
  const t = [];
  if (!r.ma_th) return [[1, 'Chọn tình huống']];
  if (!r.sv.ho_ten.trim()) t.push([2, 'Họ tên sinh viên']);
  if (!r.sv.mssv.trim()) t.push([2, 'MSSV']);
  if (!r.luot) t.push([2, 'Lượt Mini-CEX']);
  if (!r.gv.trim()) t.push([2, 'Giảng viên chấm']);
  const c = soTCChua(r);
  if (c) t.push([3, `${c} điểm then chốt chưa đánh dấu`]);
  r.diem.forEach((d, i) => {
    if (!diemHopLe(r, i)) t.push([4, d == null ? `Điểm lĩnh vực ${i + 1}` : `Lĩnh vực ${i + 1}: điểm ${d} không thuộc mức cho phép`]);
  });
  if (canLyDo(r) && !r.ly_do_nhan_dinh.trim()) t.push([4, 'Lý do chọn nhận định khác gợi ý']);
  if (r.giam_sat == null) t.push([4, 'Mức giám sát đề nghị']);
  for (const [k, ten, , bb] of PH) if (bb && !r.phan_hoi[k].trim()) t.push([5, ten]);
  return t;
}
function xongBuoc(r, b) {
  return r.ma_th != null && !thieu(r).some(([x]) => x === b);
}
function lichSuSV(mssv, boQua) {
  const m = chuanMSSV(mssv);
  return m ? BG.filter(x => x !== boQua && x.ma_th && chuanMSSV(x.sv.mssv) === m).sort((a, b) => (a.ngay < b.ngay ? -1 : 1)) : [];
}
function daDongVai(r) {
  const m = chuanMSSV(r.sv.mssv), ten = chuanTim(r.sv.ho_ten);
  return BG.filter(x => x !== r && x.ma_th === r.ma_th && x.dong_vai.loai === 'Sinh viên cùng nhóm' &&
    ((m && chuanMSSV(x.dong_vai.mssv) === m) || (ten && chuanTim(x.dong_vai.ho_ten) === ten)));
}

// ============================================================ khởi động, đăng nhập
async function khoiDong() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  if (!window.crypto?.subtle) {
    $('#app').innerHTML = '<main class="dang-nhap"><div class="the dn-the"><h1>Không mở được</h1><p>Trình duyệt này không hỗ trợ giải mã. Hãy mở bằng Chrome, Safari hoặc Edge bản mới qua địa chỉ https.</p></div></main>';
    return;
  }
  try {
    GOI = await (await fetch('data.enc.json', {cache: 'no-cache'})).json();
  } catch {
    $('#app').innerHTML = '<main class="dang-nhap"><div class="the dn-the"><h1>Không tải được dữ liệu</h1><p>Kiểm tra kết nối mạng rồi tải lại trang.</p></div></main>';
    return;
  }
  const nho = docJSON(LS.khoa);
  if (nho && nho.muoi === GOI.muoi) {
    try {
      const k = await crypto.subtle.importKey('raw', b64d(nho.k), 'AES-GCM', true, ['decrypt']);
      return await vaoApp(await giaiMa(GOI, k));
    } catch { ghiLS(LS.khoa, null); }
  }
  UI.man = 'dang_nhap';
  ve();
}
async function dangNhap(form) {
  const nut = form.querySelector('button[type=submit]'), loi = form.querySelector('.loi');
  const mk = form.querySelector('#mk').value, nho = form.querySelector('#ghi-nho').checked;
  if (!mk.trim()) return;
  nut.disabled = true;
  nut.textContent = 'Đang mở khóa…';
  loi.textContent = '';
  let dl, khoa;
  try {
    khoa = await khoaTuMatKhau(mk, GOI);
    dl = await giaiMa(GOI, khoa);
  } catch {
    nut.disabled = false;
    nut.textContent = 'Mở khóa';
    loi.textContent = 'Mật khẩu không đúng.';
    form.querySelector('#mk').select();
    return;
  }
  if (nho) ghiLS(LS.khoa, {muoi: GOI.muoi, k: b64e(new Uint8Array(await crypto.subtle.exportKey('raw', khoa)))});
  await vaoApp(dl);
}
async function vaoApp(dl) {
  DL = dl;
  TH = Object.fromEntries(dl.tinh_huong.map(t => [t.ma, t]));
  await KHO.mo();
  if (!KHO.db) bao('Trình duyệt không cho lưu dữ liệu: bản ghi sẽ mất khi đóng trang. Hãy xuất PDF sau mỗi lượt.', true);
  BG = (await KHO.tatCa().catch(() => [])).filter(r => TH[r.ma_th]).map(chuanHoa);
  UI.man = 'chu';
  history.replaceState({man: 'chu'}, '');
  ve();
}

// ============================================================ điều hướng
function diToi(man, buoc, thay) {
  if (UI.man === 'cham' && man !== 'cham') luuNgay();
  UI.man = man;
  if (buoc) UI.buoc = buoc;
  UI.mo_muc = {};
  const st = {man, buoc: UI.buoc, id: R?.id};
  thay ? history.replaceState(st, '') : history.pushState(st, '');
  dongLopPhu();
  ve();
  window.scrollTo(0, 0);
}
window.addEventListener('popstate', e => {
  if (!DL) return;
  const s = e.state;
  dongLopPhu();
  if (s?.man === 'cham') {
    const r = BG.find(x => x.id === s.id) || (R?.id === s.id ? R : null);
    if (r) { R = r; UI.man = 'cham'; UI.buoc = s.buoc; ve(); return; }
  }
  luuNgay();
  UI.man = 'chu';
  ve();
});
function moBanGhi(r) {
  R = r;
  UI.pdf = null;
  UI.xem = null;
  const b = r.trang_thai === 'xong' ? 5 : (thieu(r)[0]?.[0] ?? 5);
  diToi('cham', Math.max(b, r.ma_th ? 2 : 1));
}
function batDauMoi(mau) {
  R = banGhiMoi(mau);
  UI.pdf = null;
  UI.xem = null;
  if (mau?.ma_th) {
    datTinhHuong(R, mau.ma_th);
    R.dong_vai = {...mau.dong_vai};
    daSua();
    diToi('cham', 2);
  } else diToi('cham', 1);
}

// ============================================================ vẽ giao diện
function ve() {
  const y = window.scrollY;
  const app = $('#app');
  if (UI.man === 'dang_nhap') app.innerHTML = veDangNhap();
  else if (UI.man === 'chu') app.innerHTML = veChu();
  else if (UI.man === 'cham') app.innerHTML = veCham();
  sauKhiVe();
  window.scrollTo(0, y);
}
function veDangNhap() {
  return `<main class="dang-nhap"><div class="the dn-the">
    <img src="icon.svg" alt="" width="64" height="64">
    <h1>Chấm Mini-CEX tư vấn</h1>
    <p class="phu">Thực tập Ngoại khoa Y3<br>Tổ bộ môn Ngoại – BV. Nhân dân Gia Định</p>
    <form data-form="dang_nhap" autocomplete="on">
      <input class="an" type="text" name="username" autocomplete="username" value="minicex-y3" tabindex="-1" aria-hidden="true">
      <label class="truong"><span>Mật khẩu</span>
        <input type="password" id="mk" name="password" autocomplete="current-password" autocapitalize="none" spellcheck="false" required autofocus></label>
      <label class="kiem"><input type="checkbox" id="ghi-nho"> Ghi nhớ trên thiết bị này (máy cá nhân)</label>
      <button class="nut chinh rong lon" type="submit">Mở khóa</button>
      <p class="loi" role="alert"></p>
    </form>
  </div></main>`;
}

function veDauChu() {
  const gv = docMacDinh().gv;
  return `<header class="dau">
    <div class="dau-logo"><img src="icon.svg" alt=""><div class="dau-giua"><b>Mini-CEX tư vấn Y3</b>
      <small>${gv ? 'GV: ' + esc(gv) : 'Tổ bộ môn Ngoại – BV. Nhân dân Gia Định'}</small></div></div>
    <div class="dau-phai"><button class="nut vien nho" data-act="cai_dat">Cài đặt</button>
      <button class="nut vien nho" data-act="dang_xuat">Khóa</button></div>
  </header>`;
}
function dongBG(r) {
  const th = TH[r.ma_th], xong = r.trang_thai === 'xong', nd = xong ? nhanDinh(r) : null;
  return `<li class="dong-bg">
    <button class="dong-chinh" data-act="mo_bg" data-id="${r.id}"><b>${esc(r.sv.ho_ten || '(chưa nhập tên)')}</b>
      ${r.sv.mssv ? `<span class="phu"> · ${esc(r.sv.mssv)}</span>` : ''}
      <small>${esc(th.ma)} ${esc(th.ten)}</small>
      <small>${[tenLuot(r.luot), ngayVN(r.ngay), r.sv.dot, r.sv.to ? 'Tổ ' + r.sv.to : '', r.gv ? 'GV ' + r.gv : ''].filter(Boolean).map(esc).join(' · ')}</small></button>
    <div class="diem-bg">${xong ? `${d10(tong(r))}<span class="nhan-nd nd-${nd}">${DL.nhan_dinh[nd]}</span>` : '<span class="nhan-canh">Nháp</span>'}</div>
    <div class="dong-nut">${xong ? `<button class="nut vien nho" data-act="pdf_bg" data-id="${r.id}">Tải PDF</button>` : ''}
      <button class="nut vien nho" data-act="mo_bg" data-id="${r.id}">${xong ? 'Xem, sửa' : 'Tiếp tục'}</button>
      <button class="nut vien nho nguy" data-act="xoa_bg" data-id="${r.id}">Xóa</button></div>
  </li>`;
}
function locBG() {
  const q = chuanTim(UI.tim);
  return BG.filter(r => (!UI.loc_nam || r.sv.nam_hoc === UI.loc_nam) && (!UI.loc_dot || r.sv.dot === UI.loc_dot) &&
    (!q || chuanTim([r.sv.ho_ten, r.sv.mssv, r.ma_th, r.sv.lop, 'to ' + r.sv.to, r.gv, r.sv.dot].join(' ')).includes(q)));
}
function tongHopSV(ds) {
  const m = new Map();
  for (const r of ds.filter(x => x.trang_thai === 'xong')) {
    const k = chuanMSSV(r.sv.mssv) || chuanTim(r.sv.ho_ten);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return [...m.values()].map(g => {
    g.sort((a, b) => (a.ngay < b.ngay ? -1 : 1));
    const c = g[g.length - 1];
    return {mssv: c.sv.mssv, ho_ten: c.sv.ho_ten, lop: c.sv.lop, to: c.sv.to, dot: c.sv.dot, nam_hoc: c.sv.nam_hoc,
            so: g.length, tb: g.reduce((a, r) => a + tong(r), 0) / g.length / 10, loi: g.filter(coLoi).length,
            ds: g.map(r => `${r.ma_th} ${d10(tong(r))}`).join('; ')};
  }).sort((a, b) => chuanTim(a.ho_ten).localeCompare(chuanTim(b.ho_ten)));
}
function veChu() {
  const nhap = BG.filter(r => r.ma_th && r.trang_thai !== 'xong').sort((a, b) => (a.sua_luc < b.sua_luc ? 1 : -1));
  const ds = locBG();
  const xong = ds.filter(r => r.trang_thai === 'xong').sort((a, b) => (a.ngay + a.sua_luc < b.ngay + b.sua_luc ? 1 : -1));
  const namHoc = [...new Set(BG.map(r => r.sv.nam_hoc).filter(Boolean))].sort();
  const dot = [...new Set(BG.map(r => r.sv.dot).filter(Boolean))].sort();
  const opt = (ds, v, ten) => `<option value="">${ten}</option>` + ds.map(x => `<option ${x === v ? 'selected' : ''}>${esc(x)}</option>`).join('');
  const sv = UI.tab_chu === 'sv' ? tongHopSV(ds) : [];
  return `${veDauChu()}<main>
    <section class="mo-dau">
      <button class="nut chinh lon" data-act="moi">+ Chấm lượt mới</button>
      ${nhap.length ? `<div class="ds-nhap"><span class="nhan">Lượt đang chấm dở</span>${nhap.slice(0, 4).map(r => `
        <button class="dong-nhap" data-act="mo_bg" data-id="${r.id}"><span><b>${esc(r.sv.ho_ten || '(chưa nhập tên)')}</b>
          <small> · ${esc(r.ma_th)} · ${ngayVN(r.ngay)}</small></span><span>Tiếp tục ›</span></button>`).join('')}</div>`
        : `<p class="phu">Mỗi lượt: chọn tình huống, nhập sinh viên, quan sát và đánh dấu, chấm 7 lĩnh vực, phản hồi rồi tạo phiếu PDF. Dữ liệu tự lưu trên máy này.</p>`}
    </section>
    <section class="the">
      <div class="tabs" role="tablist">
        <button role="tab" aria-selected="${UI.tab_chu === 'luot'}" data-act="tab_chu" data-v="luot">Các lượt đã chấm (${BG.filter(r => r.trang_thai === 'xong').length})</button>
        <button role="tab" aria-selected="${UI.tab_chu === 'sv'}" data-act="tab_chu" data-v="sv">Theo sinh viên</button>
      </div>
      <div class="loc-hang">
        <label class="truong"><span>Tìm</span><input type="search" data-tim="1" value="${esc(UI.tim)}" placeholder="Tên, MSSV, mã tình huống, tổ…"></label>
        ${namHoc.length > 1 ? `<label class="truong"><span>Năm học</span><select data-loc="loc_nam">${opt(namHoc, UI.loc_nam, 'Tất cả')}</select></label>` : ''}
        ${dot.length > 1 ? `<label class="truong"><span>Đợt</span><select data-loc="loc_dot">${opt(dot, UI.loc_dot, 'Tất cả')}</select></label>` : ''}
      </div>
      <div id="ds-chu">${UI.tab_chu === 'luot' ? veDsLuot(xong) : veDsSV(sv)}</div>
    </section>
    <section class="cong-cu">
      <button class="nut vien" data-act="xuat_csv">Xuất bảng điểm (CSV)</button>
      <button class="nut vien" data-act="sao_luu">Sao lưu dữ liệu (JSON)</button>
      <button class="nut vien" data-act="nhap">Nhập dữ liệu từ máy khác</button>
    </section>
    <p class="nhat" style="margin-top:16px">Dữ liệu tình huống phiên bản ${esc(GOI.phien_ban)} · ${DL.tinh_huong.length} tình huống · ${esc(DL.ten_bo)}. Bản ghi chấm chỉ lưu trên thiết bị này; sao lưu định kỳ hoặc lưu PDF từng lượt.</p>
  </main>`;
}
function veDsLuot(xong) {
  return xong.length ? `<ul class="ds-bg">${xong.map(dongBG).join('')}</ul>`
    : `<p class="trong">${BG.length ? 'Không có lượt nào khớp bộ lọc.' : 'Chưa có lượt nào được chấm trên máy này.'}</p>`;
}
function veDsSV(sv) {
  if (!sv.length) return '<p class="trong">Chưa có lượt hoàn tất.</p>';
  return `<div class="bang-cuon"><table class="bang"><thead><tr><th>Sinh viên</th><th>Lớp, tổ</th><th>Số lượt</th>
    <th>Điểm TB (/10)</th><th>Lượt có lỗi NT</th><th>Các lượt</th></tr></thead><tbody>
    ${sv.map(s => `<tr><td><b>${esc(s.ho_ten)}</b><br><small>${esc(s.mssv)}</small></td><td>${esc([s.lop, s.to ? 'Tổ ' + s.to : ''].filter(Boolean).join(', '))}</td>
      <td class="so">${s.so}</td><td class="so"><b>${s.tb.toFixed(2).replace('.', ',')}</b></td><td class="so">${s.loi || ''}</td>
      <td><small>${esc(s.ds)}</small></td></tr>`).join('')}</tbody></table></div>
    <p class="nhat">Điểm Mini-CEX tư vấn của đợt = trung bình các lượt được chấm (hướng dẫn mục 3.4). Lượt có lỗi nghiêm trọng vẫn được tính; sinh viên làm thêm một lượt cùng nhóm chủ đề.</p>`;
}

// ---------- màn chấm
function veCham() {
  const th = R.ma_th ? TH[R.ma_th] : null;
  const ben = th && UI.buoc >= 3;
  const noiDung = [veB1, veB2, veB3, veB4, veB5][UI.buoc - 1]();
  return `<div class="dinh"><header class="dau">
      <button class="nut vien nho" data-act="ve_chu">‹ Danh sách</button>
      <div class="dau-giua"><b id="dau-ten">${th ? esc(th.ma) : 'Lượt mới'}${R.sv.ho_ten ? ' · ' + esc(R.sv.ho_ten) : ''}</b>
        <small>${R.trang_thai === 'xong' ? 'Đã hoàn tất · thay đổi được tự lưu' : 'Nháp · tự lưu trên máy này'}</small></div>
      ${th ? '<button class="nut vien nho an-rong" data-act="xem_th">Tình huống</button>' : ''}
    </header>
    <nav class="buoc-nav" aria-label="Các bước">${BUOC.map((b, i) => `<button data-act="buoc" data-b="${i + 1}"
      class="${UI.buoc === i + 1 ? 'hien' : ''} ${xongBuoc(R, i + 1) ? 'xong' : ''}" ${i && !th ? 'disabled' : ''}
      ${UI.buoc === i + 1 ? 'aria-current="step"' : ''}><span>${xongBuoc(R, i + 1) && UI.buoc !== i + 1 ? '✓' : i + 1}</span>${b}</button>`).join('')}</nav></div>
    <main><div class="khung-cham ${ben ? 'co-ben' : ''}"><div class="cot-chinh">${noiDung}</div>
      ${ben ? `<aside class="cot-ben"><div class="the">${veThamKhao(th, UI.tab_ben, 'tab_ben')}</div></aside>` : ''}</div></main>
    ${veThanhDuoi()}`;
}
function veThanhDuoi() {
  const coDH = UI.buoc >= 3, t = tong(R), nd = nhanDinh(R);
  const chay = R.dong_ho.bat_dau ? 'chay' : '';
  return `<footer class="thanh-duoi">
    ${coDH ? `<button class="dh-nho ${chay}" data-act="dh_bat_tat" aria-label="Đồng hồ: bấm để chạy hoặc tạm dừng">${R.dong_ho.bat_dau ? '❚❚' : '▶'} <span class="dh-so" id="dh-so">${dinhDangGio(msDongHo(R))}</span></button>` : ''}
    <div class="tong-nho">${coDH ? `Tổng <b>${t}</b>/100 · <b>${d10(t)}</b>/10${nd != null ? ` <span class="nhan-nd nd-${nd}">${DL.nhan_dinh[nd]}</span>` : ''}`
      : (R.ma_th ? esc(TH[R.ma_th].ten) : 'Chọn một tình huống')}</div>
    <div class="dieu-huong">${UI.buoc > 1 ? '<button class="nut vien" data-act="lui" aria-label="Bước trước">‹</button>' : ''}
      ${UI.buoc < 5 ? `<button class="nut chinh" data-act="tien" ${!R.ma_th ? 'disabled' : ''}>Tiếp ›</button>` : ''}</div>
  </footer>`;
}
function veThamKhao(th, tab, act) {
  const tabs = [['sv', 'Phiếu sinh viên'], ['vai', 'Kịch bản'], ['day', 'Điểm dạy']];
  let nd;
  if (tab === 'vai') {
    const v = th.vai, ds = a => `<ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
    nd = `<p class="bao-mat">Không để sinh viên được chấm xem kịch bản.</p><dl class="kb">
      <dt>Người đóng vai</dt><dd>${esc(th.dong_vai)} · độ khó ${esc(th.do_kho.toLowerCase())}</dd>
      <dt>Bạn là</dt><dd>${esc(v.nhan_vat)}</dd><dt>Hoàn cảnh</dt><dd>${esc(v.hoan_canh)}</dd>
      <dt>Tâm trạng, cách nói</dt><dd>${esc(v.tam_trang)}</dd><dt>Câu mở đầu</dt><dd class="loi-thoai">${esc(v.mo_dau)}</dd>
      <dt>Chỉ nói khi được hỏi</dt><dd>${ds(v.chi_noi)}</dd><dt>Câu hỏi phải hỏi</dt><dd>${ds(v.cau_hoi)}</dd>
      <dt>Câu hỏi thử thách (khoảng phút 5–6)</dt><dd class="loi-thoai">${esc(v.thu_thach)}</dd>
      <dt>Phản ứng theo cách sinh viên giao tiếp</dt><dd>${ds(v.phan_ung)}</dd>
      <dt>Kết thúc</dt><dd>Khi sinh viên tóm tắt, hỏi còn thắc mắc gì: cảm ơn và kết thúc. Sau lượt, nói 1–2 câu cảm nhận; không cho điểm, không tiết lộ kịch bản.</dd></dl>`;
  } else if (tab === 'day') {
    nd = `<h4>Điểm dạy</h4><ul>${th.diem_day.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      <h4>Tài liệu</h4><ol>${th.tai_lieu.map(x => `<li><small>${esc(x)}</small></li>`).join('')}</ol>
      <p class="nhat">${esc(th.lien_he)} · ${esc(th.clo)}</p>`;
  } else nd = veNhiemVu(th);
  return `<div class="tabs" role="tablist">${tabs.map(([k, t]) => `<button role="tab" aria-selected="${tab === k}" data-act="${act}" data-v="${k}">${t}</button>`).join('')}</div>
    <div class="tk-nd">${nd}</div>`;
}
function veNhiemVu(th) {
  return `<p>${md('**Bối cảnh.** ' + th.sv.boi_canh)}</p>${(th.sv.thong_tin || []).map(x => `<p>${md(x)}</p>`).join('')}
    <p>${md('**Nhiệm vụ.** ' + th.sv.nhiem_vu)} Thời gian: đọc phiếu 2 phút; tư vấn 8–10 phút.</p>
    <p class="nhat"><em>Anh/chị là sinh viên Y3. Câu hỏi vượt vai trò sinh viên thì nói rõ sẽ mời bác sĩ trả lời.</em></p>`;
}

// Bước 1: tình huống
function veB1() {
  const ds = DL.tinh_huong.filter(t => !UI.loc_nhom || t.nhom === UI.loc_nhom);
  const daLam = new Set(lichSuSV(R.sv.mssv, R).map(x => x.ma_th));
  const xem = UI.xem ? TH[UI.xem] : R.ma_th ? TH[R.ma_th] : null;
  const dk = t => ['Thấp', 'Trung bình', 'Cao'].indexOf(t.do_kho);
  return `<div class="tieu-de-buoc"><h2>Chọn tình huống</h2><p class="phu">${DL.tinh_huong.length} tình huống tư vấn trên người đóng vai. Chạm để xem phiếu sinh viên, kịch bản, điểm dạy.</p></div>
    <div class="chips">${['', ...DL.nhom].map(n => `<button class="chip" data-act="loc_nhom" data-v="${esc(n)}" aria-pressed="${UI.loc_nhom === n}">${esc(n || 'Tất cả')}</button>`).join('')}</div>
    <div class="luoi-th">${ds.map(t => `<button class="the-th ${R.ma_th === t.ma ? 'chon' : ''} ${xem?.ma === t.ma ? 'dang-xem' : ''}" data-act="xem_b1" data-ma="${t.ma}">
      <span class="th-hang"><span class="th-ma">${t.ma}</span><span class="do-kho dk-${dk(t)}">${esc(t.do_kho)}</span>
        ${daLam.has(t.ma) ? '<span class="nhan-canh">SV đã làm</span>' : ''}${R.ma_th === t.ma ? '<span class="nhan-chon">Đã chọn</span>' : ''}</span>
      <b>${esc(t.ten)}</b><small>${esc(t.nhom)} · ${esc(t.dong_vai)}</small></button>`).join('')}</div>
    ${xem ? `<section class="the chi-tiet" id="chi-tiet"><div class="ct-dau"><div><span class="th-ma">${xem.ma}</span>
        <h3>${esc(xem.ten)}</h3><p class="phu">${esc(xem.nhom)} · độ khó ${esc(xem.do_kho.toLowerCase())} · người đóng vai: ${esc(xem.dong_vai.toLowerCase())}</p></div>
        ${R.ma_th === xem.ma ? '<button class="nut chinh" data-act="tien">Tiếp: sinh viên ›</button>'
          : `<button class="nut chinh" data-act="chon_th" data-ma="${xem.ma}">Chọn tình huống này</button>`}</div>
      ${veThamKhao(xem, UI.tab_xem, 'tab_xem')}</section>` : ''}`;
}

// Bước 2: thông tin
function o(path, nhan, gt, x = {}) {
  return `<label class="truong"><span>${nhan}${x.bb ? ' <i>*</i>' : ''}</span><input data-f="${path}" value="${esc(gt ?? '')}" aria-label="${esc(nhan)}"
    type="${x.type || 'text'}" ${x.list ? `list="${x.list}"` : ''} ${x.ph ? `placeholder="${esc(x.ph)}"` : ''}
    autocapitalize="${x.cap || 'sentences'}" autocomplete="off" ${x.im ? `inputmode="${x.im}"` : ''} ${x.min != null ? `min="${x.min}"` : ''}></label>`;
}
function dsGoiY(id, a) {
  return `<datalist id="${id}">${[...new Set(a.filter(Boolean))].map(x => `<option value="${esc(x)}"></option>`).join('')}</datalist>`;
}
function veB2() {
  const th = TH[R.ma_th], laSV = R.dong_vai.loai === 'Sinh viên cùng nhóm';
  return `<div class="tieu-de-buoc"><h2>Thông tin lượt chấm</h2><p class="phu">${esc(th.ma)}. ${esc(th.ten)}</p></div>
    <section class="the"><h3>Sinh viên</h3><div class="luoi-form" style="margin-top:10px">
      ${o('sv.mssv', 'MSSV', R.sv.mssv, {bb: 1, list: 'ds-mssv', cap: 'characters'})}
      ${o('sv.ho_ten', 'Họ và tên', R.sv.ho_ten, {bb: 1, list: 'ds-ten', cap: 'words'})}
      ${o('sv.lop', 'Lớp', R.sv.lop, {list: 'ds-lop', cap: 'characters', ph: 'Ví dụ: Y2023B'})}
      ${o('sv.to', 'Tổ', R.sv.to, {list: 'ds-to'})}</div>
      <div id="lich-su-sv">${veLichSuSV()}</div></section>
    <section class="the"><h3>Đợt thực tập</h3><div class="luoi-form" style="margin-top:10px">
      ${o('sv.dot', 'Đợt lâm sàng', R.sv.dot, {list: 'ds-dot', ph: 'Ví dụ: Đợt 1'})}
      ${o('sv.nam_hoc', 'Năm học', R.sv.nam_hoc, {list: 'ds-nam', ph: namHocMacDinh()})}
      ${o('sv.khoa', 'Khoa thực tập', R.sv.khoa, {list: 'ds-khoa'})}
      ${o('ngay', 'Ngày chấm', R.ngay, {type: 'date'})}</div></section>
    <section class="the"><h3>Lượt Mini-CEX tư vấn <i style="color:var(--m0);font-style:normal">*</i></h3>
      <div class="phan-doan" style="margin-top:10px">${LUOT.map(l => `<button data-act="luot" data-v="${l}" aria-pressed="${R.luot === l}">${l === 'bs' ? 'Bổ sung' : 'Lượt ' + l}</button>`).join('')}</div>
      <p class="goi-y" id="goi-y-luot">${goiYLuot()}</p></section>
    <section class="the"><h3>Giảng viên và người đóng vai</h3><div class="luoi-form" style="margin-top:10px">
      ${o('gv', 'Giảng viên chấm', R.gv, {bb: 1, list: 'ds-gv', cap: 'words'})}
      ${o('dia_diem', 'Địa điểm', R.dia_diem, {list: 'ds-dd', ph: 'Ví dụ: phòng giao ban khoa'})}</div>
      <div class="nhan">Người đóng vai <small>(tình huống này: ${esc(th.dong_vai.toLowerCase())})</small></div>
      <div class="phan-doan">${DONG_VAI.map(x => `<button data-act="dong_vai" data-v="${esc(x)}" aria-pressed="${R.dong_vai.loai === x}">${esc(x)}</button>`).join('')}</div>
      <div class="luoi-form" style="margin-top:12px">${o('dong_vai.ho_ten', 'Họ tên người đóng vai', R.dong_vai.ho_ten, {cap: 'words', list: laSV ? 'ds-ten' : ''})}
        ${laSV ? o('dong_vai.mssv', 'MSSV người đóng vai', R.dong_vai.mssv, {cap: 'characters', list: 'ds-mssv'}) : ''}</div>
      ${laSV ? '<p class="nhat">Sinh viên đã đóng vai một tình huống không làm tình huống đó ở lượt sau của mình; app sẽ nhắc khi gặp.</p>' : ''}
    </section>
    ${dsGoiY('ds-mssv', BG.map(r => r.sv.mssv))}${dsGoiY('ds-ten', BG.map(r => r.sv.ho_ten))}
    ${dsGoiY('ds-lop', BG.map(r => r.sv.lop))}${dsGoiY('ds-to', BG.map(r => r.sv.to))}${dsGoiY('ds-dot', BG.map(r => r.sv.dot).concat(['Đợt 1', 'Đợt 2', 'Đợt 3', 'Đợt 4']))}
    ${dsGoiY('ds-nam', [namHocMacDinh(), ...BG.map(r => r.sv.nam_hoc)])}${dsGoiY('ds-khoa', KHOA_TT.concat(BG.map(r => r.sv.khoa)))}
    ${dsGoiY('ds-gv', BG.map(r => r.gv))}${dsGoiY('ds-dd', BG.map(r => r.dia_diem))}`;
}
function veLichSuSV() {
  const ls = lichSuSV(R.sv.mssv, R), th = TH[R.ma_th], dv = daDongVai(R);
  let h = '';
  if (dv.length) h += `<p class="canh-bao do">Sinh viên này đã đóng vai ${esc(th.ma)} ngày ${ngayVN(dv[0].ngay)}: nên chọn tình huống khác.</p>`;
  const trung = ls.filter(x => x.ma_th === R.ma_th);
  if (trung.length) h += `<p class="canh-bao">Sinh viên đã làm ${esc(th.ma)} (${tenLuot(trung[0].luot)}, ${ngayVN(trung[0].ngay)}). Lượt sau nên dùng tình huống khác nhóm chủ đề.</p>`;
  else if (ls.some(x => TH[x.ma_th].nhom === th.nhom)) h += `<p class="canh-bao">Sinh viên đã có lượt cùng nhóm “${esc(th.nhom)}”. Chỉ nên trùng nhóm khi là lượt bổ sung.</p>`;
  if (ls.length) h += `<p class="goi-y"><b>Đã có ${ls.length} lượt trên máy này:</b> ${ls.map(x => `${esc(x.ma_th)} (${esc(tenLuot(x.luot).toLowerCase())}, ${ngayVN(x.ngay)}${x.trang_thai === 'xong' ? ', ' + d10(tong(x)) : ', nháp'})`).join('; ')}</p>`;
  return h;
}
function goiYLuot() {
  const ls = lichSuSV(R.sv.mssv, R).filter(x => x.trang_thai === 'xong');
  if (!R.sv.mssv.trim()) return 'Nhập MSSV để app gợi ý lượt.';
  if (!ls.length) return 'Chưa có lượt nào của sinh viên này trên máy: thường là lượt 1.';
  const can = ls.filter(x => coLoi(x) || nhanDinh(x) === 0);
  return `Đã hoàn tất ${ls.length} lượt: gợi ý lượt ${Math.min(ls.length + 1, 4)}.` +
    (can.length ? ` Có ${can.length} lượt chưa đạt hoặc có lỗi nghiêm trọng: có thể là lượt bổ sung.` : '');
}

// Bước 3: quan sát
function phaDH(ms) {
  const q = DL.quy_tac, p = ms / 60000;
  return p >= q.phut_dung ? 3 : p >= q.phut_muc_tieu ? 2 : p >= q.phut_bao ? 1 : 0;
}
function veB3() {
  const th = TH[R.ma_th], t = tongTC(R), c = soTCChua(R), n = R.then_chot.length, ms = msDongHo(R), q = DL.quy_tac;
  return `<div class="tieu-de-buoc"><h2>Quan sát</h2><p class="phu">Ngồi ngoài tầm nhìn chính, không can thiệp. Đánh dấu điểm then chốt và lỗi nghiêm trọng khi nghe được.</p></div>
    <section class="the dong-ho-the">
      <div class="dh-lon pha-${phaDH(ms)}" id="dh-lon" role="timer">${dinhDangGio(ms)}</div>
      <p class="phu" id="dh-pha">${moTaPha(ms)}</p>
      <div class="hang-nut">${R.dong_ho.bat_dau ? '<button class="nut chinh" data-act="dh_dung">❚❚ Tạm dừng</button>'
        : `<button class="nut chinh" data-act="dh_chay">▶ ${ms ? 'Tiếp tục' : 'Bắt đầu tư vấn'}</button>`}
        <button class="nut vien" data-act="dh_lai" ${ms ? '' : 'disabled'}>Đặt lại</button>
        <button class="nut vien" data-act="doc_sv">Phiếu cho sinh viên đọc (2 phút)</button></div>
      <p class="nhat">Mục tiêu ${q.phut_bao}–${q.phut_muc_tieu} phút · phút ${q.phut_bao} báo còn 2 phút · dừng ở phút ${q.phut_dung}. Màn hình được giữ sáng khi đồng hồ chạy.</p>
    </section>
    <details class="the"><summary>Người đóng vai sẽ hỏi</summary><ul>
      ${th.vai.cau_hoi.map(x => `<li>${esc(x)}</li>`).join('')}<li><b>Thử thách (phút 5–6):</b> ${esc(th.vai.thu_thach)}</li></ul></details>
    <section class="the"><div class="the-dau"><h3>A. Điểm then chốt về nội dung</h3><span class="dem">${soTC(t)}/${n}</span></div>
      <p class="goi-y">Đủ = 1, một phần = 0,5; chấp nhận cách nói tương đương, không cần đúng thứ tự. Tổng từ ${q.then_chot_tot}: lĩnh vực 3 mức Tốt; ${q.then_chot_dat} đến dưới ${q.then_chot_tot}: Đạt; dưới ${q.then_chot_dat}: Chưa đạt.</p>
      <ol class="ds-tc">${th.then_chot.map((x, k) => `<li class="tc ${R.then_chot[k] == null ? '' : 'da-' + R.then_chot[k] * 2}"><p>${esc(x)}</p>
        <div class="phan-doan ba nho">${KQ_TC.map(([v, ten]) => `<button class="tc-${v * 2}" data-act="tc" data-k="${k}" data-v="${v}" aria-pressed="${R.then_chot[k] === v}">${ten}</button>`).join('')}</div></li>`).join('')}</ol>
      ${c && c < n ? `<div class="hang-nut"><button class="nut vien nho" data-act="tc_con_lai">Các mục chưa đánh dấu: Không (${c})</button></div>` : ''}
    </section>
    <section class="the"><h3>C. Lỗi nghiêm trọng</h3>
      <p class="goi-y">Có lỗi: lĩnh vực chứa lỗi chỉ chấm mức Chưa đạt, nhận định chung Chưa đạt, sinh viên làm thêm một lượt cùng nhóm chủ đề.</p>
      ${th.loi.map((x, k) => `<button class="loi-hang" data-act="loi" data-k="${k}" aria-pressed="${!!R.loi[k]}"><span class="hop"></span>
        <span>${esc(x)}<small>Thuộc lĩnh vực ${th.loi_lv[k]}: ${esc(DL.linh_vuc[th.loi_lv[k] - 1].ten_ngan)}</small></span></button>`).join('')}
    </section>
    <section class="the"><h3>Ghi chú nhanh</h3>
      <div class="chips"><button class="chip" data-act="chen" data-v="moc">+ Mốc thời gian</button>
        <button class="chip" data-act="chen" data-v="Làm tốt: ">+ Làm tốt</button>
        <button class="chip" data-act="chen" data-v="Cần cải thiện: ">+ Cần cải thiện</button></div>
      <label class="truong"><span class="an">Ghi chú</span><textarea id="ghi-chu" data-f="ghi_chu" rows="5"
        placeholder="Ghi câu nói, hành vi cụ thể. Dòng bắt đầu bằng “Làm tốt:” hoặc “Cần cải thiện:” sẽ hiện thành gợi ý ở bước phản hồi.">${esc(R.ghi_chu)}</textarea></label>
    </section>`;
}
function moTaPha(ms) {
  const q = DL.quy_tac, p = phaDH(ms);
  if (!ms) return 'Bấm “Bắt đầu tư vấn” khi sinh viên vào phòng.';
  if (!R.dong_ho.bat_dau) return 'Đồng hồ đang dừng.';
  return ['Đang trong thời gian tư vấn.', 'Còn 2 phút: báo sinh viên.', `Đã đủ ${q.phut_muc_tieu} phút.`, `Đã đến phút ${q.phut_dung}: dừng lượt.`][p];
}

// Bước 4: chấm điểm
function veLV(i) {
  const lv = DL.linh_vuc[i], d = R.diem[i], cp = mucChoPhep(R, i), mDiem = mucTheoDiem(i, d);
  const mHien = UI.mo_muc[i] ?? mDiem ?? (cp.length === 1 ? cp[0] : null);
  const goiY = i === 2 ? goiYNoiDung(R) : null, loi = loiCuaLV(R, i);
  let ghi = '';
  if (i === 2) {
    const c = soTCChua(R);
    ghi += `<p class="goi-y">Điểm then chốt ${soTC(tongTC(R))}/${R.then_chot.length}: mức <b>${DL.nhan_dinh[mucNoiDung(R)]}</b>${c ? ` <span style="color:var(--warn)">(còn ${c} mục chưa đánh dấu ở bước Quan sát)</span>` : ''}${goiY != null ? `; gợi ý ${goiY} điểm (ô viền đứt).` : '.'}</p>`;
  }
  if (loi.length) ghi += `<p class="canh-bao do">Có lỗi nghiêm trọng thuộc lĩnh vực này: chỉ chấm mức Chưa đạt.</p>`;
  if (d != null && !diemHopLe(R, i)) ghi += `<p class="canh-bao">Điểm ${d} không còn thuộc mức cho phép: chọn lại.</p>`;
  const khoangTxt = m => (m.tu === m.den ? `${m.tu}` : `${m.tu}–${m.den}`);
  return `<section class="the" id="lv-${i}">
    <div class="lv-dau"><h3>${i + 1}. ${esc(lv.ten)}</h3><span class="diem-lv ${diemHopLe(R, i) ? 'm-' + mDiem : ''}">${d ?? '–'}<small>/${lv.toi_da}</small></span></div>
    ${ghi}
    <div class="ds-muc">${lv.muc.map((m, k) => {
      const chon = mHien === k, khoa = !cp.includes(k);
      const vals = Array.from({length: m.den - m.tu + 1}, (_, j) => m.tu + j);
      return `<div class="muc-khoi m-${k} ${chon ? 'chon' : ''} ${khoa ? 'khoa' : ''} ${mHien != null && !chon ? 'gon' : ''}">
        <button data-act="muc" data-lv="${i}" data-m="${k}" ${khoa ? 'disabled' : ''} aria-expanded="${chon}">
          <span class="muc-ten"><span>${m.ten}</span><span>${khoangTxt(m)}</span></span><span class="muc-mt">${esc(m.mo_ta)}</span></button>
        ${chon && !khoa ? `<div class="chips-diem" role="group" aria-label="Điểm mức ${m.ten}">${vals.map(v => `<button class="chip-diem ${v === goiY ? 'goi-y' : ''}"
          data-act="diem" data-lv="${i}" data-v="${v}" aria-pressed="${d === v}">${v}</button>`).join('')}</div>` : ''}</div>`;
    }).join('')}</div></section>`;
}
function nhacDongHo() {
  return R.dong_ho.bat_dau ? `<p class="canh-bao">Đồng hồ quan sát vẫn đang chạy. <button class="lien-ket" data-act="dh_dung">Dừng đồng hồ</button> khi sinh viên kết thúc tư vấn.</p>` : '';
}
function veB4() {
  const t = tong(R), du = duDiem(R), g = du ? nhanDinhGoiY(R) : null, nd = nhanDinh(R), loi = coLoi(R), q = DL.quy_tac;
  const daCham = R.diem.filter((_, i) => diemHopLe(R, i)).length;
  return `<div class="tieu-de-buoc"><h2>Chấm điểm</h2><p class="phu">Chọn mức theo hành vi quan sát được, rồi chọn điểm trong khoảng của mức. Ghi ví dụ cụ thể vào phần phản hồi.</p></div>
    ${nhacDongHo()}
    ${DL.linh_vuc.map((_, i) => veLV(i)).join('')}
    <section class="the tong-the"><div><small class="phu">Tổng điểm (${daCham}/${DL.linh_vuc.length} lĩnh vực)</small><div class="tong-so">${t}/100</div></div>
      <div style="text-align:right"><small class="phu">Điểm lượt (thang 10)</small><div class="tong-so">${d10(t)}</div></div></section>
    <section class="the" id="nhan-dinh"><h3>D. Nhận định chung</h3>
      ${du ? `<p class="goi-y">${loi ? 'Có lỗi nghiêm trọng: nhận định chung là Chưa đạt.'
        : `Gợi ý theo tổng điểm: <b>${DL.nhan_dinh[g]}</b> (dưới ${q.nhan_dinh_dat}: Chưa đạt; ${q.nhan_dinh_dat}–${q.nhan_dinh_tot - 1}: Đạt; từ ${q.nhan_dinh_tot}: Tốt). Có thể chọn khác một mức nếu ghi lý do.`}</p>
      <div class="phan-doan ba">${DL.nhan_dinh.map((x, k) => `<button data-act="nhan_dinh" data-v="${k}" aria-pressed="${nd === k}"
        ${loi ? (k ? 'disabled' : '') : Math.abs(k - g) > 1 ? 'disabled' : ''}>${x}</button>`).join('')}</div>
      ${canLyDo(R) ? `<label class="truong" style="margin-top:12px"><span>Lý do chọn khác gợi ý <i>*</i></span>
        <textarea data-f="ly_do_nhan_dinh" rows="2">${esc(R.ly_do_nhan_dinh)}</textarea></label>` : ''}`
      : '<p class="goi-y">Chấm đủ 7 lĩnh vực để có nhận định chung.</p>'}
    </section>
    <section class="the"><h3>Mức giám sát khi tư vấn người bệnh thật</h3>
      <p class="goi-y">Sinh viên được tư vấn nội dung này cho người bệnh thật ở mức nào; ghi vào portfolio phần “Tư vấn có giám sát”.</p>
      ${DL.muc_giam_sat.map((m, k) => `<button class="lua-chon" data-act="giam_sat" data-v="${k}" aria-pressed="${R.giam_sat === k}">
        <span class="tron"></span><span>${esc(m.ten)}${nd === k ? '<span class="nhan-goi-y">thường đi cùng nhận định hiện tại</span>' : ''}</span></button>`).join('')}
    </section>`;
}

// Bước 5: phản hồi, PDF
function goiYPhanHoi(k) {
  const dong = tienTo => R.ghi_chu.split('\n').map(x => x.replace(/^\[\d\d:\d\d\]\s*/, '').trim())
    .filter(x => chuanTim(x).startsWith(chuanTim(tienTo))).map(x => x.slice(tienTo.length).trim()).filter(Boolean);
  let a = [];
  if (k === 'lam_tot') a = dong('Làm tốt:').map(x => [x, x]);
  if (k === 'cai_thien') {
    a = dong('Cần cải thiện:').map(x => [x, x]);
    const thap = R.diem.map((d, i) => [i, d == null ? 1 : d / DL.linh_vuc[i].toi_da]).filter(([, r]) => r < 0.8)
      .sort((x, y) => x[1] - y[1]).slice(0, 2);
    for (const [i] of thap) {
      const lv = DL.linh_vuc[i];
      a.push([`Lĩnh vực ${i + 1}: ${lv.ten_ngan.toLowerCase()}`, `${lv.ten_ngan}: ${lv.muc[2].mo_ta}`]);
    }
  }
  return a.length ? `<div class="chips">${a.map(([nhan, gt]) => `<button class="chip chen" data-act="chen_ph" data-k="${k}" data-v="${esc(gt)}">+ ${esc(nhan.length > 70 ? nhan.slice(0, 68) + '…' : nhan)}</button>`).join('')}</div>` : '';
}
function veTomTat() {
  const t = tong(R), nd = nhanDinh(R), gs = R.giam_sat;
  return `<div class="o-kq"><small>Tổng điểm</small><b>${t}</b>/100</div>
    <div class="o-kq"><small>Điểm lượt</small><b>${d10(t)}</b>/10</div>
    <div class="o-kq"><small>Nhận định chung</small><b class="${nd != null ? 'nd-' + nd : ''}" style="background:none">${nd != null ? DL.nhan_dinh[nd] : '—'}</b></div>
    <div class="o-kq"><small>Lỗi nghiêm trọng</small><b>${coLoi(R) ? 'Có' : 'Không'}</b></div>
    <div class="o-kq rong2"><small>Điểm then chốt</small>${soTC(tongTC(R))}/${R.then_chot.length}</div>
    <div class="o-kq rong2"><small>Mức giám sát đề nghị</small>${gs != null ? esc(DL.muc_giam_sat[gs].ngan) : '—'}</div>`;
}
function veKhoiHoanTat() {
  const t = thieu(R);
  return `${t.length ? `<div class="thieu"><b>Còn thiếu:</b><ul>${t.map(([b, x]) => `<li><button class="lien-ket" data-act="buoc" data-b="${b}">${esc(x)}</button> <small>(bước ${b})</small></li>`).join('')}</ul></div>` : ''}
    <div class="hang-nut"><button class="nut chinh lon" data-act="hoan_tat" ${t.length ? 'disabled' : ''}>${R.trang_thai === 'xong' ? 'Lưu và tạo lại PDF' : 'Hoàn tất và tạo PDF'}</button></div>
    <div id="ket-qua-pdf">${vePdfSan()}</div>`;
}
function vePdfSan() {
  if (!UI.pdf || UI.pdf.id !== R.id) return '';
  const p = UI.pdf, coChiaSe = !!(navigator.canShare && navigator.canShare({files: [p.tep]}));
  return `<div class="pdf-san"><p>Đã tạo <b>${esc(p.ten)}</b> (${Math.round(p.tep.size / 1024)} KB).</p>
    <div class="hang-nut"><button class="nut chinh" data-act="pdf_tai">Tải PDF</button>
      ${coChiaSe ? '<button class="nut vien" data-act="pdf_chia_se">Gửi qua Zalo, email…</button>' : ''}
      <button class="nut vien" data-act="pdf_xem">Mở xem</button></div></div>`;
}
function veKy(ai, nhan) {
  return `<div><div class="ky-dau"><b>${nhan}</b><button class="nut vien nho" data-act="xoa_ky" data-ai="${ai}">Ký lại</button></div>
    <canvas class="ky-o" data-ky="${ai}" width="900" height="300" aria-label="Ô ký: ${nhan}"></canvas></div>`;
}
function veB5() {
  return `<div class="tieu-de-buoc"><h2>Phản hồi và phiếu PDF</h2><p class="phu">Khoảng 5 phút theo mô hình hỏi – nói – hỏi: hỏi sinh viên, nghe người đóng vai, giảng viên nói hai điểm làm tốt và một đến hai điểm cần cải thiện, hỏi kế hoạch.</p></div>
    ${nhacDongHo()}
    <section class="the tom-tat">${veTomTat()}</section>
    <section class="the"><h3>E. Phản hồi</h3><div style="margin-top:10px">
      ${PH.map(([k, ten, ph, bb]) => `<label class="truong"><span>${ten}${bb ? ' <i>*</i>' : ''}</span>${goiYPhanHoi(k)}
        <textarea data-f="phan_hoi.${k}" rows="3" placeholder="${esc(ph)}">${esc(R.phan_hoi[k])}</textarea></label>`).join('')}</div></section>
    <section class="the"><h3>Thời gian và chữ ký</h3><div class="luoi-form" style="margin-top:10px">
      ${o('phut_quan_sat', 'Quan sát (phút)', phutQS(R), {type: 'number', im: 'numeric', min: 0})}
      ${o('phut_phan_hoi', 'Phản hồi (phút)', R.phut_phan_hoi, {type: 'number', im: 'numeric', min: 0})}</div>
      <div class="luoi-ky">${veKy('gv', 'Giảng viên ký')}${veKy('sv', 'Sinh viên ký (đã nhận phản hồi)')}</div>
      <p class="nhat">Chữ ký không bắt buộc; ký bằng ngón tay hoặc bút cảm ứng.</p></section>
    <section class="the"><h3>Phiếu PDF</h3>
      <label class="kiem"><input type="checkbox" data-f="pdf.diem_day" ${R.pdf.diem_day ? 'checked' : ''}> Kèm điểm dạy và tài liệu của tình huống</label>
      <label class="kiem"><input type="checkbox" data-f="pdf.ghi_chu" ${R.pdf.ghi_chu ? 'checked' : ''}> Kèm ghi chú quan sát của giảng viên</label>
      <div id="khoi-hoan-tat">${veKhoiHoanTat()}</div></section>
    <div class="hang-nut"><button class="nut vien" data-act="tiep_sv">Chấm sinh viên tiếp theo (giữ tình huống, đợt, giảng viên)</button></div>`;
}

// ============================================================ sau khi vẽ: ô ký
function sauKhiVe() {
  document.querySelectorAll('canvas[data-ky]').forEach(ganOKy);
  if (UI.man === 'dang_nhap') $('#mk')?.focus();
}
function ganOKy(cv) {
  const ai = cv.dataset.ky, ctx = cv.getContext('2d');
  ctx.lineWidth = 5;
  ctx.lineCap = ctx.lineJoin = 'round';
  ctx.strokeStyle = '#0b2a6b';
  if (R.chu_ky[ai]) {
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, cv.width, cv.height);
    img.src = R.chu_ky[ai];
  }
  let dangVe = false, coNet = false;
  const diem = e => { const b = cv.getBoundingClientRect(); return [(e.clientX - b.left) * cv.width / b.width, (e.clientY - b.top) * cv.height / b.height]; };
  cv.addEventListener('pointerdown', e => { dangVe = true; coNet = false; cv.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(...diem(e)); });
  cv.addEventListener('pointermove', e => { if (!dangVe) return; coNet = true; ctx.lineTo(...diem(e)); ctx.stroke(); });
  const xong = () => {
    if (!dangVe) return;
    dangVe = false;
    if (coNet) { R.chu_ky[ai] = cv.toDataURL('image/png'); daSua(); }
  };
  cv.addEventListener('pointerup', xong);
  cv.addEventListener('pointercancel', xong);
}

// ============================================================ lớp phủ
function moLopPhu(html, lop = '') {
  $('#lop-phu').innerHTML = `<div class="lp-nen" data-act="dong_lp"></div><div class="lp-hop ${lop}" role="dialog" aria-modal="true">${html}</div>`;
  $('#lop-phu').querySelector('button, input, textarea')?.focus();
}
function dongLopPhu() {
  $('#lop-phu').innerHTML = '';
  UI.doc_bat_dau = null;
}
function hoi(tieuDe, noiDung, nutCo = 'Đồng ý', nguy = false) {
  return new Promise(ok => {
    moLopPhu(`<h3>${esc(tieuDe)}</h3><p>${noiDung}</p><div class="hang-nut" style="justify-content:flex-end">
      <button class="nut vien" data-hoi="0">Hủy</button><button class="nut ${nguy ? 'chinh nguy' : 'chinh'}" data-hoi="1"
      ${nguy ? 'style="background:var(--m0);color:#fff"' : ''}>${esc(nutCo)}</button></div>`);
    $('#lop-phu').querySelectorAll('[data-hoi]').forEach(b => b.addEventListener('click', () => { dongLopPhu(); ok(b.dataset.hoi === '1'); }));
    $('#lop-phu .lp-nen').addEventListener('click', () => ok(false), {once: true});
  });
}
function moCaiDat() {
  const m = docMacDinh();
  moLopPhu(`<div class="lp-dau"><h3>Cài đặt</h3><button class="nut vien nho" data-act="dong_lp">Đóng</button></div>
    <label class="truong"><span>Tên giảng viên chấm (điền sẵn cho lượt mới)</span><input id="cd-gv" value="${esc(m.gv || '')}" autocapitalize="words"></label>
    <div class="hang-nut"><button class="nut chinh" data-act="luu_cai_dat">Lưu</button></div>
    <h4 style="margin-top:20px">Dữ liệu trên máy này</h4>
    <p class="phu">${BG.length} bản ghi. Bản ghi chấm chỉ nằm trên trình duyệt này; xóa dữ liệu trình duyệt sẽ mất. Sao lưu JSON định kỳ hoặc lưu PDF từng lượt.</p>
    <div class="hang-nut"><button class="nut vien" data-act="quen_khoa">Bỏ ghi nhớ mật khẩu</button>
      <button class="nut vien nguy" data-act="xoa_tat_ca">Xóa toàn bộ bản ghi</button></div>
    <h4 style="margin-top:20px">Giới thiệu</h4>
    <p class="nhat">${esc(DL.ten_bo)}. Dữ liệu phiên bản ${esc(GOI.phien_ban)} (dấu ${esc(GOI.dau)}). Thang 7 lĩnh vực, 100 điểm; ${DL.tinh_huong.length} tình huống. Biên soạn: ${esc(DL.nguoi_bien_soan)}, với sự hỗ trợ của Claude (Anthropic); cần Tổ bộ môn thẩm định trước khi dùng chính thức.</p>`);
}
function moDocSV() {
  const th = TH[R.ma_th];
  UI.doc_bat_dau = Date.now();
  moLopPhu(`<div class="lp-dau"><b>${esc(th.ma)}. Phiếu nhiệm vụ</b><span class="doc-dh" id="doc-dh">2:00</span></div>
    <div class="doc-nd">${veNhiemVu(th)}</div>
    <div class="hang-nut" style="justify-content:center"><button class="nut vien lon" data-act="dong_lp">Đóng</button>
      <button class="nut chinh lon" data-act="doc_xong">Bắt đầu tư vấn ▶</button></div>`, 'toan-man doc-sv');
}

// ============================================================ đồng hồ
let khoaMan = null;
async function giuManHinh(bat) {
  try {
    if (bat && 'wakeLock' in navigator && !khoaMan) {
      khoaMan = await navigator.wakeLock.request('screen');
      khoaMan.addEventListener('release', () => { khoaMan = null; });
    } else if (!bat && khoaMan) { await khoaMan.release(); khoaMan = null; }
  } catch { /* không hỗ trợ */ }
}
function chayDH() {
  if (R.dong_ho.bat_dau) return;
  R.dong_ho.bat_dau = Date.now();
  giuManHinh(true);
  daSua();
}
function dungDH() {
  if (!R.dong_ho.bat_dau) return;
  R.dong_ho.tich_luy += Date.now() - R.dong_ho.bat_dau;
  R.dong_ho.bat_dau = null;
  giuManHinh(false);
  daSua();
}
setInterval(() => {
  if (UI.man !== 'cham' || !R) return;
  const ms = msDongHo(R), s = dinhDangGio(ms), p = phaDH(ms);
  const lon = $('#dh-lon'), nho = $('#dh-so'), pha = $('#dh-pha');
  if (lon) { lon.textContent = s; lon.className = `dh-lon pha-${p}`; }
  if (nho) { nho.textContent = s; nho.className = `dh-so pha-${p}`; }
  if (pha) pha.textContent = moTaPha(ms);
  if (R.dong_ho.bat_dau && p > 0 && !UI.da_bao[R.id + p]) {
    UI.da_bao[R.id + p] = true;
    bao(moTaPha(ms), p === 3);
    try { navigator.vibrate?.(p === 3 ? [250, 120, 250] : 300); } catch { /* bỏ qua */ }
  }
  const doc = $('#doc-dh');
  if (doc && UI.doc_bat_dau) {
    const con = Math.max(0, 120000 - (Date.now() - UI.doc_bat_dau));
    const giay = Math.ceil(con / 1000);
    doc.textContent = `${Math.floor(giay / 60)}:${String(giay % 60).padStart(2, '0')}`;
    if (!con) doc.style.color = 'var(--m0)';
  }
}, 250);

// ============================================================ xuất, nhập
function so1(x) { return x == null || x === '' ? '' : String(x).replace('.', ','); }
function csv(hang) {
  return '\ufeff' + hang.map(h => h.map(x => {
    const s = x == null ? '' : String(x);
    return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(';')).join('\r\n');
}
function xuatCSV() {
  const ds = locBG().filter(r => r.trang_thai === 'xong').sort((a, b) => (a.ngay < b.ngay ? -1 : 1));
  if (!ds.length) return bao('Chưa có lượt hoàn tất để xuất.');
  const dau = ['Mã phiếu', 'Ngày', 'Năm học', 'Đợt', 'Lớp', 'Tổ', 'Khoa', 'MSSV', 'Họ tên', 'Lượt', 'Mã TH', 'Tình huống',
    'Nhóm chủ đề', 'Độ khó', 'Giảng viên', 'Người đóng vai', 'Họ tên người đóng vai', 'Điểm then chốt (/7)',
    ...DL.linh_vuc.map((l, i) => `LV${i + 1} ${l.ten_ngan} (/${l.toi_da})`), 'Tổng (/100)', 'Điểm lượt (/10)',
    'Lỗi nghiêm trọng', 'Nhận định chung', 'Lý do nhận định', 'Mức giám sát', 'Phút quan sát', 'Phút phản hồi',
    ...PH.map(p => p[1])];
  const hang = ds.map(r => {
    const th = TH[r.ma_th];
    return [r.id, ngayVN(r.ngay), r.sv.nam_hoc, r.sv.dot, r.sv.lop, r.sv.to, r.sv.khoa, r.sv.mssv, r.sv.ho_ten, tenLuot(r.luot),
      r.ma_th, th.ten, th.nhom, th.do_kho, r.gv, r.dong_vai.loai, r.dong_vai.ho_ten, so1(tongTC(r)), ...r.diem, tong(r),
      d10(tong(r)), r.loi.map((x, k) => (x ? th.loi[k] : '')).filter(Boolean).join(' | '), DL.nhan_dinh[nhanDinh(r)] ?? '',
      r.ly_do_nhan_dinh, r.giam_sat != null ? DL.muc_giam_sat[r.giam_sat].ngan : '', phutQS(r), r.phut_phan_hoi,
      ...PH.map(([k]) => r.phan_hoi[k])];
  });
  const sv = tongHopSV(ds);
  const bangSV = [[], ['TỔNG HỢP THEO SINH VIÊN'], ['MSSV', 'Họ tên', 'Lớp', 'Tổ', 'Đợt', 'Năm học', 'Số lượt', 'Điểm TB (/10)', 'Lượt có lỗi nghiêm trọng', 'Các lượt']]
    .concat(sv.map(s => [s.mssv, s.ho_ten, s.lop, s.to, s.dot, s.nam_hoc, s.so, s.tb.toFixed(2).replace('.', ','), s.loi, s.ds]));
  taiTep(new Blob([csv([dau, ...hang, ...bangSV])], {type: 'text/csv;charset=utf-8'}), `MiniCEX-TuVan_bang-diem_${homNay()}.csv`);
}
function saoLuu() {
  const goi = {loai: 'mcx-y3-sao-luu', phien_ban: 1, xuat_luc: new Date().toISOString(), ban_ghi: BG.filter(r => r.ma_th)};
  taiTep(new Blob([JSON.stringify(goi)], {type: 'application/json'}), `MiniCEX-TuVan_sao-luu_${homNay()}.json`);
}
async function nhapTep(tep) {
  let goi;
  try { goi = JSON.parse(await tep.text()); } catch { return bao('Tệp không đọc được.', true); }
  if (goi?.loai !== 'mcx-y3-sao-luu' || !Array.isArray(goi.ban_ghi)) return bao('Không phải tệp sao lưu của app này.', true);
  let moi = 0, cap = 0, bo = 0;
  for (const x of goi.ban_ghi) {
    if (!x?.id || !TH[x.ma_th]) { bo++; continue; }
    const cu = BG.find(r => r.id === x.id);
    if (cu && cu.sua_luc >= x.sua_luc) continue;
    const r = chuanHoa(x);
    if (cu) { BG[BG.indexOf(cu)] = r; cap++; } else { BG.push(r); moi++; }
    await KHO.luu(r);
  }
  bao(`Đã nhập: ${moi} bản ghi mới, ${cap} bản ghi cập nhật${bo ? `, bỏ qua ${bo}` : ''}.`);
  ve();
}

// ============================================================ PDF
async function taoVaLuuPdf(r) {
  bao('Đang tạo PDF…');
  const tep = await taoPdf(r);
  return {id: r.id, ten: tenPdf(r), tep: new File([tep], tenPdf(r), {type: 'application/pdf'})};
}

// ============================================================ hành động
const HD = {
  dang_xuat: async () => {
    if (!(await hoi('Khóa ứng dụng', 'Khóa lại và bỏ ghi nhớ mật khẩu trên máy này? Bản ghi chấm vẫn được giữ.', 'Khóa'))) return;
    luuNgay();
    ghiLS(LS.khoa, null);
    location.reload();
  },
  cai_dat: moCaiDat,
  luu_cai_dat: () => {
    ghiLS(LS.mac_dinh, {...docMacDinh(), gv: $('#cd-gv').value.trim()});
    dongLopPhu();
    ve();
  },
  quen_khoa: () => { ghiLS(LS.khoa, null); bao('Đã bỏ ghi nhớ; lần sau cần nhập mật khẩu.'); },
  xoa_tat_ca: async () => {
    if (!(await hoi('Xóa toàn bộ bản ghi', `Xóa ${BG.length} bản ghi trên máy này? Không khôi phục được nếu chưa sao lưu.`, 'Xóa hết', true))) return;
    for (const r of BG) await KHO.xoa(r.id);
    BG = [];
    R = null;
    ve();
  },
  dong_lp: dongLopPhu,
  moi: () => batDauMoi(),
  mo_bg: el => moBanGhi(BG.find(r => r.id === el.dataset.id)),
  xoa_bg: async el => {
    const r = BG.find(x => x.id === el.dataset.id);
    if (!(await hoi('Xóa bản ghi', `Xóa lượt chấm của <b>${esc(r.sv.ho_ten || '(chưa nhập tên)')}</b> (${esc(r.ma_th)}, ${ngayVN(r.ngay)})?`, 'Xóa', true))) return;
    await KHO.xoa(r.id);
    BG = BG.filter(x => x !== r);
    ve();
  },
  pdf_bg: async el => {
    const r = BG.find(x => x.id === el.dataset.id);
    try { const p = await taoVaLuuPdf(r); taiTep(p.tep, p.ten); } catch (e) { bao('Không tạo được PDF: ' + e.message, true); }
  },
  tab_chu: el => { UI.tab_chu = el.dataset.v; ve(); },
  xuat_csv: xuatCSV,
  sao_luu: saoLuu,
  nhap: () => $('#tep-nhap').click(),
  ve_chu: () => diToi('chu'),
  buoc: el => diToi('cham', +el.dataset.b, true),
  tien: () => { if (R.ma_th) diToi('cham', Math.min(5, UI.buoc + 1), true); },
  lui: () => diToi('cham', Math.max(1, UI.buoc - 1), true),
  loc_nhom: el => { UI.loc_nhom = el.dataset.v; ve(); },
  xem_b1: el => {
    UI.xem = el.dataset.ma;
    UI.tab_xem = 'sv';
    ve();
    $('#chi-tiet')?.scrollIntoView({behavior: 'smooth', block: 'start'});
  },
  tab_xem: el => { UI.tab_xem = el.dataset.v; ve(); },
  tab_ben: el => { UI.tab_ben = el.dataset.v; ve(); },
  chon_th: async el => {
    const ma = el.dataset.ma;
    if (R.ma_th && R.ma_th !== ma && coDuLieuCham(R) &&
        !(await hoi('Đổi tình huống', 'Phần đã đánh dấu và đã chấm của tình huống cũ sẽ bị xóa. Tiếp tục?', 'Đổi', true))) return;
    datTinhHuong(R, ma);
    R.dong_ho = {bat_dau: null, tich_luy: 0};
    UI.xem = null;
    daSua();
    diToi('cham', 2, true);
  },
  xem_th: () => {
    const th = TH[R.ma_th];
    moLopPhu(`<div class="lp-dau"><b>${esc(th.ma)}. ${esc(th.ten)}</b><button class="nut vien nho" data-act="dong_lp">Đóng</button></div>
      <div id="tk-lp">${veThamKhao(th, UI.tab_ben, 'tab_lp')}</div>`, 'rong');
  },
  tab_lp: el => { UI.tab_ben = el.dataset.v; $('#tk-lp').innerHTML = veThamKhao(TH[R.ma_th], UI.tab_ben, 'tab_lp'); },
  luot: el => { R.luot = el.dataset.v === 'bs' ? 'bs' : +el.dataset.v; daSua(); ve(); },
  dong_vai: el => { R.dong_vai.loai = el.dataset.v; if (R.dong_vai.loai !== 'Sinh viên cùng nhóm') R.dong_vai.mssv = ''; daSua(); ve(); },
  dh_chay: () => { chayDH(); ve(); },
  dh_dung: () => { dungDH(); ve(); },
  dh_bat_tat: () => { R.dong_ho.bat_dau ? dungDH() : chayDH(); ve(); },
  dh_lai: async () => {
    if (!(await hoi('Đặt lại đồng hồ', 'Đưa đồng hồ về 00:00?', 'Đặt lại'))) return;
    R.dong_ho = {bat_dau: null, tich_luy: 0};
    for (const k of Object.keys(UI.da_bao)) if (k.startsWith(R.id)) delete UI.da_bao[k];
    giuManHinh(false);
    daSua();
    ve();
  },
  doc_sv: moDocSV,
  doc_xong: () => { dongLopPhu(); chayDH(); if (UI.buoc !== 3) diToi('cham', 3, true); else ve(); },
  tc: el => {
    const k = +el.dataset.k, v = +el.dataset.v;
    R.then_chot[k] = R.then_chot[k] === v ? null : v;
    daSua();
    ve();
  },
  tc_con_lai: () => { R.then_chot = R.then_chot.map(x => x ?? 0); daSua(); ve(); },
  loi: el => { const k = +el.dataset.k; R.loi[k] = !R.loi[k]; daSua(); ve(); },
  chen: el => {
    const ta = $('#ghi-chu'), v = el.dataset.v === 'moc' ? `[${dinhDangGio(msDongHo(R))}] ` : el.dataset.v;
    const vt = ta.selectionStart ?? ta.value.length, truoc = ta.value.slice(0, vt), sau = ta.value.slice(vt);
    const chen = (truoc && !truoc.endsWith('\n') ? '\n' : '') + v;
    ta.value = truoc + chen + sau;
    R.ghi_chu = ta.value;
    daSua();
    ta.focus();
    ta.selectionStart = ta.selectionEnd = vt + chen.length;
  },
  muc: el => {
    const i = +el.dataset.lv, m = +el.dataset.m, lv = DL.linh_vuc[i].muc[m];
    UI.mo_muc[i] = m;
    if (lv.tu === lv.den) R.diem[i] = lv.tu;
    else if (R.diem[i] != null && mucTheoDiem(i, R.diem[i]) !== m) R.diem[i] = null;
    daSua();
    ve();
  },
  diem: el => {
    const i = +el.dataset.lv;
    R.diem[i] = +el.dataset.v;
    delete UI.mo_muc[i];
    daSua();
    ve();
  },
  nhan_dinh: el => {
    const v = +el.dataset.v;
    R.nhan_dinh = v === nhanDinhGoiY(R) ? null : v;
    daSua();
    ve();
  },
  giam_sat: el => { R.giam_sat = +el.dataset.v; daSua(); ve(); },
  chen_ph: el => {
    const k = el.dataset.k, ta = document.querySelector(`[data-f="phan_hoi.${k}"]`);
    R.phan_hoi[k] = (R.phan_hoi[k].trim() ? R.phan_hoi[k].replace(/\s*$/, '') + '\n' : '') + el.dataset.v;
    ta.value = R.phan_hoi[k];
    daSua();
    $('#khoi-hoan-tat').innerHTML = veKhoiHoanTat();
  },
  xoa_ky: el => {
    const ai = el.dataset.ai, cv = document.querySelector(`canvas[data-ky="${ai}"]`);
    cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
    R.chu_ky[ai] = null;
    daSua();
  },
  hoan_tat: async el => {
    if (thieu(R).length) return;
    if (R.dong_ho.bat_dau) dungDH();
    if (R.phut_quan_sat == null) R.phut_quan_sat = phutQS(R);
    R.trang_thai = 'xong';
    R.hoan_tat_luc = R.hoan_tat_luc || new Date().toISOString();
    daSua();
    luuNgay();
    el.disabled = true;
    el.textContent = 'Đang tạo PDF…';
    try {
      UI.pdf = await taoVaLuuPdf(R);
      bao('Đã lưu lượt chấm và tạo PDF.');
    } catch (e) {
      bao('Không tạo được PDF: ' + e.message, true);
    }
    ve();
    $('#ket-qua-pdf')?.scrollIntoView({behavior: 'smooth', block: 'center'});
  },
  pdf_tai: () => taiTep(UI.pdf.tep, UI.pdf.ten),
  pdf_chia_se: async () => {
    const th = TH[R.ma_th];
    try {
      await navigator.share({files: [UI.pdf.tep], title: UI.pdf.ten,
                             text: `Phiếu Mini-CEX tư vấn ${th.ma} – ${R.sv.ho_ten} (${tenLuot(R.luot).toLowerCase()}, ${ngayVN(R.ngay)})`});
    } catch (e) { if (e.name !== 'AbortError') bao('Không chia sẻ được; hãy tải PDF rồi gửi.', true); }
  },
  pdf_xem: () => {
    const u = URL.createObjectURL(UI.pdf.tep);
    if (!window.open(u, '_blank')) taiTep(UI.pdf.tep, UI.pdf.ten);
    setTimeout(() => URL.revokeObjectURL(u), 60000);
  },
  tiep_sv: async () => {
    if (R.trang_thai !== 'xong' && coDuLieuCham(R) &&
        !(await hoi('Chấm sinh viên tiếp theo', 'Lượt hiện tại chưa hoàn tất; bản nháp vẫn được giữ trong danh sách. Tiếp tục?', 'Tiếp tục'))) return;
    luuNgay();
    batDauMoi(R);
  },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = HD[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, e); }
});
document.addEventListener('submit', e => {
  if (e.target.dataset.form === 'dang_nhap') { e.preventDefault(); dangNhap(e.target); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#lop-phu').innerHTML) dongLopPhu();
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.tim) {
    UI.tim = el.value;
    $('#ds-chu').innerHTML = UI.tab_chu === 'luot'
      ? veDsLuot(locBG().filter(r => r.trang_thai === 'xong').sort((a, b) => (a.ngay + a.sua_luc < b.ngay + b.sua_luc ? 1 : -1)))
      : veDsSV(tongHopSV(locBG()));
    return;
  }
  const p = el.dataset.f;
  if (!p || !R) return;
  let v = el.type === 'checkbox' ? el.checked : el.value;
  if (el.type === 'number') v = v === '' ? null : Math.max(0, parseInt(v, 10) || 0);
  datDuong(R, p, v);
  daSua();
  if (['gv', 'sv.lop', 'sv.to', 'sv.dot', 'sv.nam_hoc', 'sv.khoa', 'dia_diem'].includes(p)) luuMacDinh();
  if (p === 'sv.mssv' || p === 'sv.ho_ten') {
    $('#lich-su-sv').innerHTML = veLichSuSV();
    $('#goi-y-luot').innerHTML = goiYLuot();
    $('#dau-ten').textContent = `${R.ma_th}${R.sv.ho_ten ? ' · ' + R.sv.ho_ten : ''}`;
  }
  if (p === 'ly_do_nhan_dinh' || p.startsWith('phan_hoi.')) { if ($('#khoi-hoan-tat')) $('#khoi-hoan-tat').innerHTML = veKhoiHoanTat(); }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.loc) { UI[el.dataset.loc] = el.value; ve(); return; }
  if (el.id === 'tep-nhap' && el.files[0]) { nhapTep(el.files[0]); el.value = ''; return; }
  // Chọn MSSV hoặc tên đã có: điền phần còn lại từ lượt gần nhất của sinh viên đó.
  if (R && (el.dataset.f === 'sv.mssv' || el.dataset.f === 'sv.ho_ten')) {
    const theoMa = el.dataset.f === 'sv.mssv';
    const cu = BG.filter(x => x !== R && x.ma_th && (theoMa ? chuanMSSV(x.sv.mssv) === chuanMSSV(el.value)
      : chuanTim(x.sv.ho_ten) === chuanTim(el.value))).sort((a, b) => (a.sua_luc < b.sua_luc ? 1 : -1))[0];
    if (!cu || !el.value.trim()) return;
    let doi = false;
    for (const k of ['ho_ten', 'mssv', 'lop', 'to']) if (!R.sv[k].trim() && cu.sv[k]) { R.sv[k] = cu.sv[k]; doi = true; }
    if (!R.luot) {
      const n = lichSuSV(R.sv.mssv, R).filter(x => x.trang_thai === 'xong').length;
      R.luot = Math.min(n + 1, 4);
      doi = true;
    }
    if (doi) { daSua(); ve(); }
  }
});

document.addEventListener('DOMContentLoaded', khoiDong);
