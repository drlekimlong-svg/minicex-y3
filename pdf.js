'use strict';
// Phiếu chấm PDF dựng bằng pdfmake 0.2 (font Roboto có đủ dấu tiếng Việt). Thư viện chỉ tải lần đầu xuất PDF.
// Tiêu đề, thang, mức giám sát lấy theo loại Mini-CEX của tình huống (LO(r)).
// Font không có ký hiệu ☐ ✓ →: dùng ● ○ và chữ.

const XAM = '#56605f', VIEN = '#c3cecd', NEN = '#e9f2f1', XANH = '#0f5f5a';
const MAU_MUC = ['#b42318', '#1d5fb4', '#18794e'];
const LUOI = {
  hLineWidth: () => 0.6, vLineWidth: () => 0.6, hLineColor: () => VIEN, vLineColor: () => VIEN,
  paddingLeft: () => 5, paddingRight: () => 5, paddingTop: () => 3, paddingBottom: () => 3,
};

let _napPdf = null;
function napScript(src) {
  return new Promise((ok, loi) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = ok;
    s.onerror = () => loi(new Error('không tải được ' + src));
    document.head.appendChild(s);
  });
}
function napPdfMake() {
  if (!_napPdf) {
    _napPdf = (async () => {
      if (!window.pdfMake) await napScript('vendor/pdfmake.min.js');
      if (!window.pdfMake.vfs || !window.pdfMake.vfs['Roboto-Regular.ttf']) await napScript('vendor/vfs_fonts.js');
    })().catch(e => { _napPdf = null; throw e; });
  }
  return _napPdf;
}

function tenPdf(r) {
  const s = x => khongDau(x).trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `MiniCEX-${LO(r).tep}_${r.ma_th}_${s(r.sv.mssv)}_${s(r.sv.ho_ten)}_${r.luot === 'bs' ? 'LBS' : 'L' + r.luot}_${r.ngay}.pdf`;
}

async function taoPdf(r) {
  await napPdfMake();
  const dd = dinhNghiaPdf(r);
  return new Promise((ok, loi) => {
    try { window.pdfMake.createPdf(dd).getBlob(ok); } catch (e) { loi(e); }
  });
}

function dinhNghiaPdf(r) {
  const th = TH[r.ma_th], L = LO(r), lv = L.linh_vuc, n = th.then_chot.length;
  const T = tong(r), nd = nhanDinh(r), g = nhanDinhGoiY(r), gs = r.giam_sat, loi = coLoi(r), q = L.quy_tac;
  const bay = new Date();
  const xuat = `${String(bay.getHours()).padStart(2, '0')}:${String(bay.getMinutes()).padStart(2, '0')} ${ngayVN(homNay())}`;
  const [yy, mm, dd] = r.ngay.split('-');
  const dau = t => ({text: t, bold: true, fillColor: NEN, fontSize: 8.8});
  const o = (nhan, gt) => [{text: nhan, color: XAM, fontSize: 8.8}, {text: gt || '—', bold: true}];
  const kq = ['Đủ', 'Một phần', 'Không'];
  const khoangTxt = m => (m.tu === m.den ? `${m.tu}` : `${m.tu}–${m.den}`);
  const dongVai = [r.dong_vai.loai, r.dong_vai.ho_ten].filter(Boolean).join(': ');
  const ky = (nhan, anh, ten) => ({stack: [
    {text: nhan, bold: true, alignment: 'center'},
    anh ? {image: anh, width: 150, alignment: 'center', margin: [0, 2, 0, 2]} : {text: ' ', margin: [0, 34, 0, 0]},
    {text: ten || '', alignment: 'center'},
  ]});

  const noiDung = [
    {text: `${DL.truong}  |  ${DL.bo_mon}`, alignment: 'center', fontSize: 8.5, color: XAM},
    {text: L.tieu_de_pdf, fontSize: 14, bold: true, alignment: 'center', color: XANH, margin: [0, 6, 0, 2]},
    {text: `${th.ma}. ${th.ten}`, alignment: 'center', bold: true, fontSize: 10.5},
    {text: `Nhóm chủ đề: ${th.nhom}  ·  Độ khó: ${th.do_kho.toLowerCase()}  ·  ${th.clo}`, alignment: 'center', fontSize: 8.5,
     color: XAM, margin: [0, 1, 0, 8]},
    {table: {widths: [80, '*', 80, '*'], body: [
      [...o('Sinh viên', r.sv.ho_ten), ...o('MSSV', r.sv.mssv)],
      [...o('Lớp', r.sv.lop), ...o('Tổ', r.sv.to)],
      [...o('Đợt lâm sàng', r.sv.dot), ...o('Năm học', r.sv.nam_hoc)],
      [...o('Khoa thực tập', r.sv.khoa), ...o('Ngày chấm', ngayVN(r.ngay))],
      [...o(L.ten_lan, tenLuot(r.luot)), ...o('Địa điểm', r.dia_diem)],
      [...o('Giảng viên chấm', r.gv), ...o(L.doi_tuong.nhan, dongVai)],
      ...(r.nguoi_benh ? [[{text: 'Người bệnh', color: XAM, fontSize: 8.8}, {text: r.nguoi_benh, bold: true, colSpan: 3}, {}, {}]] : []),
    ]}, layout: LUOI},

    {table: {widths: ['*', '*', '*'], body: [[
      {stack: [{text: 'TỔNG ĐIỂM', fontSize: 7.5, bold: true, color: XAM},
               {text: [{text: String(T), fontSize: 17, bold: true}, ' /100'], margin: [0, 2, 0, 0]},
               {text: `Điểm lượt (thang 10): ${d10(T)}`, bold: true}]},
      {stack: [{text: 'NHẬN ĐỊNH CHUNG', fontSize: 7.5, bold: true, color: XAM},
               {text: DL.nhan_dinh[nd], fontSize: 15, bold: true, color: MAU_MUC[nd], margin: [0, 2, 0, 1]},
               {text: loi ? 'Có lỗi nghiêm trọng: làm thêm một lượt cùng nhóm chủ đề.' : 'Không có lỗi nghiêm trọng.',
                fontSize: 8.5, color: loi ? MAU_MUC[0] : XAM}]},
      {stack: [{text: 'MỨC GIÁM SÁT ĐỀ NGHỊ', fontSize: 7.5, bold: true, color: XAM},
               {text: L.muc_giam_sat[gs].ten, bold: true, margin: [0, 3, 0, 0]}]},
    ]]}, layout: {...LUOI, fillColor: () => NEN, paddingTop: () => 6, paddingBottom: () => 6, paddingLeft: () => 8},
     margin: [0, 8, 0, 0]},

    {text: `A. ${L.nhan_then_chot}`, style: 'muc'},
    {table: {headerRows: 1, widths: [16, '*', 54], body: [
      [dau('TT'), dau('Nội dung'), dau('Kết quả')],
      ...th.then_chot.map((x, k) => [{text: String(k + 1), alignment: 'center'}, {text: x, fontSize: 8.6},
        {text: r.then_chot[k] == null ? '—' : kq[[1, 0.5, 0].indexOf(r.then_chot[k])], alignment: 'center', bold: true}]),
      [{text: [{text: `Tổng ${soTC(tongTC(r))}/${n}: lĩnh vực ${q.lv_then_chot + 1} ở mức ${DL.nhan_dinh[mucNoiDung(r)]}. `, bold: true},
               {text: `Đủ = 1, một phần = 0,5; từ ${q.then_chot_tot}: Tốt; ${q.then_chot_dat} đến dưới ${q.then_chot_tot}: Đạt; dưới ${q.then_chot_dat}: Chưa đạt.`,
                color: XAM}], colSpan: 3, fontSize: 8.5}, {}, {}],
    ]}, layout: LUOI},

    {text: 'B. Thang đánh giá', style: 'muc'},
    {table: {headerRows: 1, widths: [122, '*', 42], body: [
      [dau('Lĩnh vực'), dau('Mức đạt được và mô tả của mức'), dau('Điểm')],
      ...lv.map((l, i) => {
        const d = r.diem[i], m = mucTheoDiem(r, i, d), coLoiLV = loiCuaLV(r, i).length > 0;
        return [{text: `${i + 1}. ${l.ten}`, bold: true, fontSize: 8.8},
          {stack: [{text: `${l.muc[m].ten} (${khoangTxt(l.muc[m])})${coLoiLV ? ' – có lỗi nghiêm trọng' : ''}`, bold: true, color: MAU_MUC[m]},
                   {text: l.muc[m].mo_ta, fontSize: 8.2}]},
          {text: `${d}/${l.toi_da}`, alignment: 'center', bold: true}];
      }),
      [{text: 'Tổng', bold: true}, {text: `Điểm lượt (thang 10) = tổng / 10 = ${d10(T)}`, color: XAM},
       {text: `${T}/100`, alignment: 'center', bold: true}],
    ]}, layout: LUOI},

    {text: 'C. Lỗi nghiêm trọng', style: 'muc'},
    ...th.loi.map((x, k) => ({text: [
      {text: r.loi[k] ? '●  Có: ' : '○  Không: ', bold: r.loi[k], color: r.loi[k] ? MAU_MUC[0] : XAM}, x,
      {text: `  (lĩnh vực ${th.loi_lv[k]})`, color: XAM, fontSize: 8}], margin: [0, 1, 0, 1]})),

    {text: 'D. Nhận định chung và mức giám sát', style: 'muc'},
    {text: [{text: 'Nhận định chung:   ', bold: true},
            ...DL.nhan_dinh.map((x, k) => ({text: `${k === nd ? '●' : '○'} ${x}      `, bold: k === nd, color: k === nd ? MAU_MUC[k] : XAM}))]},
    nd !== g
      ? {text: [{text: `Gợi ý theo tổng điểm: ${DL.nhan_dinh[g]}. Lý do giảng viên chọn khác: `, color: XAM}, r.ly_do_nhan_dinh],
         fontSize: 8.5, margin: [0, 2, 0, 0]}
      : {text: loi ? 'Có lỗi nghiêm trọng nên nhận định chung là Chưa đạt.'
           : `Theo tổng điểm: dưới ${q.nhan_dinh_dat}: Chưa đạt; ${q.nhan_dinh_dat}–${q.nhan_dinh_tot - 1}: Đạt; từ ${q.nhan_dinh_tot}: Tốt.`,
         fontSize: 8.5, color: XAM, margin: [0, 2, 0, 0]},
    {text: [{text: `Mức giám sát khi ${L.dong_tu} người bệnh thật: `, bold: true}, L.muc_giam_sat[gs].ten], margin: [0, 4, 0, 0]},

    {text: 'E. Phản hồi', style: 'muc'},
    {table: {widths: [122, '*'], body: PH.map(([k, ten]) => [{text: ten, bold: true, fontSize: 8.8},
                                                            {text: r.phan_hoi[k].trim() || '—'}])}, layout: LUOI},
    {text: `Thời gian: quan sát ${phutQS(r) ?? '…'} phút; phản hồi ${r.phut_phan_hoi ?? '…'} phút.`, fontSize: 8.5, color: XAM,
     margin: [0, 3, 0, 0]},
  ];
  if (r.pdf.ghi_chu && r.ghi_chu.trim()) {
    noiDung.push({text: 'Ghi chú quan sát của giảng viên', style: 'muc'}, {text: r.ghi_chu.trim(), fontSize: 8.6});
  }
  noiDung.push({stack: [
    {text: `TP. Hồ Chí Minh, ngày ${dd} tháng ${mm} năm ${yy}`, alignment: 'right', italics: true, margin: [0, 12, 0, 6]},
    {columns: [ky('GIẢNG VIÊN CHẤM', r.chu_ky.gv, r.gv), ky('SINH VIÊN ĐÃ NHẬN PHẢN HỒI', r.chu_ky.sv, r.sv.ho_ten)]},
  ], unbreakable: true});
  if (r.pdf.diem_day) {
    noiDung.push({stack: [
      {text: 'Điểm học tập của tình huống', style: 'muc'},
      ...th.dap_an.map(m => ({text: [{text: m.n + ': ', bold: true}, Array.isArray(m.nd) ? m.nd.map(x => x.replace(/\.$/, '')).join('; ') + '.' : m.nd],
                               fontSize: 9, margin: [0, 0, 0, 2]})),
      {ul: th.diem_day, fontSize: 9, margin: [0, th.dap_an.length ? 3 : 0, 0, 0]},
      {text: 'Tài liệu tham khảo', bold: true, fontSize: 8.5, margin: [0, 5, 0, 1]},
      {ol: th.tai_lieu, fontSize: 7.8, color: '#333333'},
    ], unbreakable: true});
  }

  return {
    pageSize: 'A4', pageMargins: [40, 36, 40, 44],
    info: {title: `Phiếu chấm ${L.ten_lan} ${th.ma} – ${r.sv.ho_ten}`, author: r.gv, subject: L.ten,
           creator: 'Webapp chấm Mini-CEX Y3'},
    defaultStyle: {font: 'Roboto', fontSize: 9.4, lineHeight: 1.15},
    styles: {muc: {fontSize: 10.5, bold: true, color: XANH, margin: [0, 9, 0, 3]}},
    footer: (trang, so) => ({columns: [
      {text: `${L.ten_lan} Y3 · mã phiếu ${r.id} · dữ liệu ${GOI.phien_ban} · xuất lúc ${xuat}`},
      {text: `Trang ${trang}/${so}`, alignment: 'right', width: 60},
    ], margin: [40, 14, 40, 0], fontSize: 7.5, color: XAM}),
    content: noiDung,
  };
}
