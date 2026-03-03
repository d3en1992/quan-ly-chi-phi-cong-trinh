
// ══════════════════════════════
//  DATA
// ══════════════════════════════
const DEFAULTS = {
  congTrinh: ["CÔNG TY - NHÀ","SC CT CÔ NHUNG - 191 THÀNH CÔNG, Q TÂN PHÚ","CT BỬU AN - 85/5 LÊ LAI, P12, Q TÂN BÌNH","CT A DŨNG - SUỐI CÁT, ĐỒNG NAI","CT BÁC CHỮ - 23/51A NGUYỄN HỮU TIẾN, Q TÂN PHÚ","CT BÁC ĐỆ - MỸ HẠNH NAM, ĐỨC HÒA, LONG AN","SC QUẬN 9","SC MINH CHÍNH - Q GÒ VẤP","SC CT LONG HẢI - VŨNG TÀU"],
  loaiChiPhi: ["Nhân Công","Thầu Phụ","Vật Liệu XD","Sắt Thép","Vật Tư Điện Nước","Đổ Bê Tông","Copha - VTP - Máy","Hóa Đơn Lẻ","Quyết Toán - Phát Sinh","Thiết Kế / Xin Phép","Chi Phí Khác"],
  nhaCungCap: ["Công ty VLXD Minh Phát","Cửa Hàng Sắt Thép Hùng","Điện Nước Phú Thịnh","Hóa Đơn Điện Lực"],
  nguoiTH: ["A Long","A Toán","A Dũng","Duy Sáng","HD Lẻ","Tình"]
};

const CATS = [
  { id:'congTrinh',  title:'🏗️ Công Trình',       sk:'cat_ct',    refField:'congtrinh' },
  { id:'loaiChiPhi', title:'📂 Loại Chi Phí',      sk:'cat_loai',  refField:'loai' },
  { id:'nhaCungCap', title:'🏪 Nhà Cung Cấp',      sk:'cat_ncc',   refField:'ncc' },
  { id:'nguoiTH',    title:'👷 Người Thực Hiện',   sk:'cat_nguoi', refField:'nguoi' },
  { id:'thauPhu',    title:'🤝 Thầu Phụ / TP',     sk:'cat_tp',    refField:'tp' },
  { id:'congNhan',   title:'🪖 Công Nhân',          sk:'cat_cn',    refField:null }
];

// ══════════════════════════════════════════════════════════
//  JSONBIN.IO SYNC — lưu trữ đám mây, đồng bộ đa thiết bị
// ══════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════
// FIREBASE FIRESTORE CLOUD SYNC
// REST API — không cần backend, không cần cài gì thêm
// ══════════════════════════════════════════════════════════

// ── Cấu hình Firebase (điền vào sau khi tạo project) ──────
const FB_CONFIG = {
  apiKey:    '',           // Web API Key từ Project Settings
  projectId: '',           // Project ID từ Project Settings
};
const FS_BASE = () =>
  `https://firestore.googleapis.com/v1/projects/${FB_CONFIG.projectId}/databases/(default)/documents/cpct_data`;

// ── Keys localStorage ──────────────────────────────────────
const FB_CFG_KEY   = 'fb_config';    // lưu apiKey + projectId
const FB_CACHE_KEY = 'fb_bins_cache';// cache map năm → docId

// ── Load config từ localStorage ───────────────────────────
(function() {
  const saved = _loadLS(FB_CFG_KEY);
  if (saved) { FB_CONFIG.apiKey = saved.apiKey||''; FB_CONFIG.projectId = saved.projectId||''; }
})();

function _loadLS(k) {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; }
}
function _saveLS(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

// ══════════════════════════════════════════════════════════════
// [MODULE: STORAGE v2] — DATA_VERSION · Migration · Backup · JSON IO
// Tìm nhanh: Ctrl+F → "MODULE: STORAGE"
// ══════════════════════════════════════════════════════════════

// ── Phiên bản schema hiện tại ─────────────────────────────────
// Tăng DATA_VERSION khi thay đổi cấu trúc data (thêm field bắt buộc,
// đổi tên key, v.v.). migrateData() sẽ tự nâng cấp data cũ lên mới.
const DATA_VERSION = 3;
const DATA_VERSION_KEY = 'app_data_version';

// ── Migration: nâng cấp data cũ lên version hiện tại ─────────
// Thêm case mới khi nâng DATA_VERSION lên
function migrateData() {
  const stored = parseInt(_loadLS(DATA_VERSION_KEY) || '0');
  if (stored >= DATA_VERSION) return; // Đã cập nhật, bỏ qua

  console.log('[Migration] Từ v' + stored + ' → v' + DATA_VERSION);

  // v0 → v1: inv không có field sl → set mặc định sl=1
  if (stored < 1) {
    const invs = _loadLS('inv_v3') || [];
    let changed = 0;
    invs.forEach(inv => {
      if (inv.sl === undefined || inv.sl === null) { inv.sl = 1; changed++; }
      if (inv.thanhtien === undefined) { inv.thanhtien = (inv.tien || 0) * (inv.sl || 1); changed++; }
    });
    if (changed) _saveLS('inv_v3', invs);
    console.log('[Migration v1] Chuẩn hoá sl/thanhtien:', changed, 'HĐ');
  }

  // v1 → v2: cc_v2 workers không có field phucap/hdmuale → set 0
  if (stored < 2) {
    const ccs = _loadLS('cc_v2') || [];
    let changed = 0;
    ccs.forEach(week => {
      (week.workers || []).forEach(wk => {
        if (wk.phucap === undefined) { wk.phucap = 0; changed++; }
        if (wk.hdmuale === undefined) { wk.hdmuale = 0; changed++; }
      });
    });
    if (changed) _saveLS('cc_v2', ccs);
    console.log('[Migration v2] Chuẩn hoá CC workers:', changed, 'worker');
  }

  // v2 → v3: đảm bảo mọi invoice có _ts (timestamp tạo)
  if (stored < 3) {
    const invs = _loadLS('inv_v3') || [];
    let changed = 0;
    invs.forEach(inv => {
      if (!inv._ts) { inv._ts = inv.id || Date.now(); changed++; }
    });
    if (changed) _saveLS('inv_v3', invs);
    console.log('[Migration v3] Thêm _ts cho', changed, 'HĐ');
  }

  // ── Thêm migration mới ở đây khi tăng DATA_VERSION ───────
  // if (stored < 4) { ... }

  _saveLS(DATA_VERSION_KEY, DATA_VERSION);
  console.log('[Migration] Hoàn tất → v' + DATA_VERSION);
}

// ── Auto Backup mỗi 30 phút ───────────────────────────────────
// Lưu snapshot toàn bộ data vào localStorage key: backup_auto
// Giữ 2 bản gần nhất + 1 bản của 7 ngày trước
const BACKUP_KEY     = 'backup_auto';
const BACKUP_MINS    = 30;     // chu kỳ backup (phút)
let   _backupTimer   = null;

function _snapshotNow(label) {
  try {
    const snap = {
      _ver:  DATA_VERSION,
      _time: new Date().toISOString(),
      _label: label || 'auto',
      inv:  _loadLS('inv_v3')  || [],
      ung:  _loadLS('ung_v1')  || [],
      cc:   _loadLS('cc_v2')   || [],
      tb:   _loadLS('tb_v1')   || [],
      cats: {
        ct:    _loadLS('cat_ct')    || [],
        loai:  _loadLS('cat_loai')  || [],
        ncc:   _loadLS('cat_ncc')   || [],
        nguoi: _loadLS('cat_nguoi') || [],
        tp:    _loadLS('cat_tp')    || [],
        cn:    _loadLS('cat_cn')    || []
      }
    };
    // Giữ 2 bản gần nhất + 1 bản cũ nhất trong khoảng 7 ngày trước
    const list = _loadLS(BACKUP_KEY) || [];
    list.unshift(snap);
    const recent = list.slice(0, 2);
    const rest   = list.slice(2);
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const weekly = rest.find(b => b._time && (Date.now() - new Date(b._time).getTime()) >= SEVEN_DAYS);
    _saveLS(BACKUP_KEY, weekly ? [...recent, weekly] : recent);
    return snap;
  } catch(e) {
    console.warn('[Backup] Lỗi:', e);
    return null;
  }
}

function autoBackup() {
  if (_backupTimer) clearInterval(_backupTimer);
  // Chạy lần đầu sau 1 phút kể từ khi mở app
  setTimeout(() => {
    _snapshotNow('auto');
    // Sau đó lặp mỗi 30 phút
    _backupTimer = setInterval(() => {
      _snapshotNow('auto');
      console.log('[Backup] Auto snapshot lúc', new Date().toLocaleTimeString('vi-VN'));
    }, BACKUP_MINS * 60 * 1000);
  }, 60 * 1000);
}

function getBackupList() {
  return (_loadLS(BACKUP_KEY) || []).map((b, i) => ({
    index: i,
    label: b._label || 'auto',
    time:  b._time  || '',
    ver:   b._ver   || 0,
    counts: {
      inv: (b.inv||[]).length,
      ung: (b.ung||[]).length,
      cc:  (b.cc||[]).length,
      tb:  (b.tb||[]).length
    }
  }));
}

// ── Export toàn bộ data ra file JSON ─────────────────────────
function exportJSON() {
  const snap = _snapshotNow('manual-export');
  if (!snap) { toast('❌ Không thể tạo snapshot', 'error'); return; }
  const json = JSON.stringify(snap, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const ts   = new Date().toISOString().slice(0,16).replace('T','_').replace(':','-');
  a.href     = url;
  a.download = 'cpct_backup_' + ts + '.json';
  a.click();
  URL.revokeObjectURL(url);
  toast('✅ Đã xuất file JSON (' +
    snap.inv.length + ' HĐ, ' +
    snap.ung.length + ' tiền ứng, ' +
    snap.cc.length  + ' tuần CC)', 'success');
}

// ── Import JSON — khôi phục data từ file backup ──────────────
function importJSON(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const snap = JSON.parse(e.target.result);
      // Kiểm tra cấu trúc tối thiểu
      if (typeof snap !== 'object' || (!snap.inv && !snap.ung && !snap.cc)) {
        toast('❌ File JSON không hợp lệ hoặc không phải backup của app này', 'error');
        return;
      }
      // Hiện confirm dialog
      const inv  = (snap.inv||[]).length;
      const ung  = (snap.ung||[]).length;
      const cc   = (snap.cc||[]).length;
      const tb   = (snap.tb||[]).length;
      const time = snap._time ? new Date(snap._time).toLocaleString('vi-VN') : '(không rõ)';
      const ok = confirm('⚠️ KHÔI PHỤC DỮ LIỆU TỪ FILE JSON\n\n' + 'File backup lúc: ' + time + '\n' + 'Nội dung: ' + inv + ' HĐ · ' + ung + ' tiền ứng · ' + cc + ' tuần CC · ' + tb + ' thiết bị\n\n' + '⚠️ Toàn bộ dữ liệu hiện tại sẽ bị THAY THẾ.\nHệ thống sẽ tự backup trước khi ghi đè.\n\nTiếp tục không?');
      if (!ok) return;

      // Backup data hiện tại trước khi ghi đè
      _snapshotNow('before-json-import');

      // Ghi data từ file vào localStorage
      if (snap.inv)  _saveLS('inv_v3',  snap.inv);
      if (snap.ung)  _saveLS('ung_v1',  snap.ung);
      if (snap.cc)   _saveLS('cc_v2',   snap.cc);
      if (snap.tb)   _saveLS('tb_v1',   snap.tb);
      if (snap.cats) {
        if (snap.cats.ct)    _saveLS('cat_ct',    snap.cats.ct);
        if (snap.cats.loai)  _saveLS('cat_loai',  snap.cats.loai);
        if (snap.cats.ncc)   _saveLS('cat_ncc',   snap.cats.ncc);
        if (snap.cats.nguoi) _saveLS('cat_nguoi', snap.cats.nguoi);
        if (snap.cats.tp)    _saveLS('cat_tp',    snap.cats.tp);
        if (snap.cats.cn)    _saveLS('cat_cn',    snap.cats.cn);
      }

      // Chạy migration nếu file cũ hơn version hiện tại
      _saveLS(DATA_VERSION_KEY, snap._ver || 0);
      migrateData();

      // Reload lại toàn bộ app state
      invoices   = load('inv_v3', []);
      ungRecords = load('ung_v1', []);
      ccData     = load('cc_v2', []);
      tbData     = load('tb_v1', []);
      cats.congTrinh  = load('cat_ct',    DEFAULTS.congTrinh);
      cats.loaiChiPhi = load('cat_loai',  DEFAULTS.loaiChiPhi);
      cats.nhaCungCap = load('cat_ncc',   DEFAULTS.nhaCungCap);
      cats.nguoiTH    = load('cat_nguoi', DEFAULTS.nguoiTH);
      cats.thauPhu    = load('cat_tp',    []);
      cats.congNhan   = load('cat_cn',    []);

      buildYearSelect(); _refreshAllTabs();
      rebuildEntrySelects(); rebuildUngSelects();
      renderSettings(); updateTop();

      toast('✅ Khôi phục thành công! ' + inv + ' HĐ, ' + ung + ' tiền ứng, ' + cc + ' tuần CC', 'success');
    } catch(err) {
      toast('❌ Lỗi đọc file JSON: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

// ── Khôi phục từ 1 bản auto backup ───────────────────────────
function restoreFromBackup(index) {
  const list = _loadLS(BACKUP_KEY) || [];
  const snap = list[index];
  if (!snap) { toast('❌ Không tìm thấy bản backup này', 'error'); return; }

  const time = snap._time ? new Date(snap._time).toLocaleString('vi-VN') : '(không rõ)';
  const ok = confirm('Khôi phục bản backup: ' + time + '\n' + (snap.inv||[]).length + ' HĐ · ' + (snap.ung||[]).length + ' tiền ứng · ' + (snap.cc||[]).length + ' tuần CC\n\n⚠️ Data hiện tại sẽ bị thay thế. Tiếp tục?');
  if (!ok) return;

  _snapshotNow('before-restore');
  if (snap.inv)  _saveLS('inv_v3',  snap.inv);
  if (snap.ung)  _saveLS('ung_v1',  snap.ung);
  if (snap.cc)   _saveLS('cc_v2',   snap.cc);
  if (snap.tb)   _saveLS('tb_v1',   snap.tb);
  if (snap.cats) {
    if (snap.cats.ct)    _saveLS('cat_ct',    snap.cats.ct);
    if (snap.cats.loai)  _saveLS('cat_loai',  snap.cats.loai);
    if (snap.cats.ncc)   _saveLS('cat_ncc',   snap.cats.ncc);
    if (snap.cats.nguoi) _saveLS('cat_nguoi', snap.cats.nguoi);
    if (snap.cats.tp)    _saveLS('cat_tp',    snap.cats.tp);
    if (snap.cats.cn)    _saveLS('cat_cn',    snap.cats.cn);
  }

  invoices   = load('inv_v3', []);
  ungRecords = load('ung_v1', []);
  ccData     = load('cc_v2', []);
  tbData     = load('tb_v1', []);
  cats.congTrinh  = load('cat_ct',    DEFAULTS.congTrinh);
  cats.loaiChiPhi = load('cat_loai',  DEFAULTS.loaiChiPhi);
  cats.nhaCungCap = load('cat_ncc',   DEFAULTS.nhaCungCap);
  cats.nguoiTH    = load('cat_nguoi', DEFAULTS.nguoiTH);
  cats.thauPhu    = load('cat_tp',    []);
  cats.congNhan   = load('cat_cn',    []);

  buildYearSelect(); _refreshAllTabs();
  rebuildEntrySelects(); rebuildUngSelects();
  renderSettings(); updateTop();
  toast('✅ Đã khôi phục bản backup lúc ' + time, 'success');
}

// ── Render danh sách backup vào panel UI ──────────────────────
function renderBackupList() {
  const wrap = document.getElementById('backup-list-wrap');
  if (!wrap) return;

  // Cập nhật badge version
  const badge = document.getElementById('data-version-badge');
  if (badge) badge.textContent = 'v' + DATA_VERSION;

  // Cập nhật thời gian backup gần nhất
  const statusLabel = document.getElementById('backup-status-label');
  const list = _loadLS(BACKUP_KEY) || [];

  if (!list.length) {
    wrap.innerHTML = '<div style="color:var(--ink3);font-size:13px;padding:8px 0">Chưa có bản sao lưu nào. App sẽ tự động tạo sau 1 phút.</div>';
    if (statusLabel) statusLabel.textContent = '';
    return;
  }

  // Label thời gian backup gần nhất
  if (statusLabel && list[0]?._time) {
    const t = new Date(list[0]._time).toLocaleString('vi-VN');
    statusLabel.textContent = 'Backup gần nhất: ' + t;
  }

  // Render từng bản backup
  const rows = list.map((b, i) => {
    const time  = b._time ? new Date(b._time).toLocaleString('vi-VN') : '(không rõ)';
    const label = b._label === 'auto' ? '🔄 Tự động' :
                  b._label === 'manual' ? '📸 Thủ công' :
                  b._label === 'manual-export' ? '📤 Trước khi xuất' :
                  b._label === 'before-json-import' ? '🛡 Trước khi nhập JSON' :
                  b._label === 'before-restore' ? '🛡 Trước khi khôi phục' : b._label;
    const counts = (b.inv||[]).length + ' HĐ · ' +
                   (b.ung||[]).length + ' tiền ứng · ' +
                   (b.cc||[]).length  + ' tuần CC · ' +
                   (b.tb||[]).length  + ' TB';
    const isNewest = i === 0;
    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;
              background:${isNewest ? 'var(--paper)' : 'transparent'};
              border-radius:8px;border:1px solid ${isNewest ? 'var(--line2)' : 'transparent'};
              margin-bottom:6px;flex-wrap:wrap">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--ink)">${label}</div>
        <div style="font-size:11px;color:var(--ink3);margin-top:2px">${time} &nbsp;·&nbsp; ${counts}</div>
      </div>
      <button class="btn btn-outline btn-sm" onclick="restoreFromBackup(${i})" title="Khôi phục bản này">
        ↩ Khôi phục
      </button>
    </div>`;
  }).join('');

  wrap.innerHTML = rows;
}

function fbReady() { return FB_CONFIG.apiKey && FB_CONFIG.projectId; }

// ══ NÉN / GIẢI NÉN ═══════════════════════════════════════
// inv: id→i ngay→d congtrinh→c loai→l nguoi→n ncc→s nd→t tien→p thanhtien→q sl→k ccKey→x _ts→m
function compressInv(arr) {
  return arr.map(o=>{const r={};
    if(o.id!==undefined)r.i=o.id; if(o.ngay)r.d=o.ngay; if(o.congtrinh)r.c=o.congtrinh;
    if(o.loai)r.l=o.loai; if(o.nguoi)r.n=o.nguoi; if(o.ncc)r.s=o.ncc; if(o.nd)r.t=o.nd;
    if(o.tien)r.p=o.tien; if(o.thanhtien&&o.thanhtien!==o.tien)r.q=o.thanhtien;
    if(o.sl&&o.sl!==1)r.k=o.sl; if(o.ccKey)r.x=o.ccKey; if(o._ts)r.m=o._ts; return r;});
}
function expandInv(arr) {
  return (arr||[]).map(o=>({id:o.i,ngay:o.d,congtrinh:o.c,loai:o.l,nguoi:o.n||'',ncc:o.s||'',
    nd:o.t||'',tien:o.p||0,thanhtien:o.q||(o.p||0),sl:o.k||undefined,ccKey:o.x||undefined,_ts:o.m||undefined}));
}
function compressCC(arr) {
  return (arr||[]).map(w=>({i:w.id,f:w.fromDate,e:w.toDate,c:w.ct,
    w:w.workers.map(wk=>{const r={n:wk.name,d:wk.d,l:wk.luong};
      if(wk.phucap)r.p=wk.phucap; if(wk.hdmuale)r.h=wk.hdmuale; if(wk.nd)r.t=wk.nd; return r;})}));
}
function expandCC(arr) {
  return (arr||[]).map(w=>({id:w.i,fromDate:w.f,toDate:w.e,ct:w.c,
    workers:(w.w||[]).map(wk=>({name:wk.n,d:wk.d,luong:wk.l||0,phucap:wk.p||0,hdmuale:wk.h||0,nd:wk.t||''}))}));
}
function compressUng(arr) {
  return (arr||[]).map(o=>({i:o.id,d:o.ngay,t:o.tp||o.ncc||'',c:o.congtrinh,p:o.tien||0,n:o.nd||''}));
}
function expandUng(arr) {
  return (arr||[]).map(o=>({id:o.i,ngay:o.d,tp:o.t,congtrinh:o.c,tien:o.p||0,nd:o.n||''}));
}
function compressTb(arr) {
  return (arr||[]).map(o=>({i:o.id,c:o.ct,t:o.ten,s:o.soluong||0,r:o.tinhtrang,n:o.nguoi||'',g:o.ghichu||'',d:o.ngay||''}));
}
function expandTb(arr) {
  return (arr||[]).map(o=>({id:o.i,ct:o.c,ten:o.t,soluong:o.s||0,tinhtrang:o.r||'Đang hoạt động',nguoi:o.n||'',ghichu:o.g||'',ngay:o.d||''}));
}

function load(k, def) {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; }
}
function save(k, v) {
  clearTimeout(save._t);
  localStorage.setItem(k, JSON.stringify(v));
  save._t = setTimeout(fbPushAll, 2500);
}

// ══ FIRESTORE DOCUMENT FORMAT ═════════════════════════════
// Firestore lưu dạng {fields: {key: {stringValue/integerValue/...}}}
// Ta dùng 1 field "data" chứa toàn bộ JSON nén dạng stringValue

function fsWrap(obj) {
  // Wrap object thành Firestore document format
  return { fields: { data: { stringValue: JSON.stringify(obj) } } };
}
function fsUnwrap(doc) {
  // Unwrap Firestore document về plain object
  if (!doc || !doc.fields || !doc.fields.data) return null;
  try { return JSON.parse(doc.fields.data.stringValue); } catch { return null; }
}

// ── Doc ID helpers ─────────────────────────────────────────
function fbDocYear(yr)  { return `y${yr}`; }
function fbDocCats()    { return 'cats'; }

// ── Build payload cho từng loại ───────────────────────────
function fbYearPayload(yr) {
  const y = yr || activeYear || new Date().getFullYear();
  const ys = String(y);
  return { v:3, yr:y,
    i: compressInv(load('inv_v3',[]).filter(x=>x.ngay&&x.ngay.startsWith(ys))),
    u: compressUng(load('ung_v1',[]).filter(x=>x.ngay&&x.ngay.startsWith(ys))),
    c: compressCC(load('cc_v2',[]).filter(x=>x.fromDate&&x.fromDate.startsWith(ys))),
    t: compressTb(load('tb_v1',[]).filter(x=>x.ngay&&x.ngay.startsWith(ys))),
    thu: load('thu_v1',[]).filter(x=>x.ngay&&x.ngay.startsWith(ys)) };
}
function fbCatsPayload() {
  return { v:3,
    cats:{ct:load('cat_ct',DEFAULTS.congTrinh),loai:load('cat_loai',DEFAULTS.loaiChiPhi),
      ncc:load('cat_ncc',DEFAULTS.nhaCungCap),nguoi:load('cat_nguoi',DEFAULTS.nguoiTH)},
    hopDong: load('hopdong_v1', {}) };  // hợp đồng xuyên suốt, không theo năm
}

// ── Firebase REST helpers ──────────────────────────────────
function fsUrl(docId) {
  return `${FS_BASE()}/${docId}?key=${FB_CONFIG.apiKey}`;
}
function fsGet(docId) {
  return fetch(fsUrl(docId)).then(r=>r.json());
}
function fsSet(docId, payload) {
  // PATCH = upsert (tạo hoặc cập nhật)
  return fetch(`${FS_BASE()}/${docId}?key=${FB_CONFIG.apiKey}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fsWrap(payload))
  }).then(r=>r.json());
}

// ── Estimate size ──────────────────────────────────────────
function estimateYearKb(yr) {
  const ys = String(yr || activeYear || new Date().getFullYear());
  const data = {
    i: compressInv(load('inv_v3',[]).filter(x=>x.ngay&&x.ngay.startsWith(ys))),
    u: compressUng(load('ung_v1',[]).filter(x=>x.ngay&&x.ngay.startsWith(ys))),
    c: compressCC(load('cc_v2',[]).filter(x=>x.fromDate&&x.fromDate.startsWith(ys))),
  };
  return Math.round(JSON.stringify(data).length/1024*10)/10;
}

// ══ PUSH LÊN CLOUD ════════════════════════════════════════
let _fbPushing = false;
function fbPushAll() {
  if (!fbReady()) return;
  if (_fbPushing) { save._t = setTimeout(fbPushAll, 3000); return; }
  const yr = activeYear || new Date().getFullYear();
  const payload = fbYearPayload(yr);
  const kb = Math.round(JSON.stringify(payload).length/1024*10)/10;
  _fbPushing = true;
  _ensureSyncDot(); _setSyncDot('syncing');
  showSyncBanner('☁️ Đang lưu (~' + kb + 'kb)...');
  fsSet(fbDocYear(yr), payload).then(res=>{
    _fbPushing = false;
    if (res.fields) {
      _setSyncDot('');
      showSyncBanner('✅ Đã lưu cloud (~' + kb + 'kb)', 2000);
      updateJbBtn();
      // Push cats async
      fsSet(fbDocCats(), fbCatsPayload()).catch(()=>{});
    } else {
      _setSyncDot('error');
      const err = res.error?.message || JSON.stringify(res.error) || '?';
      if (err.includes('PERMISSION_DENIED'))
        showSyncBanner('⚠️ Lỗi quyền truy cập — kiểm tra Security Rules', 5000);
      else
        showSyncBanner('⚠️ Lỗi lưu: ' + err.substring(0,60), 4000);
    }
  }).catch(()=>{ _fbPushing=false; _setSyncDot('offline'); showSyncBanner('⚠️ Mất kết nối internet', 3000); });
}

// ── Alias jbPushAll cho các nơi gọi cũ ───────────────────
function jbPushAll() { fbPushAll(); }

// ══ TẢI TỪ CLOUD ══════════════════════════════════════════
function gsLoadAll(callback) {
  if (!fbReady()) { callback(null); return; }
  const yr = activeYear || new Date().getFullYear();
  const ys = String(yr);
  showSyncBanner('⏳ Đang tải năm ' + yr + '...');

  Promise.all([
    fsGet(fbDocYear(yr)),
    fsGet(fbDocCats())
  ]).then(([yearDoc, catsDoc]) => {
    // Apply year data
    const yearData = fsUnwrap(yearDoc);
    if (yearData) {
      const mergeArr = (key, expanded) => {
        const existing = load(key,[]).filter(x=>{
          const d = x.ngay||x.fromDate||'';
          return !d.startsWith(ys);
        });
        localStorage.setItem(key, JSON.stringify([...expanded,...existing]));
      };
      if(yearData.i) mergeArr('inv_v3', expandInv(yearData.i));
      if(yearData.u) mergeArr('ung_v1', expandUng(yearData.u));
      if(yearData.c) { const ex=load('cc_v2',[]).filter(x=>!x.fromDate||!x.fromDate.startsWith(ys));
        localStorage.setItem('cc_v2', JSON.stringify([...expandCC(yearData.c),...ex])); }
      if(yearData.t) { const ex=load('tb_v1',[]).filter(x=>!x.ngay||!x.ngay.startsWith(ys));
        localStorage.setItem('tb_v1', JSON.stringify([...expandTb(yearData.t),...ex])); }
    }
    // Apply cats
    const catsData = fsUnwrap(catsDoc);
    if (catsData && catsData.cats) {
      const ct = catsData.cats;
      if(ct.ct)    localStorage.setItem('cat_ct',   JSON.stringify(ct.ct));
      if(ct.loai)  localStorage.setItem('cat_loai', JSON.stringify(ct.loai));
      if(ct.ncc)   localStorage.setItem('cat_ncc',  JSON.stringify(ct.ncc));
      if(ct.nguoi) localStorage.setItem('cat_nguoi',JSON.stringify(ct.nguoi));
    }
    // Apply hopDong (xuyên suốt, không theo năm)
    if (catsData && catsData.hopDong) {
      localStorage.setItem('hopdong_v1', JSON.stringify(catsData.hopDong));
      hopDongData = catsData.hopDong;
    }
    // Apply thu (theo năm — merge như ungRecords)
    if (yearData && yearData.thu) {
      const exThu = load('thu_v1',[]).filter(x => !x.ngay || !x.ngay.startsWith(ys));
      localStorage.setItem('thu_v1', JSON.stringify([...yearData.thu, ...exThu]));
      thuRecords = load('thu_v1', []);
    }
    hideSyncBanner();
    callback(yearData || catsData || {});

    // Nếu năm này chưa có trên cloud → push ngay
    if (!yearData) setTimeout(()=>fbPushAll(), 1500);
  }).catch(e => {
    hideSyncBanner();
    console.warn('gsLoadAll error:', e);
    callback(null);
  });
}

// ══ CẬP NHẬT NÚT CLOUD ════════════════════════════════════
function updateJbBtn() {
  const btn = document.getElementById('jb-btn');
  if (!btn) return;
  if (fbReady()) {
    btn.textContent = '✅ Cloud';
    btn.style.background = 'rgba(26,122,69,0.4)';
    btn.style.borderColor = 'rgba(26,200,100,0.5)';
    _ensureSyncDot();
  } else {
    btn.textContent = '☁️ Cloud';
    btn.style.background = 'rgba(255,255,255,0.12)';
    btn.style.borderColor = 'rgba(255,255,255,0.25)';
    const dot = document.getElementById('sync-dot');
    if (dot) dot.className = 'hidden';
  }
}

// VI: Sync status dot
function _ensureSyncDot() {
  const btn = document.getElementById('jb-btn');
  if (!btn || document.getElementById('sync-dot')) return;
  const dot = document.createElement('span');
  dot.id = 'sync-dot';
  btn.style.position = 'relative';
  btn.appendChild(dot);
}
function _setSyncDot(status) {
  const dot = document.getElementById('sync-dot');
  if (!dot) return;
  dot.className = status || '';
}

// ══ MODAL CẤU HÌNH ════════════════════════════════════════
function openBinModal() { renderBinModal(); }
function closeBinModal() {
  const ov = document.getElementById('bin-modal-overlay');
  if(ov) ov.style.display='none';
}

function renderBinModal() {
  const yr = activeYear || new Date().getFullYear();
  const ov = document.getElementById('bin-modal-overlay') || _createModalOverlay();
  const isConnected = fbReady();
  const yearKb = isConnected ? estimateYearKb(yr) : 0;

  const statusColor = yearKb < 200 ? '#1a7a45' : yearKb < 500 ? '#e67e00' : '#c0392b';
  const statusBg    = yearKb < 200 ? '#d4edda'  : yearKb < 500 ? '#fff3cd' : '#f8d7da';
  const statusLabel = yearKb < 200 ? '✅ OK'    : yearKb < 500 ? '⚠️ Khá lớn' : '🔴 Lớn';

  ov.innerHTML = `<div onclick="event.stopPropagation()" style="max-width:460px;width:95vw;background:#fff;border-radius:16px;padding:24px;font-family:'IBM Plex Sans',sans-serif;box-shadow:0 12px 48px rgba(0,0,0,.18)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h3 style="font-size:17px;font-weight:800;margin:0">🔥 Kết Nối Firebase</h3>
      <button onclick="closeBinModal()" style="background:none;border:none;font-size:22px;cursor:pointer;color:#888;line-height:1">✕</button>
    </div>

    ${isConnected ? `
    <div style="background:#f0fff4;border:1px solid #b2dfdb;border-radius:8px;padding:10px 14px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;color:#1a7a45;margin-bottom:4px">✅ ĐÃ KẾT NỐI</div>
      <div style="font-size:11px;color:#555">Project: <strong>${FB_CONFIG.projectId}</strong></div>
      <div style="font-size:11px;color:#888;margin-top:2px">API Key: ${FB_CONFIG.apiKey.substring(0,8)}••••••••</div>
    </div>
    <div style="background:#f5f4f0;border-radius:8px;padding:8px 12px;margin-bottom:14px;font-size:12px">
      📊 Dữ liệu năm ${yr}: <strong style="color:${statusColor}">${yearKb}kb</strong>
      <span style="margin-left:6px;background:${statusBg};color:${statusColor};border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700">${statusLabel}</span>
      <div style="font-size:10px;color:#aaa;margin-top:2px">Firebase free: 1GB storage · 50K reads/ngày · 20K writes/ngày</div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:14px">
      <button onclick="syncNow()" style="flex:1;padding:10px;border-radius:8px;border:1.5px solid #1565c0;background:transparent;color:#1565c0;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer">🔄 Tải Về</button>
      <button onclick="fbDisconnect()" style="flex:1;padding:10px;border-radius:8px;border:1.5px solid #c0392b;background:transparent;color:#c0392b;font-family:inherit;font-size:13px;cursor:pointer">⛔ Ngắt</button>
    </div>
    ` : `
    <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px;margin-bottom:14px;font-size:13px;color:#856404">
      Nhập <strong>Project ID</strong> và <strong>Web API Key</strong> từ Firebase Console để kết nối.
    </div>
    `}

    <div style="margin-bottom:10px">
      <label style="font-size:11px;font-weight:700;color:#555;display:block;margin-bottom:4px">PROJECT ID</label>
      <input id="fb-proj-input" type="text" value="${FB_CONFIG.projectId}"
        placeholder="your-project-id"
        style="width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid #ddd;border-radius:8px;font-family:'IBM Plex Mono',monospace;font-size:12px;outline:none">
    </div>
    <div style="margin-bottom:14px">
      <label style="font-size:11px;font-weight:700;color:#555;display:block;margin-bottom:4px">WEB API KEY</label>
      <input id="fb-key-input" type="text" value="${FB_CONFIG.apiKey}"
        placeholder="AIzaSy..."
        style="width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid #ddd;border-radius:8px;font-family:'IBM Plex Mono',monospace;font-size:12px;outline:none">
    </div>
    <button onclick="fbSaveConfig()" style="width:100%;padding:12px;border-radius:8px;border:none;background:#1a1814;color:#fff;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:10px">
      💾 ${isConnected ? 'Cập Nhật Kết Nối' : 'Kết Nối Firebase'}
    </button>
    <div style="font-size:11px;color:#aaa;text-align:center;line-height:1.6">
      Firebase free tier: 1GB · Không giới hạn size/file · Google hỗ trợ lâu dài
    </div>
  </div>`;
  ov.style.display = 'flex';
}

function _createModalOverlay() {
  let ov = document.getElementById('bin-modal-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'bin-modal-overlay';
    ov.onclick = function(e) { if(e.target===this) closeBinModal(); };
    ov.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;align-items:center;justify-content:center';
    document.body.appendChild(ov);
  }
  return ov;
}

function fbSaveConfig() {
  const proj = (document.getElementById('fb-proj-input')?.value||'').trim();
  const key  = (document.getElementById('fb-key-input')?.value||'').trim();
  if (!proj || !key) { toast('Vui lòng nhập đủ Project ID và API Key!', 'error'); return; }
  FB_CONFIG.projectId = proj;
  FB_CONFIG.apiKey    = key;
  _saveLS(FB_CFG_KEY, { projectId: proj, apiKey: key });
  closeBinModal();
  toast('✅ Đã lưu cấu hình Firebase! Đang tải dữ liệu...', 'success');
  updateJbBtn();
  reloadFromCloud();
}

function fbDisconnect() {
  if (!confirm('Ngắt kết nối Firebase? Dữ liệu local vẫn còn.')) return;
  FB_CONFIG.projectId = '';
  FB_CONFIG.apiKey    = '';
  localStorage.removeItem(FB_CFG_KEY);
  closeBinModal();
  updateJbBtn();
  toast('Đã ngắt kết nối Firebase');
}

// Alias các hàm cũ để không break code khác
function jbSaveId()     { fbSaveConfig(); }
function jbDisconnect() { fbDisconnect(); }
function copyBinId()    { navigator.clipboard.writeText(FB_CONFIG.projectId).then(()=>toast('✅ Đã copy Project ID')).catch(()=>{}); }
function linkBinId()    { fbSaveConfig(); }
function resetBin()     { fbDisconnect(); }
function createNewBin() { openBinModal(); }

function reloadFromCloud() {
  showSyncBanner('⏳ Đang tải dữ liệu...');
  gsLoadAll(function(data) {
    if (!data) { hideSyncBanner(); toast('⚠️ Không tải được dữ liệu từ cloud', 'error'); return; }
    invoices   = load('inv_v3', []);
    ungRecords = load('ung_v1', []);
    ccData     = load('cc_v2', []);
    tbData     = load('tb_v1', []);
    cats.congTrinh  = load('cat_ct',    DEFAULTS.congTrinh);
    cats.loaiChiPhi = load('cat_loai',  DEFAULTS.loaiChiPhi);
    cats.nhaCungCap = load('cat_ncc',   DEFAULTS.nhaCungCap);
    cats.nguoiTH    = load('cat_nguoi', DEFAULTS.nguoiTH);
    buildYearSelect();
    rebuildEntrySelects(); rebuildUngSelects();
    buildFilters(); filterAndRender(); renderTrash();
    renderCCHistory(); renderCCTLT();
    buildUngFilters(); filterAndRenderUng();
    renderCtPage(); updateTop(); renderSettings();
    toast('✅ Đã tải dữ liệu từ Firebase!', 'success');
  });
}

function syncNow() {
  closeBinModal();
  reloadFromCloud();
}

function buildYearSelect() {
  const years = new Set();
  years.add(new Date().getFullYear());
  invoices.forEach(i=>{ if(i.ngay) years.add(parseInt(i.ngay.split('-')[0])); });
  ungRecords.forEach(u=>{ if(u.ngay) years.add(parseInt(u.ngay.split('-')[0])); });
  ccData.forEach(w=>{ if(w.fromDate) years.add(parseInt(w.fromDate.split('-')[0])); });
  _renderYearSelect(years);

  // Nếu Firebase ready → fetch danh sách doc để biết có năm nào
  if(fbReady()) {
    fetch(`${FS_BASE()}?key=${FB_CONFIG.apiKey}&pageSize=20`)
      .then(r=>r.json()).then(data=>{
        if(data.documents) {
          data.documents.forEach(doc=>{
            // doc.name = ".../cpct_data/y2025" or ".../cpct_data/y2026"
            const seg = doc.name.split('/').pop();
            if(seg && seg.startsWith('y')) {
              const yr = parseInt(seg.slice(1));
              if(!isNaN(yr) && yr > 2000 && yr < 2100) years.add(yr);
            }
          });
          _renderYearSelect(years);
        }
      }).catch(()=>{});
  }
}

function _renderYearSelect(years) {
  const sorted = [...years].sort((a,b)=>b-a);
  const sel = document.getElementById('global-year');
  if(!sel) return;
  const allSel = activeYear === 0 ? 'selected' : '';
  sel.innerHTML = `<option value="0" ${allSel}>Tất cả</option>` +
    sorted.map(y=>`<option value="${y}" ${y===activeYear?'selected':''}>${y}</option>`).join('');
}

function saveCats(catId) {
  const cfg = CATS.find(c=>c.id===catId);
  if (cfg) {
    localStorage.setItem(cfg.sk, JSON.stringify(cats[catId]));
    clearTimeout(save._t);
    save._t = setTimeout(()=>{
      if (!fbReady()) return;
      fsSet(fbDocCats(), fbCatsPayload()).catch(()=>{});
    }, 1500);
  }
}


function showSyncBanner(msg, autohideMs=0) {
  let b = document.getElementById('sync-banner');
  if (!b) {
    b = document.createElement('div');
    b.id = 'sync-banner';
    b.style.cssText = 'position:fixed;top:56px;left:50%;transform:translateX(-50%);z-index:9999;background:#1a73e8;color:#fff;border-radius:20px;padding:6px 18px;font-size:12px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.2);pointer-events:none;transition:opacity .3s';
    document.body.appendChild(b);
  }
  b.textContent = msg; b.style.opacity='1'; b.style.display='block';
  if (autohideMs) setTimeout(hideSyncBanner, autohideMs);
}
function hideSyncBanner() {
  const b = document.getElementById('sync-banner');
  if (b) { b.style.opacity='0'; setTimeout(()=>b.style.display='none', 300); }
}

let cats = {
  congTrinh:  load('cat_ct',    DEFAULTS.congTrinh),
  loaiChiPhi: load('cat_loai',  DEFAULTS.loaiChiPhi),
  nhaCungCap: load('cat_ncc',   DEFAULTS.nhaCungCap),
  nguoiTH:    load('cat_nguoi', DEFAULTS.nguoiTH),
  thauPhu:    load('cat_tp',    []),
  congNhan:   load('cat_cn',    [])
};
let cnRoles = load('cat_cn_roles', {}); // { "Tên CN": "C/T/P" }

let invoices = load('inv_v3', []);
let filteredInvs = [];
let curPage = 1;
const PG = 13;

// ══════════════════════════════
//  INIT
// ══════════════════════════════
function init() {
  document.getElementById('entry-date').value = today();
  document.getElementById('ung-date').value = today();

  // Hiển thị dữ liệu local ngay lập tức
  initTable(5);
  initUngTable(4);
  initCC();
  updateTop();
  updateJbBtn();

  // ── Nâng cấp schema nếu cần (chạy trước khi dùng data) ──
  migrateData();

  // ── Bắt đầu auto backup ngầm mỗi 30 phút ──────────────────
  autoBackup();

  // Tự động tạo HĐ nhân công nếu có CC data nhưng chưa có HĐ (vd: sau khi import Excel)
  autoRebuildCCIfNeeded();

  buildYearSelect();
  renderTrash();
  renderTodayInvoices();

  // Tự động đo chiều cao topbar và cập nhật padding cho body
  // Giải quyết vấn đề topbar sticky che khuất content trên mobile khi nút rớt dòng
  (function syncTopbarHeight() {
    const topbar = document.querySelector('.topbar');
    const body   = document.body;
    function update() {
      const h = topbar ? topbar.getBoundingClientRect().height : 0;
      // Thêm CSS variable để dùng ở bất cứ đâu nếu cần
      document.documentElement.style.setProperty('--topbar-h', h + 'px');
    }
    update();
    // Theo dõi khi topbar thay đổi chiều cao (wrap nút, resize cửa sổ)
    if (window.ResizeObserver) {
      new ResizeObserver(update).observe(topbar);
    }
    window.addEventListener('resize', update);
  })();

  // X: Topbar compact khi cuộn
  (function initTopbarCompact() {
    window.addEventListener('scroll', () => {
      document.querySelector('.topbar')?.classList.toggle('compact', window.scrollY > 80);
    }, { passive: true });
  })();

  // Tải dữ liệu mới nhất từ cloud (nếu đã có Bin ID)
  gsLoadAll(function(data) {
    if (!data) return;
    invoices    = load('inv_v3', []);
    ungRecords  = load('ung_v1', []);
    ccData      = load('cc_v2', []);
    tbData      = load('tb_v1', []);
    cats.congTrinh  = load('cat_ct',    DEFAULTS.congTrinh);
    cats.loaiChiPhi = load('cat_loai',  DEFAULTS.loaiChiPhi);
    cats.nhaCungCap = load('cat_ncc',   DEFAULTS.nhaCungCap);
    cats.nguoiTH    = load('cat_nguoi', DEFAULTS.nguoiTH);
    buildYearSelect(); updateTop();
    rebuildEntrySelects(); rebuildCCNameList(); populateCCCtSel();
    initTable(5); initUngTable(4); initCC();
    const built2 = rebuildInvoicesFromCC();
    updateTop();
    toast(`✅ Đồng bộ xong! ${built2.weeks} HĐ nhân công, ${built2.cts} CT mới`, 'success');
  });
}

function today() { return new Date().toISOString().split('T')[0]; }


// ══════════════════════════════
//  NAVIGATION
// ══════════════════════════════
function goPage(btn, id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-'+id).classList.add('active');
  btn.classList.add('active');
  if (id==='tatca') { buildFilters(); filterAndRender(); }
  if (id==='nhap') { renderTodayInvoices(); }
  if (id==='danhmuc') renderSettings();
  if (id==='dashboard') renderDashboard();
  if (id==='doanhthu') initDoanhThu();
  if (id==='nhapung') { initUngTableIfEmpty(); buildUngFilters(); filterAndRenderUng(); }
  if (id==='chamcong') { populateCCCtSel(); rebuildCCNameList(); renderCCHistory(); renderCCTLT(); }
  if (id==='thietbi') { tbPopulateSels(); tbBuildRows(5); tbRenderList(); tbRenderThongKeVon(); }
}

// ══════════════════════════════
//  ENTRY TABLE
// ══════════════════════════════
function initTable(n=10) {
  document.getElementById('entry-tbody').innerHTML='';
  for(let i=0;i<n;i++) addRow();
  calcSummary();
}

function addRows(n) { for(let i=0;i<n;i++) addRow(); }

function addRow(d={}) {
  const tbody = document.getElementById('entry-tbody');
  const num = tbody.children.length + 1;
  const ctDef = d.congtrinh || '';

  const tr = document.createElement('tr');

  const loaiOpts = `<option value="">-- Chọn --</option>` + cats.loaiChiPhi.map(v=>`<option value="${x(v)}" ${v===(d.loai||'')?'selected':''}>${x(v)}</option>`).join('');
  const ctOpts = `<option value="">-- Chọn --</option>` + cats.congTrinh.map(v=>`<option value="${x(v)}" ${v===ctDef?'selected':''}>${x(v)}</option>`).join('');
  const dlNguoi = 'dlN' + num + Date.now();
  const dlNcc   = 'dlC' + num + Date.now();

  const slVal = d.sl||'';
  const thTien = slVal && d.tien ? numFmt((d.sl||1)*(d.tien||0)) : (d.tien?numFmt(d.tien):'');

  tr.innerHTML = `
    <td class="row-num">${num}</td>
    <td><select class="cell-input" data-f="loai">${loaiOpts}</select></td>
    <td><select class="cell-input" data-f="ct">${ctOpts}</select></td>
    <td><input class="cell-input right tien-input" data-f="tien" data-raw="${d.tien||''}" placeholder="0" value="${d.tien?numFmt(d.tien):''}"></td>
    <td style="padding:0"><input type="number" class="cell-input" data-f="sl" min="0" step="0.01"
      value="${x(slVal)}" placeholder="1"
      style="text-align:center;width:100%;border:none;background:transparent;padding:7px 6px;font-family:'IBM Plex Mono',monospace;font-size:13px;outline:none;-moz-appearance:textfield"
      inputmode="decimal"></td>
    <td style="padding:0;text-align:right">
      <span data-f="thtien" style="display:block;padding:7px 8px;font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:13px;color:var(--green)">${thTien}</span>
    </td>
    <td><input class="cell-input" data-f="nd" value="${x(d.nd||'')}" placeholder="Nội dung..."></td>
    <td>
      <input class="cell-input" data-f="nguoi" list="${dlNguoi}" value="${x(d.nguoi||'')}" placeholder="Nhập hoặc chọn...">
      <datalist id="${dlNguoi}">${cats.nguoiTH.map(v=>`<option value="${x(v)}">`).join('')}</datalist>
    </td>
    <td>
      <input class="cell-input" data-f="ncc" list="${dlNcc}" value="${x(d.ncc||'')}" placeholder="Nhập hoặc chọn...">
      <datalist id="${dlNcc}">${cats.nhaCungCap.map(v=>`<option value="${x(v)}">`).join('')}</datalist>
    </td>
    <td><button class="del-btn" onclick="delRow(this)">✕</button></td>
  `;

  function updateThTien() {
    const tienRaw = parseInt(tr.querySelector('[data-f="tien"]').dataset.raw||'0')||0;
    const slRaw   = parseFloat(tr.querySelector('[data-f="sl"]').value)||1;
    const th = tienRaw * slRaw;
    const thEl = tr.querySelector('[data-f="thtien"]');
    if(thEl) thEl.textContent = th ? numFmt(th) : '';
    tr.querySelector('[data-f="thtien"]').dataset.raw = th;
  }

  // Thousand-separator logic for tien input
  const tienInput = tr.querySelector('[data-f="tien"]');
  tienInput.addEventListener('input', function() {
    const raw = this.value.replace(/[.,]/g,'');
    this.dataset.raw = raw;
    if(raw) this.value = numFmt(parseInt(raw,10)||0);
    updateThTien(); calcSummary();
  });
  tienInput.addEventListener('focus', function() { this.value = this.dataset.raw || ''; });
  tienInput.addEventListener('blur', function() {
    const raw = parseInt(this.dataset.raw||'0',10)||0;
    this.value = raw ? numFmt(raw) : '';
  });
  tr.querySelector('[data-f="sl"]').addEventListener('input', function() {
    updateThTien(); calcSummary();
  });

  tr.querySelectorAll('input,select').forEach(el => {
    if(el.dataset.f!=='tien' && el.dataset.f!=='sl') {
      el.addEventListener('input', calcSummary);
      el.addEventListener('change', calcSummary);
    }
  });

  tbody.appendChild(tr);
  // Trigger initial thTien
  const tRaw = parseInt(tienInput.dataset.raw||'0')||0;
  const sRaw = parseFloat(tr.querySelector('[data-f="sl"]').value)||1;
  const th0 = tRaw*sRaw;
  const thEl0 = tr.querySelector('[data-f="thtien"]');
  if(thEl0){ thEl0.textContent = th0?numFmt(th0):''; thEl0.dataset.raw=th0; }
}

function delRow(btn) { btn.closest('tr').remove(); renumber(); calcSummary(); }

function renumber() {
  document.querySelectorAll('#entry-tbody tr').forEach((tr,i) => {
    tr.querySelector('.row-num').textContent = i+1;
  });
}

function calcSummary() {
  let cnt=0, total=0;
  document.querySelectorAll('#entry-tbody tr').forEach(tr => {
    const loai = tr.querySelector('[data-f="loai"]')?.value||'';
    const ct   = tr.querySelector('[data-f="ct"]')?.value||'';
    const tienRaw = parseInt(tr.querySelector('[data-f="tien"]')?.dataset.raw||'0',10)||0;
    const sl   = parseFloat(tr.querySelector('[data-f="sl"]')?.value)||1;
    const thTien = tienRaw * sl;
    if(loai||ct||tienRaw>0) { cnt++; total += thTien; }
  });
  document.getElementById('row-count').textContent = cnt;
  document.getElementById('entry-total').textContent = fmtM(total);
}

function clearTable() {
  if(!confirm('Xóa toàn bộ bảng nhập hiện tại?')) return;
  initTable(5);
}

function saveAllRows(skipDupCheck) {
  const date = document.getElementById('entry-date').value;
  if(!date) { toast('Vui lòng chọn ngày!','error'); return; }

  // Thu thập tất cả dòng hợp lệ
  const rows = [];
  let errRow = 0;
  document.querySelectorAll('#entry-tbody tr').forEach(tr => {
    const loai = (tr.querySelector('[data-f="loai"]')?.value||'').trim();
    const ct   = (tr.querySelector('[data-f="ct"]')?.value||'').trim();
    const tien = parseInt(tr.querySelector('[data-f="tien"]')?.dataset.raw||'0',10)||0;
    if(!loai&&!ct&&!tien) return;
    if(!ct||!loai) { errRow++; tr.style.background='#fdecea'; return; }
    tr.style.background='';
    rows.push({
      tr,
      editId: tr.dataset.editId || null,
      payload: {
        ngay: date,
        congtrinh: ct, loai,
        nguoi: (tr.querySelector('[data-f="nguoi"]')?.value||'').trim(),
        ncc:   (tr.querySelector('[data-f="ncc"]')?.value||'').trim(),
        nd:    (tr.querySelector('[data-f="nd"]')?.value||'').trim(),
        tien,
        sl:    parseFloat(tr.querySelector('[data-f="sl"]')?.value)||1,
        get thanhtien() { return Math.round(this.tien * this.sl); }
      }
    });
  });

  if(errRow>0) { toast(`${errRow} dòng thiếu Công Trình hoặc Loại CP!`,'error'); return; }
  if(!rows.length) { toast('Không có dòng hợp lệ!','error'); return; }

  // Kiểm tra trùng — chỉ cho dòng MỚI (không phải edit)
  if(!skipDupCheck) {
    const newRows = rows.filter(r => !r.editId);
    const dupRows = [];
    newRows.forEach(r => {
      // Chỉ so sánh với HĐ nhập tay (không ccKey) trong cùng ngày+CT
      const candidates = invoices.filter(i =>
        !i.ccKey &&
        i.ngay === r.payload.ngay &&
        i.congtrinh === r.payload.congtrinh &&
        (i.thanhtien||i.tien||0) === Math.round(r.payload.tien * r.payload.sl)
      );
      if(!candidates.length) return;

      // Fuzzy match nội dung ≥ 70%
      const nd = r.payload.nd.toLowerCase().trim();
      candidates.forEach(inv => {
        const sim = _strSimilarity(nd, (inv.nd||'').toLowerCase().trim());
        if(sim >= 0.7 || (nd === '' && (inv.nd||'') === '')) {
          dupRows.push({
            newRow: r,
            existing: inv,
            similarity: sim,
            isExact: sim >= 0.99
          });
        }
      });
    });

    if(dupRows.length > 0) {
      _showDupModal(dupRows, rows);
      return; // Dừng lại — chờ user quyết định
    }
  }

  // ── Thực sự lưu ────────────────────────────────────────────
  _doSaveRows(rows);
}

// ── Fuzzy string similarity (Dice coefficient) ───────────────
// Trả về 0.0 → 1.0. Không cần thư viện ngoài.
function _strSimilarity(a, b) {
  if(a === b) return 1;
  if(!a || !b) return 0;
  if(a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const getBigrams = s => {
    const set = new Map();
    for(let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i+2);
      set.set(bg, (set.get(bg)||0) + 1);
    }
    return set;
  };
  const aMap = getBigrams(a);
  const bMap = getBigrams(b);
  let intersection = 0;
  aMap.forEach((cnt, bg) => {
    if(bMap.has(bg)) intersection += Math.min(cnt, bMap.get(bg));
  });
  return (2 * intersection) / (a.length - 1 + b.length - 1);
}

// ── Hiển thị modal cảnh báo trùng ────────────────────────────
function _showDupModal(dupRows, allRows) {
  const overlay = document.getElementById('dup-modal-overlay');
  const body    = document.getElementById('dup-modal-body');
  const sub     = document.getElementById('dup-modal-subtitle');

  // Lưu allRows để forceSave dùng lại
  overlay._allRows = allRows;

  sub.textContent = `Tìm thấy ${dupRows.length} hóa đơn có thể bị trùng`;

  const numFmtLocal = n => n ? n.toLocaleString('vi-VN') + 'đ' : '0đ';
  body.innerHTML = dupRows.map(d => {
    const pct     = Math.round(d.similarity * 100);
    const badge   = d.isExact
      ? '<span class="dup-badge dup-badge-exact">Trùng hoàn toàn</span>'
      : `<span class="dup-badge dup-badge-fuzzy">Giống ${pct}%</span>`;
    const existTime = d.existing._ts
      ? new Date(d.existing._ts).toLocaleString('vi-VN')
      : d.existing.ngay || '';
    return `<div class="dup-item">
      <div style="font-size:11px;font-weight:700;color:#f57f17;margin-bottom:6px">
        HĐ MỚI ${badge}
      </div>
      <div class="dup-item-row">
        <span class="dup-item-label">Ngày</span>
        <span class="dup-item-val">${d.newRow.payload.ngay}</span>
      </div>
      <div class="dup-item-row">
        <span class="dup-item-label">Công trình</span>
        <span class="dup-item-val">${d.newRow.payload.congtrinh}</span>
      </div>
      <div class="dup-item-row">
        <span class="dup-item-label">Số tiền</span>
        <span class="dup-item-val" style="color:var(--red);font-family:'IBM Plex Mono',monospace">
          ${numFmtLocal(Math.round(d.newRow.payload.tien * d.newRow.payload.sl))}
        </span>
      </div>
      <div class="dup-item-row">
        <span class="dup-item-label">Nội dung</span>
        <span class="dup-item-val">${d.newRow.payload.nd||'(trống)'}</span>
      </div>
      <div style="margin-top:8px;padding-top:8px;border-top:1px dashed #ffe082;font-size:11px;color:#888">
        ↑ Trùng với HĐ đã lưu lúc ${existTime}:
        <span style="color:#555;font-weight:600">${d.existing.nd||'(trống)'}</span>
      </div>
    </div>`;
  }).join('');

  overlay.classList.add('open');
}

function closeDupModal() {
  document.getElementById('dup-modal-overlay').classList.remove('open');
}

function forceSaveAll() {
  closeDupModal();
  const overlay = document.getElementById('dup-modal-overlay');
  const allRows = overlay._allRows;
  if(allRows) _doSaveRows(allRows);
}

// ── Hàm lưu thực sự (dùng chung cho cả normal và force) ──────
function _doSaveRows(rows) {
  let saved = 0, updated = 0;
  rows.forEach(({tr, editId, payload}) => {
    const p = {
      ngay: payload.ngay, congtrinh: payload.congtrinh, loai: payload.loai,
      nguoi: payload.nguoi, ncc: payload.ncc, nd: payload.nd,
      tien: payload.tien,
      sl: payload.sl !== 1 ? payload.sl : undefined,
      thanhtien: Math.round(payload.tien * payload.sl)
    };
    if(editId) {
      const idx = invoices.findIndex(i => String(i.id) === String(editId));
      if(idx >= 0) { invoices[idx] = {...invoices[idx], ...p, _ts: Date.now()}; updated++; }
    } else {
      invoices.unshift({id: Date.now() + Math.random(), _ts: Date.now(), ...p});
      saved++;
    }
    tr.style.background = '#f0fff4';
  });

  save('inv_v3', invoices);
  buildYearSelect(); updateTop();

  if(updated > 0 && saved === 0) toast(`✅ Đã cập nhật ${updated} hóa đơn!`, 'success');
  else if(saved > 0 && updated === 0) toast(`✅ Đã lưu ${saved} hóa đơn!`, 'success');
  else toast(`✅ Đã lưu ${saved} mới, cập nhật ${updated} hóa đơn!`, 'success');

  // Render bảng HĐ trong ngày
  renderTodayInvoices();
}

// ══════════════════════════════
//  ALL PAGE
// ══════════════════════════════
function buildFilters() {
  const yearInvs = invoices.filter(i=>inActiveYear(i.ngay));
  // Dropdown CT: lọc mềm — CT có bất kỳ phát sinh (HĐ/CC/Ứng) trong năm
  const allCts = [...new Set(invoices.map(i=>i.congtrinh).filter(Boolean))].sort();
  const cts = allCts.filter(ct => _entityInYear(ct, 'ct'));
  const loais = [...new Set(yearInvs.map(i=>i.loai))].filter(Boolean).sort();
  const months = [...new Set(yearInvs.map(i=>i.ngay?.slice(0,7)))].filter(Boolean).sort().reverse();
  const ctSel=document.getElementById('f-ct'); const cv=ctSel.value;
  ctSel.innerHTML='<option value="">Tất cả công trình</option>'+cts.map(c=>`<option ${c===cv?'selected':''} value="${x(c)}">${x(c)}</option>`).join('');
  const lSel=document.getElementById('f-loai'); const lv=lSel.value;
  lSel.innerHTML='<option value="">Tất cả loại</option>'+loais.map(l=>`<option ${l===lv?'selected':''} value="${x(l)}">${x(l)}</option>`).join('');
  const mSel=document.getElementById('f-month'); const mv=mSel.value;
  mSel.innerHTML='<option value="">Tất cả tháng</option>'+months.map(m=>`<option ${m===mv?'selected':''} value="${m}">${m}</option>`).join('');
}

function filterAndRender() {
  curPage=1;
  const q=document.getElementById('search').value.toLowerCase();
  const fCt=document.getElementById('f-ct').value;
  const fLoai=document.getElementById('f-loai').value;
  const fMonth=document.getElementById('f-month').value;
  filteredInvs = invoices.filter(inv => {
    if(!inActiveYear(inv.ngay)) return false;
    if(fCt && inv.congtrinh!==fCt) return false;
    if(fLoai && inv.loai!==fLoai) return false;
    if(fMonth && !inv.ngay.startsWith(fMonth)) return false;
    if(q) { const t=[inv.ngay,inv.congtrinh,inv.loai,inv.nguoi,inv.sohd,inv.nd].join(' ').toLowerCase(); if(!t.includes(q)) return false; }
    return true;
  });
  // Sort: HĐ mới sửa/thêm trước (dùng _ts timestamp), rồi theo ngày giảm dần
  filteredInvs.sort((a,b)=>{
    const ta = a._ts||0, tb2 = b._ts||0;
    if(ta!==tb2) return tb2-ta;
    if(b.ngay!==a.ngay) return (b.ngay||'').localeCompare(a.ngay||'');
    return 0;
  });
  renderTable();
}

function renderTable() {
  const tbody=document.getElementById('all-tbody');
  const start=(curPage-1)*PG;
  const paged=filteredInvs.slice(start,start+PG);
  const sumTT=filteredInvs.reduce((s,i)=>s+(i.thanhtien||i.tien||0),0);
  if(!paged.length) {
    tbody.innerHTML=`<tr class="empty-row"><td colspan="10">Không có hóa đơn nào</td></tr>`;
    document.getElementById('pagination').innerHTML=''; return;
  }
  tbody.innerHTML = paged.map(inv=>{
    return `<tr>
    <td style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--ink2)">${inv.ngay}</td>
    <td style="font-weight:600;font-size:12px;max-width:220px">${x(inv.congtrinh)}</td>
    <td><span class="tag tag-gold">${x(inv.loai)}</span></td>
    <td class="hide-mobile" style="color:var(--ink2)">${x(inv.nguoi||'—')}</td>
    <td class="hide-mobile" style="color:var(--ink2)">${x(inv.ncc||'—')}</td>
    <td style="color:var(--ink2);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${x(inv.nd)}">${x(inv.nd||'—')}</td>
    <td class="amount-td" title="Đơn giá: ${numFmt(inv.tien||0)}${inv.sl&&inv.sl!==1?' × '+inv.sl:''}">${numFmt(inv.thanhtien||inv.tien||0)}</td>
    <td style="white-space:nowrap"><button class="btn btn-danger btn-sm" onclick="delInvoice('${inv.id}')">✕</button></td>
  </tr>`;}).join('');

  const tp=Math.ceil(filteredInvs.length/PG);
  let pag=`<span>${filteredInvs.length} hóa đơn · Tổng: <strong style="color:var(--gold);font-family:'IBM Plex Mono',monospace">${fmtS(sumTT)}</strong></span>`;
  if(tp>1) {
    pag+='<div class="page-btns">';
    for(let p=1;p<=Math.min(tp,10);p++) pag+=`<button class="page-btn ${p===curPage?'active':''}" onclick="goTo(${p})">${p}</button>`;
    if(tp>10) pag+=`<span style="padding:4px 6px;color:var(--ink3)">...${tp}</span>`;
    pag+='</div>';
  }
  document.getElementById('pagination').innerHTML=pag;
}

function goTo(p) { curPage=p; renderTable(); }

function delInvoice(id) {
  if(!confirm('Xóa hóa đơn này? (Có thể khôi phục từ Thùng Rác)')) return;
  const inv=invoices.find(i=>String(i.id)===String(id));
  if(inv) trashAdd({...inv});
  invoices=invoices.filter(i=>String(i.id)!==String(id));
  save('inv_v3',invoices); updateTop(); buildFilters(); filterAndRender(); renderTrash();
  toast('Đã xóa (có thể khôi phục trong Thùng Rác)');
}
function editCCInvoice(id) {
  const inv=invoices.find(i=>String(i.id)===String(id));
  if(!inv||!inv.ccKey) return;
  const parts=inv.ccKey.split('|');
  const fromDate=parts[1], ct=parts[2];

  // 1. Chuyển tab — dùng goPage chuẩn
  const navBtn=document.querySelector('.nav-btn[data-page="chamcong"]');
  goPage(navBtn,'chamcong');
  window.scrollTo({top:0,behavior:'smooth'});

  // 2. Set tuần đúng (snap về CN của tuần đó)
  const sunISO=snapToSunday(fromDate);
  const satISO=ccSaturdayISO(sunISO);
  document.getElementById('cc-from').value=sunISO;
  document.getElementById('cc-to').value=satISO;
  document.getElementById('cc-week-label').textContent='Tuần: '+weekLabel(sunISO);
  // Tính lại offset
  const thisSun=ccSundayISO(0);
  const [ty,tm,td]=thisSun.split('-').map(Number);
  const [fy,fm,fd]=sunISO.split('-').map(Number);
  ccOffset=Math.round((new Date(fy,fm-1,fd)-new Date(ty,tm-1,td))/(7*86400000));

  // 3. Set công trình và load bảng (sau khi goPage đã populate select)
  setTimeout(()=>{
    const ctSel=document.getElementById('cc-ct-sel');
    if(ctSel){
      if(![...ctSel.options].find(o=>o.value===ct)){
        const o=document.createElement('option');o.value=ct;o.textContent=ct;ctSel.appendChild(o);
      }
      ctSel.value=ct;
    }
    loadCCWeekForm();
    toast('✏️ Đang xem tuần '+viShort(sunISO)+' — '+ct,'success');
  },50);
}
function editManualInvoice(id) {
  const inv=invoices.find(i=>String(i.id)===String(id));
  if(!inv) return;
  // Chuyển sang tab Nhập HĐ
  const navBtn=document.querySelector('.nav-btn[data-page="nhap"]');
  goPage(navBtn,'nhap');
  window.scrollTo({top:0,behavior:'smooth'});
  setTimeout(()=>{
    // Set ngày và clear bảng, tạo 1 hàng với dữ liệu HĐ cũ
    document.getElementById('entry-date').value=inv.ngay||today();
    document.getElementById('entry-tbody').innerHTML='';
    addRow({loai:inv.loai,congtrinh:inv.congtrinh,sl:inv.sl||undefined,nguoi:inv.nguoi||'',ncc:inv.ncc||'',nd:inv.nd||'',tien:inv.tien||0});
    // Đánh dấu edit mode — saveAllRows sẽ UPDATE thay vì thêm mới
    const row=document.querySelector('#entry-tbody tr');
    if(row) row.dataset.editId=String(inv.id);
    calcSummary();
    toast('✏️ Chỉnh sửa rồi nhấn 💾 Cập Nhật','success');
  },100);
}
function showEditInvoiceModal(inv) {
  let ov=document.getElementById('edit-inv-overlay');
  if(!ov){ov=document.createElement('div');ov.id='edit-inv-overlay';ov.style.cssText='position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px';ov.onclick=function(e){if(e.target===this)this.remove();};document.body.appendChild(ov);}
  const ctOpts=cats.congTrinh.map(v=>`<option value="${x(v)}" ${v===inv.congtrinh?'selected':''}>${x(v)}</option>`).join('');
  const loaiOpts=cats.loaiChiPhi.map(v=>`<option value="${x(v)}" ${v===inv.loai?'selected':''}>${x(v)}</option>`).join('');
  ov.innerHTML=`<div style="background:#fff;border-radius:14px;padding:24px;width:min(480px,96vw);box-shadow:0 8px 32px rgba(0,0,0,.2);font-family:'IBM Plex Sans',sans-serif" onclick="event.stopPropagation()">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h3 style="font-size:16px;font-weight:700">✏️ Sửa Hóa Đơn</h3>
      <button onclick="document.getElementById('edit-inv-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#888">✕</button>
    </div>
    <div style="display:grid;gap:10px">
      <div><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:3px">Ngày</label><input id="ei-ngay" type="date" value="${inv.ngay}" style="width:100%;padding:8px 10px;border:1.5px solid #ddd;border-radius:7px;font-family:inherit;font-size:13px;outline:none"></div>
      <div><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:3px">Loại Chi Phí</label><select id="ei-loai" style="width:100%;padding:8px 10px;border:1.5px solid #ddd;border-radius:7px;font-family:inherit;font-size:13px;outline:none"><option value="">-- Chọn --</option>${loaiOpts}</select></div>
      <div><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:3px">Công Trình</label><select id="ei-ct" style="width:100%;padding:8px 10px;border:1.5px solid #ddd;border-radius:7px;font-family:inherit;font-size:13px;outline:none"><option value="">-- Chọn --</option>${ctOpts}</select></div>
      <div><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:3px">Người TH</label><input id="ei-nguoi" type="text" value="${x(inv.nguoi||'')}" list="ei-dl" style="width:100%;padding:8px 10px;border:1.5px solid #ddd;border-radius:7px;font-family:inherit;font-size:13px;outline:none"><datalist id="ei-dl">${cats.nguoiTH.map(v=>`<option value="${x(v)}">`).join('')}</datalist></div>
      <div><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:3px">Nội Dung</label><input id="ei-nd" type="text" value="${x(inv.nd||'')}" style="width:100%;padding:8px 10px;border:1.5px solid #ddd;border-radius:7px;font-family:inherit;font-size:13px;outline:none"></div>
      <div><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:3px">Số Tiền (đ)</label><input id="ei-tien" type="number" value="${inv.tien||0}" style="width:100%;padding:8px 10px;border:1.5px solid #ddd;border-radius:7px;font-family:inherit;font-size:13px;outline:none"></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:16px">
      <button onclick="document.getElementById('edit-inv-overlay').remove()" style="flex:1;padding:10px;border-radius:8px;border:1.5px solid #ddd;background:#fff;font-family:inherit;font-size:13px;cursor:pointer">Hủy</button>
      <button onclick="saveEditInvoice('${inv.id}')" style="flex:2;padding:10px;border-radius:8px;border:none;background:#1a1814;color:#fff;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer">💾 Cập Nhật</button>
    </div>
  </div>`;
  ov.style.display='flex';
}
function saveEditInvoice(id) {
  const idx=invoices.findIndex(i=>String(i.id)===String(id));
  if(idx<0) return;
  const tien=parseInt(document.getElementById('ei-tien').value)||0;
  invoices[idx]={...invoices[idx],ngay:document.getElementById('ei-ngay').value,loai:document.getElementById('ei-loai').value,congtrinh:document.getElementById('ei-ct').value,nguoi:document.getElementById('ei-nguoi').value.trim(),nd:document.getElementById('ei-nd').value.trim(),tien,thanhtien:tien,_ts:Date.now()};
  save('inv_v3',invoices);
  document.getElementById('edit-inv-overlay').remove();
  buildFilters(); filterAndRender(); updateTop();
  toast('✅ Đã cập nhật hóa đơn!','success');
}

// ══════════════════════════════
//  CT PAGE
// ══════════════════════════════
function renderCtPage() {
  const grid=document.getElementById('ct-grid');
  const map={};
  invoices.forEach(inv=>{
    if(!inActiveYear(inv.ngay)) return;
    if(!map[inv.congtrinh]) map[inv.congtrinh]={total:0,count:0,byLoai:{}};
    map[inv.congtrinh].total+=(inv.thanhtien||inv.tien||0); map[inv.congtrinh].count++;
    map[inv.congtrinh].byLoai[inv.loai]=(map[inv.congtrinh].byLoai[inv.loai]||0)+(inv.thanhtien||inv.tien||0);
  });
  const sortBy=(document.getElementById('ct-sort')?.value)||'value';
  const entries=Object.entries(map).sort((a,b)=>
    sortBy==='name' ? a[0].localeCompare(b[0],'vi') : b[1].total-a[1].total
  );
  if(!entries.length){grid.innerHTML=`<div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--ink3);font-size:14px">Chưa có dữ liệu</div>`;return;}
  grid.innerHTML=entries.map(([ct,d])=>{
    const rows=Object.entries(d.byLoai).sort((a,b)=>b[1]-a[1]);
    return `<div class="ct-card" onclick="showCtModal(${JSON.stringify(ct)})">
      <div class="ct-card-head">
        <div><div class="ct-card-name">${x(ct)}</div><div class="ct-card-count">${d.count} hóa đơn</div></div>
        <div class="ct-card-total">${fmtS(d.total)}</div>
      </div>
      <div class="ct-card-body">
        ${rows.slice(0,6).map(([l,v])=>`<div class="ct-loai-row"><span class="ct-loai-name">${x(l)}</span><span class="ct-loai-val">${fmtS(v)}</span></div>`).join('')}
        ${rows.length>6?`<div style="font-size:11px;color:var(--ink3);text-align:right;padding-top:6px">+${rows.length-6} loại khác...</div>`:''}
      </div>
    </div>`;
  }).join('');
}

function showCtModal(ctName) {
  const invs=invoices.filter(i=>i.congtrinh===ctName && inActiveYear(i.ngay));
  document.getElementById('modal-title').textContent='🏗️ '+ctName;
  const byLoai={};
  invs.forEach(inv=>{ if(!byLoai[inv.loai])byLoai[inv.loai]=[]; byLoai[inv.loai].push(inv); });
  const total=invs.reduce((s,i)=>s+(i.thanhtien||i.tien||0),0);
  let html=`<div style="display:flex;gap:12px;margin-bottom:18px">
    <div style="flex:1;background:var(--bg);border-radius:8px;padding:12px"><div style="font-size:10px;color:var(--ink3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Tổng HĐ</div><div style="font-size:22px;font-weight:700">${invs.length}</div></div>
    <div style="flex:2;background:var(--green-bg);border-radius:8px;padding:12px"><div style="font-size:10px;color:var(--ink3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Tổng Chi Phí</div><div style="font-size:20px;font-weight:700;font-family:'IBM Plex Mono',monospace;color:var(--green)">${fmtM(total)}</div></div>
  </div>`;
  Object.entries(byLoai).forEach(([loai,invList])=>{
    const lt=invList.reduce((s,i)=>s+(i.thanhtien||i.tien||0),0);
    html+=`<div style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 12px;background:var(--gold-bg);border-radius:6px;margin-bottom:6px">
        <span class="tag tag-gold">${x(loai)}</span>
        <span style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:var(--gold)">${fmtM(lt)}</span>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr>${['Ngày','Người TH','Nội Dung','Thành Tiền'].map((h,i)=>`<th style="padding:5px 8px;background:#f3f1ec;font-size:10px;font-weight:700;color:var(--ink3);text-transform:uppercase;text-align:${i===3?'right':'left'}">${h}</th>`).join('')}</tr></thead>
        <tbody>${invList.map(i=>`<tr style="border-bottom:1px solid var(--line)">
          <td style="padding:6px 8px;font-family:'IBM Plex Mono',monospace;color:var(--ink2)">${i.ngay}</td>
          <td style="padding:6px 8px;color:var(--ink2)">${x(i.nguoi||'—')}</td>
          <td style="padding:6px 8px;color:var(--ink2)">${x(i.nd||'—')}</td>
          <td style="padding:6px 8px;text-align:right;font-family:'IBM Plex Mono',monospace;font-weight:600;color:var(--green)">${numFmt(i.thanhtien||i.tien||0)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
  });
  document.getElementById('modal-body').innerHTML=html;
  document.getElementById('ct-modal').classList.add('open');
}
function closeModal(){ document.getElementById('ct-modal').classList.remove('open'); }
document.getElementById('ct-modal').addEventListener('click',e=>{ if(e.target===e.currentTarget)closeModal(); });

// ══════════════════════════════
//  SETTINGS
// ══════════════════════════════
function renderSettings() {
  const grid=document.getElementById('dm-grid');
  grid.innerHTML='';
  CATS.forEach(cfg=>{
    const list=cats[cfg.id];
    const card=document.createElement('div');
    card.className='settings-card';
    card.innerHTML=`
      <div class="settings-card-head">
        <div class="settings-card-title">${cfg.title} <span style="font-size:11px;font-weight:400;color:var(--ink3)">(${list.length})</span></div>
      </div>
      <div class="settings-list" id="sl-${cfg.id}">
        ${list.map((item,idx)=>cfg.id==='congNhan'?renderCNItem(item,idx):renderItem(cfg.id,item,idx)).join('')}
      </div>
      <div class="settings-add">
        <input type="text" id="sa-${cfg.id}" placeholder="Thêm mới..." onkeydown="if(event.key==='Enter')addItem('${cfg.id}')">
        <button class="btn btn-gold btn-sm" onclick="addItem('${cfg.id}')">+ Thêm</button>
      </div>`;
    grid.appendChild(card);
  });
  // Render panel sao lưu
  renderBackupList();
}

function renderItem(catId,item,idx) {
  const inUse = isItemInUse(catId, item);
  return `<div class="settings-item" id="si-${catId}-${idx}" style="${inUse?'background:rgba(26,122,69,0.04)':''}">
    <span class="s-name" id="sn-${catId}-${idx}" ondblclick="startEdit('${catId}',${idx})">${x(item)}</span>
    ${inUse?`<span title="Đang được sử dụng" style="font-size:10px;color:#1a7a45;padding:2px 5px;background:rgba(26,122,69,0.1);border-radius:3px;margin-right:2px">✓ đang dùng</span>`:''}
    <input class="s-edit-input" id="se-${catId}-${idx}" value="${x(item)}"
      onblur="finishEdit('${catId}',${idx})"
      onkeydown="if(event.key==='Enter')finishEdit('${catId}',${idx});if(event.key==='Escape')cancelEdit('${catId}',${idx})">
    <button class="btn btn-outline btn-sm btn-icon" onclick="startEdit('${catId}',${idx})" title="Sửa tên">✏️</button>
    <button class="btn ${inUse?'btn-outline':'btn-danger'} btn-sm btn-icon" onclick="delItem('${catId}',${idx})"
      title="${inUse?'Đang được sử dụng — không thể xóa':'Xóa'}" ${inUse?'style="opacity:0.4;cursor:not-allowed"':''}>✕</button>
  </div>`;
}

// ── Render item Công Nhân với cột T/P ────────────────────────────
function renderCNItem(name, idx) {
  const role = cnRoles[name] || '';
  const inUse = ccData.some(w => w.workers && w.workers.some(wk => wk.name === name));
  return `<div class="settings-item" id="si-congNhan-${idx}" style="${inUse?'background:rgba(26,122,69,0.04)':''}">
    <span class="s-name" id="sn-congNhan-${idx}" ondblclick="startEdit('congNhan',${idx})">${x(name)}</span>
    ${inUse?`<span title="Đang được sử dụng" style="font-size:10px;color:#1a7a45;padding:2px 5px;background:rgba(26,122,69,0.1);border-radius:3px;margin-right:2px">✓ đang dùng</span>`:''}
    <input class="s-edit-input" id="se-congNhan-${idx}" value="${x(name)}"
      onblur="finishEdit('congNhan',${idx})"
      onkeydown="if(event.key==='Enter')finishEdit('congNhan',${idx});if(event.key==='Escape')cancelEdit('congNhan',${idx})">
    <select onchange="updateCNRole(${idx},this.value)"
      style="margin:0 4px;padding:2px 6px;border:1px solid var(--line2);border-radius:4px;font-size:12px;font-weight:700;cursor:pointer;min-width:44px"
      title="Vai trò (C=Cái, T=Thợ, P=Phụ)">
      <option value="" ${!role?'selected':''}>—</option>
      <option value="C" ${role==='C'?'selected':''}>C</option>
      <option value="T" ${role==='T'?'selected':''}>T</option>
      <option value="P" ${role==='P'?'selected':''}>P</option>
    </select>
    <button class="btn btn-outline btn-sm btn-icon" onclick="startEdit('congNhan',${idx})" title="Sửa tên">✏️</button>
    <button class="btn ${inUse?'btn-outline':'btn-danger'} btn-sm btn-icon" onclick="delItem('congNhan',${idx})"
      title="${inUse?'Đang được sử dụng — không thể xóa':'Xóa'}" ${inUse?'style="opacity:0.4;cursor:not-allowed"':''}>✕</button>
  </div>`;
}

// ── Cập nhật vai trò CN từ Danh mục ──────────────────────────────
function updateCNRole(idx, role) {
  const name = cats.congNhan[idx];
  if (!name) return;
  cnRoles[name] = role;
  save('cat_cn_roles', cnRoles);
  syncCNRoles(name, role);
  toast(`✅ Đã cập nhật vai trò "${name}" → ${role||'—'}`, 'success');
}

// ── Đồng bộ vai trò vào ccData (năm hiện tại + năm trước) ────────
function syncCNRoles(name, role) {
  const curYear = activeYear || new Date().getFullYear();
  const prevYear = curYear - 1;
  let changed = false;
  ccData.forEach(week => {
    const yr = parseInt((week.fromDate || '').slice(0, 4));
    if (yr !== curYear && yr !== prevYear) return;
    (week.workers || []).forEach(wk => {
      if (wk.name === name) { wk.role = role; changed = true; }
    });
  });
  if (changed) save('cc_v2', ccData);
}

function startEdit(catId,idx) {
  document.getElementById(`sn-${catId}-${idx}`).classList.add('off');
  const e=document.getElementById(`se-${catId}-${idx}`); e.classList.add('on'); e.focus(); e.select();
}
function cancelEdit(catId,idx) {
  document.getElementById(`se-${catId}-${idx}`).classList.remove('on');
  document.getElementById(`sn-${catId}-${idx}`).classList.remove('off');
}
function finishEdit(catId,idx) {
  const inp=document.getElementById(`se-${catId}-${idx}`);
  const newVal=inp.value.trim();
  if(!newVal){cancelEdit(catId,idx);return;}
  const old=cats[catId][idx];
  cats[catId][idx]=newVal;
  // update invoices
  const cfg=CATS.find(c=>c.id===catId);
  if(cfg&&cfg.refField) {
    invoices.forEach(inv=>{ if(inv[cfg.refField]===old) inv[cfg.refField]=newVal; });
    // also update ung records tp field when nguoiTH or nhaCungCap renamed
    if(catId==='nguoiTH'||catId==='nhaCungCap') ungRecords.forEach(r=>{ if(r.tp===old) r.tp=newVal; });
    if(catId==='congTrinh') ungRecords.forEach(r=>{ if(r.congtrinh===old) r.congtrinh=newVal; });
  }
  // I.1: Cập nhật ccData + tbData khi đổi tên CT (giới hạn 2 năm)
  if (catId === 'congTrinh') {
    const curYear = activeYear || new Date().getFullYear();
    const prevYear = curYear - 1;
    let ccCh = false, tbCh = false;
    ccData.forEach(w => {
      const yr = parseInt((w.fromDate || '').slice(0, 4));
      if ((yr === curYear || yr === prevYear) && w.ct === old) { w.ct = newVal; ccCh = true; }
    });
    tbData.forEach(r => {
      const yr = parseInt((r.ngay || '').slice(0, 4));
      if ((yr === curYear || yr === prevYear) && r.ct === old) { r.ct = newVal; tbCh = true; }
    });
    if (ccCh) save('cc_v2', ccData);
    if (tbCh) { save('tb_v1', tbData); tbPopulateSels && tbPopulateSels(); tbRenderList && tbRenderList(); }
  }
  saveCats(catId); save('inv_v3',invoices); save('ung_v1',ungRecords);
  renderSettings(); updateTop();
  // Cập nhật lại tab Tổng CP nếu đang đổi tên công trình
  if (catId === 'congTrinh') { renderCtPage(); buildFilters(); filterAndRender(); }
  toast('✅ Đã cập nhật "'+newVal+'"','success');
}
function addItem(catId) {
  const inp=document.getElementById(`sa-${catId}`);
  const val=inp.value.trim();
  if(!val) return;
  if(cats[catId].includes(val)){toast('Mục này đã tồn tại!','error');return;}
  cats[catId].push(val); saveCats(catId); inp.value='';
  renderSettings(); rebuildEntrySelects(); rebuildUngSelects();
  toast(`✅ Đã thêm "${val}"`,'success');
}
function isItemInUse(catId, item) {
  const cfg = CATS.find(c=>c.id===catId);
  if(!cfg || !cfg.refField) {
    // congNhan — kiểm tra trong ccData
    if(catId==='congNhan') return ccData.some(w=>w.workers&&w.workers.some(wk=>wk.name===item));
    return false;
  }
  // Kiểm tra trong invoices
  if(invoices.some(i=>(i[cfg.refField]||'')=== item)) return true;
  // Kiểm tra trong ungRecords (tp field)
  if(catId==='thauPhu'||catId==='nhaCungCap') {
    if(ungRecords.some(r=>(r.tp||'')=== item)) return true;
  }
  // Kiểm tra congTrinh trong cc + ung
  if(catId==='congTrinh') {
    if(ungRecords.some(r=>(r.congtrinh||'')=== item)) return true;
    if(ccData.some(w=>(w.ct||'')=== item)) return true;
  }
  return false;
}

function delItem(catId,idx) {
  const item=cats[catId][idx];
  if(isItemInUse(catId, item)) {
    toast(`⚠️ Không thể xóa "${item}" — đang được sử dụng trong dữ liệu!`, 'error');
    return;
  }
  if(!confirm(`Xóa "${item}" khỏi danh mục?`)) return;
  cats[catId].splice(idx,1); saveCats(catId);
  renderSettings(); rebuildEntrySelects(); rebuildUngSelects();
  toast(`Đã xóa "${item}"`);
}

function rebuildEntrySelects() {
  document.querySelectorAll('#entry-tbody [data-f="ct"]').forEach(sel=>{
    if(sel.tagName==='SELECT'){
      const cur=sel.value;
      sel.innerHTML=`<option value="">-- Chọn --</option>`+cats.congTrinh.map(v=>`<option value="${x(v)}" ${v===cur?'selected':''}>${x(v)}</option>`).join('');
    }
  });
  document.querySelectorAll('#entry-tbody [data-f="loai"]').forEach(sel=>{
    if(sel.tagName==='SELECT'){
      const cur=sel.value;
      sel.innerHTML=`<option value="">-- Chọn --</option>`+cats.loaiChiPhi.map(v=>`<option value="${x(v)}" ${v===cur?'selected':''}>${x(v)}</option>`).join('');
    }
  });
  // rebuild datalists for nguoi and ncc
  document.querySelectorAll('#entry-tbody [data-f="nguoi"]').forEach(inp=>{
    const dl=document.getElementById(inp.getAttribute('list'));
    if(dl) dl.innerHTML=cats.nguoiTH.map(v=>`<option value="${x(v)}">`).join('');
  });
  document.querySelectorAll('#entry-tbody [data-f="ncc"]').forEach(inp=>{
    const dl=document.getElementById(inp.getAttribute('list'));
    if(dl) dl.innerHTML=cats.nhaCungCap.map(v=>`<option value="${x(v)}">`).join('');
  });
}

// ══════════════════════════════
//  TIỀN ỨNG - ENTRY TABLE
// ══════════════════════════════
let ungRecords = load('ung_v1', []);
let filteredUng = [];
let ungPage = 1;

function initUngTable(n=4) {
  document.getElementById('ung-tbody').innerHTML='';
  for(let i=0;i<n;i++) addUngRow();
  calcUngSummary();
}

function initUngTableIfEmpty() {
  if(document.getElementById('ung-tbody').children.length===0) initUngTable(4);
}

function addUngRows(n) { for(let i=0;i<n;i++) addUngRow(); }

function addUngRow(d={}) {
  const tbody = document.getElementById('ung-tbody');
  const num = tbody.children.length + 1;
  const dlTp  = 'dlTP'  + num + Date.now();
  const ctOpts = `<option value="">-- Chọn --</option>` + cats.congTrinh.map(v=>`<option value="${x(v)}" ${v===(d.congtrinh||'')?'selected':''}>${x(v)}</option>`).join('');

  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="row-num">${num}</td>
    <td>
      <input class="cell-input" data-f="tp" list="${dlTp}" value="${x(d.tp||'')}" placeholder="Nhập hoặc chọn...">
      <datalist id="${dlTp}">${[...cats.thauPhu,...cats.nhaCungCap].map(v=>`<option value="${x(v)}">`).join('')}</datalist>
    </td>
    <td><select class="cell-input" data-f="ct">${ctOpts}</select></td>
    <td><input class="cell-input right tien-input" data-f="tien" data-raw="${d.tien||''}" placeholder="0" value="${d.tien?numFmt(d.tien):''}"></td>
    <td><input class="cell-input" data-f="nd" value="${x(d.nd||'')}" placeholder="Nội dung..."></td>
    <td><button class="del-btn" onclick="delUngRow(this)">✕</button></td>
  `;

  const tienInput = tr.querySelector('[data-f="tien"]');
  tienInput.addEventListener('input', function() {
    const raw = this.value.replace(/[.,]/g,'');
    this.dataset.raw = raw;
    if(raw) this.value = numFmt(parseInt(raw,10)||0);
    calcUngSummary();
  });
  tienInput.addEventListener('focus', function() { this.value = this.dataset.raw || ''; });
  tienInput.addEventListener('blur',  function() {
    const raw = parseInt(this.dataset.raw||'0',10)||0;
    this.value = raw ? numFmt(raw) : '';
  });

  tr.querySelectorAll('input,select').forEach(el => {
    if(el.dataset.f!=='tien') { el.addEventListener('input', calcUngSummary); el.addEventListener('change', calcUngSummary); }
  });
  tbody.appendChild(tr);
}

function delUngRow(btn) { btn.closest('tr').remove(); renumberUng(); calcUngSummary(); }

function renumberUng() {
  document.querySelectorAll('#ung-tbody tr').forEach((tr,i) => { tr.querySelector('.row-num').textContent = i+1; });
}

function calcUngSummary() {
  let cnt=0, total=0;
  document.querySelectorAll('#ung-tbody tr').forEach(tr => {
    const tp = tr.querySelector('[data-f="tp"]')?.value||'';
    const tien = parseInt(tr.querySelector('[data-f="tien"]')?.dataset.raw||'0',10)||0;
    if(tp||tien>0) { cnt++; total+=tien; }
  });
  document.getElementById('ung-row-count').textContent=cnt;
  document.getElementById('ung-entry-total').textContent=fmtM(total);
}

function clearUngTable() {
  if(!confirm('Xóa toàn bộ bảng nhập tiền ứng?')) return;
  initUngTable(4);
}

function saveAllUngRows() {
  const date = document.getElementById('ung-date').value;
  if(!date) { toast('Vui lòng chọn ngày!','error'); return; }
  let saved=0, errRow=0;
  document.querySelectorAll('#ung-tbody tr').forEach(tr => {
    const tp = (tr.querySelector('[data-f="tp"]')?.value||'').trim();
    const tien = parseInt(tr.querySelector('[data-f="tien"]')?.dataset.raw||'0',10)||0;
    if(!tp&&!tien) return;
    if(!tp) { errRow++; tr.style.background='#fdecea'; return; }
    tr.style.background='';
    ungRecords.unshift({
      id: Date.now()+Math.random(), ngay:date,
      tp,
      congtrinh:(tr.querySelector('[data-f="ct"]')?.value||'').trim(),
      tien,
      nd:(tr.querySelector('[data-f="nd"]')?.value||'').trim()
    });
    saved++;
  });
  if(errRow>0) { toast(`${errRow} dòng thiếu Thầu Phụ/NCC (đánh dấu đỏ)!`,'error'); return; }
  if(saved===0) { toast('Không có dòng hợp lệ!','error'); return; }
  save('ung_v1', ungRecords);
  toast(`✅ Đã lưu ${saved} tiền ứng!`,'success');
  initUngTable(4);
  document.getElementById('ung-date').value = today();
}

// ══════════════════════════════
//  TIỀN ỨNG - ALL PAGE
// ══════════════════════════════
function buildUngFilters() {
  const tps    = [...new Set(ungRecords.map(i=>i.tp))].filter(Boolean).sort();
  const cts    = [...new Set(ungRecords.map(i=>i.congtrinh))].filter(Boolean).sort();
  const months = [...new Set(ungRecords.map(i=>i.ngay.slice(0,7)))].filter(Boolean).sort().reverse();

  const tpSel=document.getElementById('uf-tp'); const tv=tpSel.value;
  tpSel.innerHTML='<option value="">Tất cả TP/NCC</option>'+tps.map(v=>`<option ${v===tv?'selected':''} value="${x(v)}">${x(v)}</option>`).join('');
  const ctSel=document.getElementById('uf-ct'); const cv=ctSel.value;
  ctSel.innerHTML='<option value="">Tất cả công trình</option>'+cts.map(v=>`<option ${v===cv?'selected':''} value="${x(v)}">${x(v)}</option>`).join('');
  const mSel=document.getElementById('uf-month'); const mv=mSel.value;
  mSel.innerHTML='<option value="">Tất cả tháng</option>'+months.map(m=>`<option ${m===mv?'selected':''} value="${m}">${m}</option>`).join('');
}

function filterAndRenderUng() {
  ungPage=1;
  const q=document.getElementById('ung-search').value.toLowerCase();
  const fTp=document.getElementById('uf-tp').value;
  const fCt=document.getElementById('uf-ct').value;
  const fMonth=document.getElementById('uf-month').value;
  filteredUng = ungRecords.filter(r => {
    if(!inActiveYear(r.ngay)) return false;
    if(fTp && r.tp!==fTp) return false;
    if(fCt && r.congtrinh!==fCt) return false;
    if(fMonth && !r.ngay.startsWith(fMonth)) return false;
    if(q) { const t=[r.ngay,r.tp,r.congtrinh,r.nd].join(' ').toLowerCase(); if(!t.includes(q)) return false; }
    return true;
  });
  renderUngTable();
}

function renderUngTable() {
  const tbody=document.getElementById('ung-all-tbody');
  const start=(ungPage-1)*PG;
  const paged=filteredUng.slice(start,start+PG);
  const sumTien=filteredUng.reduce((s,r)=>s+r.tien,0);

  if(!paged.length) {
    tbody.innerHTML=`<tr class="empty-row"><td colspan="7">Không có dữ liệu tiền ứng nào</td></tr>`;
    document.getElementById('ung-pagination').innerHTML=''; return;
  }
  tbody.innerHTML = paged.map(r=>`<tr>
    <td style="text-align:center;padding:4px">
      <input type="checkbox" class="ung-row-chk" data-id="${r.id}"
        style="width:15px;height:15px;cursor:pointer">
    </td>
    <td style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--ink2)">${r.ngay}</td>
    <td style="font-weight:600;font-size:12px">${x(r.tp)}</td>
    <td style="color:var(--ink2)">${x(r.congtrinh||'—')}</td>
    <td style="color:var(--ink2);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${x(r.nd)}">${x(r.nd||'—')}</td>
    <td class="amount-td" style="color:var(--blue)">${numFmt(r.tien||0)}</td>
    <td><button class="btn btn-danger btn-sm" onclick="delUngRecord('${r.id}')">✕</button></td>
  </tr>`).join('');

  const tp2=Math.ceil(filteredUng.length/PG);
  let pag=`<span>${filteredUng.length} bản ghi · Tổng tiền ứng: <strong style="color:var(--blue);font-family:'IBM Plex Mono',monospace">${fmtS(sumTien)}</strong></span>`;
  if(tp2>1) {
    pag+='<div class="page-btns">';
    for(let p=1;p<=Math.min(tp2,10);p++) pag+=`<button class="page-btn ${p===ungPage?'active':''}" onclick="goUngTo(${p})">${p}</button>`;
    pag+='</div>';
  }
  document.getElementById('ung-pagination').innerHTML=pag;
}

function goUngTo(p) { ungPage=p; renderUngTable(); }

function delUngRecord(id) {
  if(!confirm('Xóa bản ghi tiền ứng này?')) return;
  ungRecords=ungRecords.filter(r=>String(r.id)!==String(id));
  save('ung_v1',ungRecords); buildUngFilters(); filterAndRenderUng();
  toast('Đã xóa bản ghi');
}

function rebuildUngSelects() {
  document.querySelectorAll('#ung-tbody [data-f="ct"]').forEach(sel=>{
    if(sel.tagName==='SELECT'){
      const cur=sel.value;
      sel.innerHTML=`<option value="">-- Chọn --</option>`+cats.congTrinh.map(v=>`<option value="${x(v)}" ${v===cur?'selected':''}>${x(v)}</option>`).join('');
    }
  });
  document.querySelectorAll('#ung-tbody [data-f="tp"]').forEach(inp=>{
    const dl=document.getElementById(inp.getAttribute('list'));
    if(dl) dl.innerHTML=[...cats.nguoiTH,...cats.nhaCungCap].map(v=>`<option value="${x(v)}">`).join('');
  });
}

function exportUngEntryCSV() {
  const rows=[['Thầu Phụ / Nhà CC','Công Trình','Số Tiền Ứng','Nội Dung']];
  document.querySelectorAll('#ung-tbody tr').forEach(tr=>{
    const tp=tr.querySelector('[data-f="tp"]')?.value||'';
    if(!tp) return;
    rows.push([tp,tr.querySelector('[data-f="ct"]')?.value||'',parseInt(tr.querySelector('[data-f="tien"]')?.dataset.raw||'0',10)||0,tr.querySelector('[data-f="nd"]')?.value||'']);
  });
  dlCSV(rows,'nhap_tien_ung_'+today()+'.csv');
}

function exportUngAllCSV() {
  const src=filteredUng.length>0?filteredUng:ungRecords;
  const rows=[['Ngày','Thầu Phụ / Nhà CC','Công Trình','Nội Dung','Số Tiền Ứng']];
  src.forEach(r=>rows.push([r.ngay,r.tp,r.congtrinh||'',r.nd||'',r.tien]));
  dlCSV(rows,'tien_ung_'+today()+'.csv');
}

// ══════════════════════════════
//  EXPORT
// ══════════════════════════════
function exportEntryCSV() {
  const rows=[['Loại Chi Phí','Công Trình','Người TH','Nhà Cung Cấp','Nội Dung','Số Tiền']];
  document.querySelectorAll('#entry-tbody tr').forEach(tr=>{
    const loai=tr.querySelector('[data-f="loai"]')?.value||'';
    const ct=tr.querySelector('[data-f="ct"]')?.value||'';
    if(!loai&&!ct) return;
    const tien=parseInt(tr.querySelector('[data-f="tien"]')?.dataset.raw||'0',10)||0;
    rows.push([loai,ct,tr.querySelector('[data-f="nguoi"]')?.value||'',tr.querySelector('[data-f="ncc"]')?.value||'',tr.querySelector('[data-f="nd"]')?.value||'',tien]);
  });
  dlCSV(rows,'nhap_'+today()+'.csv');
}
function exportAllCSV() {
  const src=filteredInvs.length>0?filteredInvs:invoices;
  const rows=[['Ngày','Công Trình','Loại Chi Phí','Người TH','Nhà Cung Cấp','Nội Dung','Số Tiền']];
  src.forEach(i=>rows.push([i.ngay,i.congtrinh,i.loai,i.nguoi,i.ncc||'',i.nd,i.tien||i.thanhtien||0]));
  dlCSV(rows,'hoa_don_'+today()+'.csv');
}
function dlCSV(rows,name) {
  const csv=rows.map(r=>r.map(c=>`"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));
  a.download=name; a.click();
}

// ══════════════════════════════
//  HELPERS
// ══════════════════════════════
function updateTop() {
  const total = invoices.filter(i=>inActiveYear(i.ngay)).reduce((s,i)=>s+(i.thanhtien||i.tien||0),0);
  document.getElementById('top-total').textContent=fmtS(total);
}
function numFmt(n){ if(!n&&n!==0)return''; return parseInt(n,10).toLocaleString('vi-VN'); }
function fmtM(n){ if(!n)return'0 đ'; return parseInt(n).toLocaleString('vi-VN')+' đ'; }
function fmtS(n){ if(!n)return'0'; if(n>=1e9)return(n/1e9).toFixed(3).replace(/\.?0+$/,'')+' tỷ'; if(n>=1e6)return(n/1e6).toFixed(1).replace(/\.0$/,'')+' tr'; if(n>=1e3)return(n/1e3).toFixed(0)+'k'; return n.toLocaleString('vi-VN'); }
// ── parseMoney: chuẩn hóa mọi dạng nhập tiền → số nguyên ─────
// Xử lý: "1.000.000", "1,000,000", "1000000", "1tr", "1.5tr", "2tỷ"
// Test: parseMoney("1.000.000")→1000000  parseMoney("1tr")→1000000
//       parseMoney("1,5tr")→1500000      parseMoney("2tỷ")→2000000000
function parseMoney(raw) {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === 'number') return Math.round(raw);
  const s = String(raw).trim().toLowerCase().replace(/\s+/g,'');
  if (!s) return 0;

  // Đơn vị tỷ/tr/k
  const unitMap = [
    [/^([\d,.]+)tỷ$/,   1e9],
    [/^([\d,.]+)ty$/,   1e9],
    [/^([\d,.]+)b$/,    1e9],
    [/^([\d,.]+)tr$/,   1e6],
    [/^([\d,.]+)m$/,    1e6],
    [/^([\d,.]+)k$/,    1e3],
  ];
  for (const [rx, mult] of unitMap) {
    const m = s.match(rx);
    if (m) {
      const num = parseFloat(m[1].replace(/[,.]/g, s.includes(',') && s.includes('.') ?
        (s.indexOf(',') < s.indexOf('.') ? (v => v===','?'':'.') : (v => v==='.'?'':'.')) :
        // Nếu chỉ có dấu '.' → dấu phân cách nghìn VN → xóa
        // Nếu chỉ có dấu ',' → dấu thập phân → giữ là '.'
        (m[1].includes(',') ? (v => v===','?'.':'') : (v => v==='.'?'':''))
      ));
      return Math.round(num * mult);
    }
  }

  // Dạng số thuần: xóa tất cả dấu phân cách nghìn
  // Logic: nếu có cả '.' và ',' → cái nào ở sau cùng là thập phân
  let clean = s;
  const lastDot   = clean.lastIndexOf('.');
  const lastComma = clean.lastIndexOf(',');

  if (lastDot > -1 && lastComma > -1) {
    // Có cả 2: cái ở sau cùng là thập phân
    if (lastDot > lastComma) {
      clean = clean.replace(/,/g, '');           // ',' = nghìn
    } else {
      clean = clean.replace(/\./g, '').replace(',', '.'); // '.' = nghìn, ',' = thập phân
    }
  } else if (lastDot > -1) {
    // Chỉ có '.': nếu phần sau '.' là đúng 3 chữ số → nghìn VN, không thì thập phân
    const afterDot = clean.slice(lastDot + 1);
    if (afterDot.length === 3 && /^\d{3}$/.test(afterDot)) {
      clean = clean.replace(/\./g, ''); // nghìn
    }
    // else giữ nguyên là thập phân
  } else if (lastComma > -1) {
    const afterComma = clean.slice(lastComma + 1);
    if (afterComma.length === 3 && /^\d{3}$/.test(afterComma)) {
      clean = clean.replace(/,/g, ''); // nghìn
    } else {
      clean = clean.replace(',', '.'); // thập phân
    }
  }

  const n = parseFloat(clean);
  return isNaN(n) ? 0 : Math.round(n);
}

// ── Test cases (chạy trong Console để verify) ─────────────────
// Gọi: _testParseMoney() trong Console
function _testParseMoney() {
  const cases = [
    ['1000000',     1000000],
    ['1.000.000',   1000000],
    ['1,000,000',   1000000],
    ['1.000',       1000],
    ['1,000',       1000],
    ['1500000',     1500000],
    ['1.5tr',       1500000],
    ['1,5tr',       1500000],
    ['2tr',         2000000],
    ['500k',        500000],
    ['1.5tỷ',       1500000000],
    ['2tỷ',         2000000000],
    ['630000',      630000],
    ['0',           0],
    ['',            0],
    [null,          0],
    [1000000,       1000000],  // number passthrough
  ];
  let pass = 0, fail = 0;
  cases.forEach(([input, expected]) => {
    const got = parseMoney(input);
    const ok  = got === expected;
    if (!ok) console.error(`❌ parseMoney(${JSON.stringify(input)}) = ${got}, expected ${expected}`);
    else pass++;
    if (!ok) fail++;
  });
  console.log(`parseMoney tests: ${pass}/${cases.length} passed${fail?', '+fail+' FAILED':' ✅'}`);
}

function x(s){ if(!s)return''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function toast(msg,type='') { const t=document.getElementById('toast'); t.textContent=msg; t.className='toast '+(type?type:''); t.classList.add('show'); clearTimeout(t._to); t._to=setTimeout(()=>t.classList.remove('show'),2800); }


// ══════════════════════════════════════════════════════════════════
//  SỔ CHẤM CÔNG v3
//  worker: { name, luong, d:[CN,T2,T3,T4,T5,T6,T7], phucap, hdmuale, nd }
// ══════════════════════════════════════════════════════════════════
let ccData   = load('cc_v2', []);
let ccOffset = 0;

// Tự động rebuild HĐ nhân công nếu có CC data mà thiếu HĐ (gọi sau khi mọi data đã load)
function autoRebuildCCIfNeeded() {
  if (!ccData.length) return;

  // Bước 1: Xóa HĐ auto bị lỗi ngay='' (do import cũ thiếu toDate)
  const badInvs = invoices.filter(i => i.ccKey && !i.ngay);
  if (badInvs.length > 0) {
    invoices = invoices.filter(i => !(i.ccKey && !i.ngay));
    save('inv_v3', invoices);
    console.log('[autoRebuild] Cleared', badInvs.length, 'bad invs (ngay empty)');
  }

  // Bước 2: Tìm các tuần CC chưa có HĐ tương ứng trong invoices
  let totalFixed = 0;
  ccData.forEach(week => {
    const { fromDate, ct, workers } = week;
    if(!fromDate || !ct || !workers || !workers.length) return;
    const weekPrefix = 'cc|' + fromDate + '|' + ct + '|';
    const ncKey = weekPrefix + 'nhanCong';

    // Nếu tuần này đã có HĐ nhân công → bỏ qua
    if(invoices.some(i => i.ccKey === ncKey)) return;

    // Tính toDate
    let toDate = week.toDate;
    if(!toDate) {
      try {
        const [y,m,d] = fromDate.split('-').map(Number);
        const sat = new Date(y, m-1, d+6);
        toDate = sat.getFullYear() + '-' +
          String(sat.getMonth()+1).padStart(2,'0') + '-' +
          String(sat.getDate()).padStart(2,'0');
      } catch(e) { toDate = fromDate; }
    }

    // Tạo HĐ mua lẻ còn thiếu
    workers.forEach(wk => {
      if(!wk.hdmuale || wk.hdmuale <= 0) return;
      const key = weekPrefix + wk.name + '|hdml';
      if(invoices.some(i => i.ccKey === key)) return;
      invoices.unshift({
        id: Date.now() + Math.random(), ccKey: key,
        ngay: toDate, congtrinh: ct, loai: 'Hóa Đơn Lẻ',
        nguoi: wk.name, ncc: '',
        nd: wk.nd || ('HĐ mua lẻ – ' + wk.name + ' (' + viShort(fromDate) + '–' + viShort(toDate) + ')'),
        tien: wk.hdmuale, thanhtien: wk.hdmuale, _ts: Date.now()
      });
    });

    // Tạo HĐ nhân công
    const totalLuong = workers.reduce((s, wk) => {
      const tc = (wk.d || []).reduce((a, v) => a + (v || 0), 0);
      return s + tc * (wk.luong || 0) + (wk.phucap || 0);
    }, 0);
    if(totalLuong > 0) {
      const firstWorker = (workers.find(w => w.name) || {name:''}).name;
      invoices.unshift({
        id: Date.now() + Math.random(), ccKey: ncKey,
        ngay: toDate, congtrinh: ct, loai: 'Nhân Công',
        nguoi: firstWorker, ncc: '',
        nd: 'Lương tuần ' + viShort(fromDate) + '–' + viShort(toDate),
        tien: totalLuong, thanhtien: totalLuong, _ts: Date.now()
      });
      totalFixed++;
    }
  });

  if(totalFixed > 0 || badInvs.length > 0) {
    save('inv_v3', invoices);
    console.log('[autoRebuild] Fixed ' + totalFixed + ' missing weeks, cleared ' + badInvs.length + ' bad');
  }
}
let ccHistPage = 1, ccTltPage = 1;
const CC_PG_HIST = 30;
const CC_PG_TLT = 20;
const CC_DAY_LABELS   = ['CN','T2','T3','T4','T5','T6','T7'];
const CC_DATE_OFFSETS = [0,1,2,3,4,5,6]; // offset from Sunday (week starts Sunday)

// ─── date helpers ───────────────────────────────────────────────
// Tuần: CN (Sun) → T7 (Sat). iso date string là YYYY-MM-DD.
// Tránh timezone bug: dùng local date parts, không dùng toISOString cho date-only

function isoFromParts(y,m,d){ return y+'-'+(m<10?'0':'')+m+'-'+(d<10?'0':'')+d; }

// Trả về iso string của CN (Sunday) cho tuần cách tuần hiện tại offset tuần
function ccSundayISO(offset=0){
  const now = new Date();
  const y=now.getFullYear(), mo=now.getMonth(), d=now.getDate();
  const jsDay=now.getDay(); // 0=Sun,1=Mon,...,6=Sat
  // Tìm Sunday của tuần hiện tại
  const sunD = new Date(y, mo, d - jsDay + offset*7);
  return isoFromParts(sunD.getFullYear(), sunD.getMonth()+1, sunD.getDate());
}

// Trả về iso string của T7 (Saturday) = CN + 6
function ccSaturdayISO(sundayISO){
  const [y,m,d]=sundayISO.split('-').map(Number);
  const sat=new Date(y,m-1,d+6);
  return isoFromParts(sat.getFullYear(),sat.getMonth()+1,sat.getDate());
}

// Snap bất kỳ ngày → CN của tuần chứa ngày đó
function snapToSunday(dateISO){
  const [y,m,d]=dateISO.split('-').map(Number);
  const dt=new Date(y,m-1,d);
  const jsDay=dt.getDay(); // 0=Sun
  const sun=new Date(y,m-1,d-jsDay);
  return isoFromParts(sun.getFullYear(),sun.getMonth()+1,sun.getDate());
}

function viShort(ds){
  const [y,m,d]=ds.split('-').map(Number);
  return (d<10?'0':'')+d+'/'+(m<10?'0':'')+m;
}
function weekLabel(sundayISO){
  const satISO=ccSaturdayISO(sundayISO);
  const y=sundayISO.split('-')[0];
  return viShort(sundayISO)+'–'+viShort(satISO)+'/'+y;
}

// iso() vẫn giữ để dùng chỗ khác nếu cần
function iso(d){ return d.toISOString().split('T')[0]; }

// ─── all worker names for autocomplete ──────────────────────────
function ccAllNames(){
  const s=new Set();
  ccData.forEach(w=>w.workers.forEach(wk=>{ if(wk.name) s.add(wk.name); }));
  cats.nguoiTH.forEach(n=>s.add(n));
  return [...s].sort();
}

// build/update the shared datalist for name autocomplete
function rebuildCCNameList(){
  let dl=document.getElementById('cc-name-dl');
  if(!dl){ dl=document.createElement('datalist'); dl.id='cc-name-dl'; document.body.appendChild(dl); }
  dl.innerHTML=ccAllNames().map(n=>`<option value="${x(n)}">`).join('');
}

// ─── init ────────────────────────────────────────────────────────
function initCC(){
  ccOffset=0;
  ccGoToWeek(0);
  populateCCCtSel();
  rebuildCCNameList();
}

function ccGoToWeek(off){
  ccOffset=off;
  const sunISO=ccSundayISO(off);
  const satISO=ccSaturdayISO(sunISO);
  document.getElementById('cc-from').value=sunISO;
  document.getElementById('cc-to').value=satISO;
  document.getElementById('cc-week-label').textContent='Tuần: '+weekLabel(sunISO);
  loadCCWeekForm();
}
function ccPrevWeek(){ ccGoToWeek(ccOffset-1); }
function ccNextWeek(){ ccGoToWeek(ccOffset+1); }

function onCCFromChange(){
  const raw=document.getElementById('cc-from').value; if(!raw) return;
  // Snap bất kỳ ngày được chọn về CN của tuần đó
  const sunISO=snapToSunday(raw);
  const satISO=ccSaturdayISO(sunISO);
  document.getElementById('cc-from').value=sunISO;
  document.getElementById('cc-to').value=satISO;
  document.getElementById('cc-week-label').textContent='Tuần: '+weekLabel(sunISO);
  // Tính lại offset so với tuần hiện tại
  const thisSun=ccSundayISO(0);
  const [ty,tm,td]=thisSun.split('-').map(Number);
  const [fy,fm,fd]=sunISO.split('-').map(Number);
  const diffMs=new Date(fy,fm-1,fd)-new Date(ty,tm-1,td);
  ccOffset=Math.round(diffMs/(7*86400000));
  loadCCWeekForm();
}

function loadCCWeekForm(){
  const f=document.getElementById('cc-from').value;
  const ct=document.getElementById('cc-ct-sel').value;
  // Try to find saved data for this week+ct
  const rec=ccData.find(w=>w.fromDate===f&&w.ct===ct);
  if(rec){
    buildCCTable(rec.workers);
  } else if(ct){
    // Auto-copy workers from most recent week of same CT (names+luong only, clear days/extra)
    const prev=ccData.filter(w=>w.ct===ct&&w.fromDate<f).sort((a,b)=>b.fromDate.localeCompare(a.fromDate))[0];
    if(prev){
      const stub=prev.workers.map(wk=>({name:wk.name,luong:wk.luong,d:[0,0,0,0,0,0,0],phucap:0,hdmuale:0,nd:''}));
      buildCCTable(stub);
    } else {
      buildCCTable([]);
    }
  } else {
    buildCCTable([]);
  }
}

// ─── build table ─────────────────────────────────────────────────
function buildCCTable(workers){
  const fromStr=document.getElementById('cc-from').value;
  const thead=document.getElementById('cc-thead-row');
  const dates=CC_DATE_OFFSETS.map(off=>{
    if(!fromStr) return '';
    const d=new Date(fromStr+'T00:00:00'); d.setDate(d.getDate()+off);
    return d.getDate()+'/'+(d.getMonth()+1);
  });
  const BG='background:#eeece7;color:var(--ink)';
  thead.innerHTML=`
    <th class="col-num">#</th>
    <th class="cc-sticky-name" style="min-width:130px">Tên Công Nhân</th>
    <th style="width:44px;text-align:center">T/P</th>
    ${CC_DAY_LABELS.map((l,i)=>`<th class="cc-day-header">${l}<br><span style="font-size:9px;font-weight:400;color:var(--ink2)">${dates[i]}</span></th>`).join('')}
    <th style="width:46px;text-align:center;${BG}">TC</th>
    <th style="width:110px;text-align:right;${BG}">Lương/Ngày</th>
    <th style="width:110px;text-align:right;${BG}">Tổng Lương</th>
    <th style="width:100px;text-align:right;${BG}">Phụ Cấp</th>
    <th style="width:110px;text-align:right;${BG}">HĐ Mua Lẻ</th>
    <th style="min-width:140px;${BG}">Nội Dung</th>
    <th style="width:120px;text-align:right;background:#c8870a;color:#fff;font-weight:700">Tổng Cộng</th>
    <th class="col-del" style="${BG}"></th>
  `;
  const tbody=document.getElementById('cc-tbody');
  tbody.innerHTML='';
  const minRows=Math.max((workers||[]).length,8);
  for(let i=0;i<minRows;i++) addCCRow((workers||[])[i]||null);
  updateCCSumRow();
}

function addCCWorker(){
  const tbody=document.getElementById('cc-tbody');
  const sumRow=tbody.querySelector('.cc-sum-row');
  const nr=buildCCRow(null, tbody.querySelectorAll('tr:not(.cc-sum-row)').length+1);
  tbody.insertBefore(nr,sumRow||null);
  renumberCC(); updateCCSumRow();
  nr.querySelector('.cc-name-input')?.focus();
}

function addCCRow(w){
  const tbody=document.getElementById('cc-tbody');
  const num=tbody.querySelectorAll('tr:not(.cc-sum-row)').length+1;
  tbody.appendChild(buildCCRow(w,num));
}

function buildCCRow(w,num){
  const tr=document.createElement('tr');
  const ds=w?w.d:[0,0,0,0,0,0,0];
  const luong=w?(w.luong||0):0;
  const phucap=w?(w.phucap||0):0;
  const hdml=w?(w.hdmuale||0):0;
  const role=w?.role||(w?.name?cnRoles[w.name]||'':'');
  const isKnown=w?.name?cats.congNhan.some(n=>n.toLowerCase()===(w.name||'').toLowerCase()):false;

  tr.innerHTML=`
    <td class="row-num">${num}</td>
    <td class="cc-sticky-name" style="padding:0">
      <input class="cc-name-input" data-cc="name" list="cc-name-dl"
        value="${x(w?w.name||'':''||'')}" placeholder="Tên..."
        oninput="onCCNameInput(this)">
    </td>
    <td style="padding:0">
      <select data-cc="tp" ${isKnown?'disabled':''} style="width:100%;border:none;background:transparent;padding:5px 4px;font-size:12px;font-weight:700;outline:none;color:var(--ink);${isKnown?'opacity:0.65;cursor:not-allowed':'cursor:pointer'}">
        <option value="">—</option>
        <option value="C" ${role==='C'?'selected':''}>C</option>
        <option value="T" ${role==='T'?'selected':''}>T</option>
        <option value="P" ${role==='P'?'selected':''}>P</option>
      </select>
    </td>
    ${ds.map((v,i)=>`<td style="padding:0"><input class="cc-day-input ${v===1?'has-val':v>0&&v<1?'half-val':''}"
      data-cc="d${i}" value="${v||''}" placeholder="·" autocomplete="off"
      oninput="onCCDayKey(this)"></td>`).join('')}
    <td class="cc-tc-cell" data-cc="tc">0</td>
    <td style="padding:0"><input class="cc-wage-input" data-cc="luong" data-raw="${luong||''}"
      value="${luong?numFmt(luong):''}" placeholder="0" oninput="onCCWageKey(this)"></td>
    <td class="cc-total-cell" data-cc="total">—</td>
    <td style="padding:0"><input class="cc-wage-input" data-cc="phucap" data-raw="${phucap||''}"
      value="${phucap?numFmt(phucap):''}" placeholder="0" oninput="onCCMoneyKey(this)"></td>
    <td style="padding:0"><input class="cc-wage-input" data-cc="hdml" data-raw="${hdml||''}"
      value="${hdml?numFmt(hdml):''}" placeholder="0" oninput="onCCMoneyKey(this)"></td>
    <td style="padding:0"><input class="cc-name-input" data-cc="nd"
      value="${x(w?w.nd||'':''||'')}" placeholder="Nội dung..."
      style="font-size:11px" oninput="updateCCSumRow()"></td>
    <td class="cc-total-cell" data-cc="tongcong" style="color:var(--gold);font-size:13px">—</td>
    <td><button class="del-btn" onclick="delCCRow(this)">✕</button></td>
  `;
  tr.querySelectorAll('[data-cc^="d"]').forEach(el=>el.addEventListener('input',()=>{ onCCDayKey(el); updateCCSumRow(); }));
  tr.querySelector('[data-cc="luong"]').addEventListener('input',function(){ onCCWageKey(this); updateCCSumRow(); });
  tr.querySelector('[data-cc="phucap"]').addEventListener('input',function(){ onCCMoneyKey(this); updateCCSumRow(); });
  tr.querySelector('[data-cc="hdml"]').addEventListener('input',function(){ onCCMoneyKey(this); updateCCSumRow(); });
  tr.querySelector('[data-cc="name"]').addEventListener('input',updateCCSumRow);
  tr.querySelector('[data-cc="nd"]').addEventListener('input',updateCCSumRow);
  calcCCRow(tr);
  return tr;
}

function onCCNameInput(inp){
  const name=inp.value.trim();
  if(!name){ inp.style.boxShadow=''; inp.title=''; return; }
  // Chống trùng tên không phân biệt hoa thường
  const nameLower=name.toLowerCase();
  let count=0;
  document.querySelectorAll('#cc-tbody [data-cc="name"]').forEach(el=>{ if(el.value.trim().toLowerCase()===nameLower) count++; });
  if(count>1){
    inp.style.boxShadow='inset 0 0 0 2px var(--red)';
    inp.title='⚠️ Tên trùng! Vui lòng đổi tên để phân biệt.';
    toast('⚠️ Tên "'+name+'" bị trùng – hãy đổi tên để tránh nhầm lẫn!','error');
  } else {
    inp.style.boxShadow='';
    inp.title='';
  }
  // Auto-fill T/P nếu thợ đã có trong danh mục
  const tr=inp.closest('tr');
  if(!tr) return;
  const tpSel=tr.querySelector('[data-cc="tp"]');
  if(!tpSel) return;
  const known=cats.congNhan.find(n=>n.toLowerCase()===nameLower);
  if(known){
    tpSel.value=cnRoles[known]||'';
    tpSel.disabled=true;
    tpSel.style.opacity='0.65';
    tpSel.style.cursor='not-allowed';
  } else {
    tpSel.disabled=false;
    tpSel.style.opacity='1';
    tpSel.style.cursor='pointer';
  }
}

function onCCDayKey(inp){
  const n=parseFloat(inp.value.replace(',','.'))||0;
  inp.classList.toggle('has-val',n===1);
  inp.classList.toggle('half-val',n>0&&n<1);
  calcCCRow(inp.closest('tr'));
}
function onCCWageKey(inp){
  const raw=inp.value.replace(/\./g,'').replace(/,/g,'');
  inp.dataset.raw=raw;
  if(raw) inp.value=numFmt(parseInt(raw)||0);
  calcCCRow(inp.closest('tr'));
}
function onCCMoneyKey(inp){
  const raw=inp.value.replace(/\./g,'').replace(/,/g,'');
  inp.dataset.raw=raw;
  if(raw) inp.value=numFmt(parseInt(raw)||0);
  calcCCRow(inp.closest('tr'));
}

function calcCCRow(tr){
  let tc=0;
  for(let i=0;i<7;i++) tc+=parseFloat(tr.querySelector(`[data-cc="d${i}"]`)?.value||0)||0;
  tr.querySelector('[data-cc="tc"]').textContent=tc||0;
  const luong=parseInt(tr.querySelector('[data-cc="luong"]')?.dataset?.raw||0)||0;
  const total=tc*luong;
  const phucap=parseInt(tr.querySelector('[data-cc="phucap"]')?.dataset?.raw||0)||0;
  const hdml  =parseInt(tr.querySelector('[data-cc="hdml"]')?.dataset?.raw||0)||0;
  const tongcong=total+phucap+hdml;
  const totCell=tr.querySelector('[data-cc="total"]');
  totCell.textContent=total>0?numFmt(total):'—';
  totCell.style.color=total>0?'var(--green)':'var(--ink3)';
  const tcCell=tr.querySelector('[data-cc="tongcong"]');
  tcCell.textContent=tongcong>0?numFmt(tongcong):'—';
  tcCell.style.color=tongcong>0?'var(--gold)':'var(--ink3)';
}

function delCCRow(btn){ btn.closest('tr').remove(); renumberCC(); updateCCSumRow(); }
function renumberCC(){
  document.querySelectorAll('#cc-tbody tr:not(.cc-sum-row)').forEach((tr,i)=>tr.querySelector('.row-num').textContent=i+1);
}

function updateCCSumRow(){
  const rows=document.querySelectorAll('#cc-tbody tr:not(.cc-sum-row)');
  const dayT=new Array(7).fill(0);
  let tc=0,totalLuong=0,totalPC=0,totalHD=0,totalTC=0;
  rows.forEach(tr=>{
    for(let i=0;i<7;i++) dayT[i]+=parseFloat(tr.querySelector(`[data-cc="d${i}"]`)?.value||0)||0;
    const t=parseFloat(tr.querySelector('[data-cc="tc"]')?.textContent||0)||0;
    tc+=t;
    const l=parseInt(tr.querySelector('[data-cc="luong"]')?.dataset?.raw||0)||0;
    const pc=parseInt(tr.querySelector('[data-cc="phucap"]')?.dataset?.raw||0)||0;
    const hd=parseInt(tr.querySelector('[data-cc="hdml"]')?.dataset?.raw||0)||0;
    totalLuong+=t*l; totalPC+=pc; totalHD+=hd;
    totalTC+=t*l+pc+hd;
  });
  let sumRow=document.querySelector('#cc-tbody .cc-sum-row');
  if(!sumRow){ sumRow=document.createElement('tr'); sumRow.className='cc-sum-row'; document.getElementById('cc-tbody').appendChild(sumRow); }
  const mono="font-family:'IBM Plex Mono',monospace;font-weight:700";
  sumRow.innerHTML=`
    <td class="row-num" style="font-size:10px;font-weight:700;color:var(--ink2)">∑</td>
    <td class="cc-sticky-name" style="padding:7px 10px;font-size:10px;font-weight:700;color:var(--ink2);text-transform:uppercase;letter-spacing:.5px">TỔNG</td>
    ${dayT.map(v=>`<td style="text-align:center;${mono};font-size:12px;color:var(--ink2);padding:6px 4px">${v||''}</td>`).join('')}
    <td style="text-align:center;${mono};font-size:14px;color:var(--gold);padding:6px 8px">${tc}</td>
    <td></td>
    <td style="text-align:right;${mono};font-size:13px;color:var(--green);padding:6px 8px;white-space:nowrap">${totalLuong>0?numFmt(totalLuong):'—'}</td>
    <td style="text-align:right;${mono};font-size:12px;color:var(--blue);padding:6px 8px;white-space:nowrap">${totalPC>0?numFmt(totalPC):'—'}</td>
    <td style="text-align:right;${mono};font-size:12px;color:var(--ink2);padding:6px 8px;white-space:nowrap">${totalHD>0?numFmt(totalHD):'—'}</td>
    <td></td>
    <td style="text-align:right;${mono};font-size:14px;color:var(--gold);padding:6px 8px;white-space:nowrap;background:#fff8e8">${totalTC>0?numFmt(totalTC):'—'}</td>
    <td></td>
  `;
  document.getElementById('cc-sum-tc').textContent=tc;
  document.getElementById('cc-sum-luong').textContent=fmtM(totalLuong);
  document.getElementById('cc-sum-tongcong').textContent=fmtM(totalTC);
}

// ─── save ─────────────────────────────────────────────────────────
// Helper: upsert an invoice by ccKey (create or update in-place)
function ccUpsertInvoice(ccKey, invData){
  const idx=invoices.findIndex(i=>i.ccKey===ccKey);
  if(idx>=0){ Object.assign(invoices[idx], invData); }
  else { invoices.unshift({id:Date.now()+Math.random(), ccKey, ...invData}); }
}
// Helper: remove invoices matching a ccKey prefix
function ccRemoveInvoicesByKeyPrefix(prefix){
  invoices=invoices.filter(i=>!i.ccKey||!i.ccKey.startsWith(prefix));
}

// ── Tự động tạo hóa đơn + cập nhật danh mục từ toàn bộ ccData ───────
// Gọi sau khi import/sync để không cần lưu từng tuần thủ công
function rebuildInvoicesFromCC() {
  // Xóa toàn bộ hóa đơn tự động từ CC cũ (có ccKey)
  invoices = invoices.filter(i => !i.ccKey);

  let totalWeeks = 0, totalHdml = 0;

  // ── Tự động thêm công trình mới vào danh mục ──────────────────────
  const newCTs = [...new Set(ccData.map(w => w.ct).filter(Boolean))];
  let addedCTs = 0;
  newCTs.forEach(ct => {
    if (!cats.congTrinh.includes(ct)) {
      cats.congTrinh.push(ct);
      addedCTs++;
    }
  });
  if (addedCTs > 0) {
    cats.congTrinh.sort();
    localStorage.setItem('cat_ct', JSON.stringify(cats.congTrinh));
  }

  // ── Tự động thêm tên công nhân vào danh mục Người TH ─────────────
  const allWorkerNames = [...new Set(
    ccData.flatMap(w => (w.workers || []).map(wk => wk.name).filter(Boolean))
  )];
  let addedNames = 0;
  allWorkerNames.forEach(name => {
    if (!cats.nguoiTH.includes(name)) {
      cats.nguoiTH.push(name);
      addedNames++;
    }
  });
  if (addedNames > 0) {
    cats.nguoiTH.sort();
    localStorage.setItem('cat_nguoi', JSON.stringify(cats.nguoiTH));
  }

  // ── Tự động thêm tên TP/NCC từ tiền ứng vào danh mục Thầu Phụ ────
  const allTPs = [...new Set(ungRecords.map(r => r.tp).filter(Boolean))];
  let addedTPs = 0;
  allTPs.forEach(tp => {
    if (!cats.thauPhu.includes(tp)) {
      cats.thauPhu.push(tp);
      addedTPs++;
    }
  });
  if (addedTPs > 0) {
    cats.thauPhu.sort();
    localStorage.setItem('cat_tp', JSON.stringify(cats.thauPhu));
  }

  // ── Tự động thêm tên công nhân vào danh mục Công Nhân ───────────
  allWorkerNames.forEach(name => {
    if (!cats.congNhan.includes(name)) {
      cats.congNhan.push(name);
    }
  });
  if (cats.congNhan.length > 0) {
    cats.congNhan.sort();
    localStorage.setItem('cat_cn', JSON.stringify(cats.congNhan));
  }

  // ── Tạo hóa đơn từ chấm công ──────────────────────────────────────
  ccData.forEach(week => {
    const { fromDate, ct, workers } = week;
    if (!fromDate || !ct || !workers || !workers.length) return;
    const weekPrefix = 'cc|' + fromDate + '|' + ct + '|';

    // Tính toDate từ fromDate nếu trống (fromDate=CN, toDate=T7 = +6 ngày)
    let toDate = week.toDate;
    if (!toDate) {
      try {
        const [y,m,d] = fromDate.split('-').map(Number);
        const sat = new Date(y, m-1, d+6);
        toDate = sat.getFullYear() + '-' +
          String(sat.getMonth()+1).padStart(2,'0') + '-' +
          String(sat.getDate()).padStart(2,'0');
      } catch(e) { toDate = fromDate; }
    }

    // HĐ Mua Lẻ — 1 HĐ mỗi worker có hdmuale > 0
    workers.forEach(wk => {
      if (!wk.hdmuale || wk.hdmuale <= 0) return;
      const key = weekPrefix + wk.name + '|hdml';
      ccUpsertInvoice(key, {
        ngay: toDate, congtrinh: ct, loai: 'Hóa Đơn Lẻ',
        nguoi: wk.name, ncc: '',
        nd: wk.nd || ('HĐ mua lẻ – ' + wk.name + ' (' + viShort(fromDate) + '–' + viShort(toDate) + ')'),
        tien: wk.hdmuale, thanhtien: wk.hdmuale
      });
      totalHdml++;
    });

    // HĐ Nhân Công — 1 HĐ mỗi tuần+ct
    const totalLuong = workers.reduce((s, wk) => {
      const tc = (wk.d || []).reduce((a, v) => a + (v || 0), 0);
      return s + tc * (wk.luong || 0) + (wk.phucap || 0);
    }, 0);

    if (totalLuong > 0) {
      const ncKey = weekPrefix + 'nhanCong';
      const firstWorker = (workers.find(w => w.name) || { name: '' }).name;
      ccUpsertInvoice(ncKey, {
        ngay: toDate, congtrinh: ct, loai: 'Nhân Công',
        nguoi: firstWorker, ncc: '',
        nd: 'Lương tuần ' + viShort(fromDate) + '–' + viShort(toDate),
        tien: totalLuong, thanhtien: totalLuong
      });
      totalWeeks++;
    }
  });

  save('inv_v3', invoices);
  updateTop();
  return { weeks: totalWeeks, hdml: totalHdml, cts: addedCTs, names: addedNames };
}

function saveCCWeek(){
  const fromDate=document.getElementById('cc-from').value;
  const toDate  =document.getElementById('cc-to').value;
  const ct      =document.getElementById('cc-ct-sel').value;
  if(!fromDate){ toast('Chọn ngày bắt đầu tuần!','error'); return; }
  if(!ct){ toast('Chọn công trình!','error'); return; }

  // check duplicate names (không phân biệt hoa thường)
  const names=[];
  let dupFound=false;
  document.querySelectorAll('#cc-tbody tr:not(.cc-sum-row) [data-cc="name"]').forEach(el=>{
    const n=el.value.trim();
    const nL=n.toLowerCase();
    if(n&&names.includes(nL)){ dupFound=true; el.style.boxShadow='inset 0 0 0 2px var(--red)'; }
    else if(n) names.push(nL);
  });
  if(dupFound){ toast('⚠️ Còn tên trùng nhau! Sửa trước khi lưu.','error'); return; }

  const workers=[];
  document.querySelectorAll('#cc-tbody tr:not(.cc-sum-row)').forEach(tr=>{
    const name=tr.querySelector('[data-cc="name"]')?.value?.trim()||'';
    const luong=parseInt(tr.querySelector('[data-cc="luong"]')?.dataset?.raw||0)||0;
    const phucap=parseInt(tr.querySelector('[data-cc="phucap"]')?.dataset?.raw||0)||0;
    const hdmuale=parseInt(tr.querySelector('[data-cc="hdml"]')?.dataset?.raw||0)||0;
    const nd=(tr.querySelector('[data-cc="nd"]')?.value?.trim()||'');
    const role=tr.querySelector('[data-cc="tp"]')?.value||'';
    const d=[];
    for(let i=0;i<7;i++) d.push(parseFloat(tr.querySelector(`[data-cc="d${i}"]`)?.value||0)||0);
    if(name||d.some(v=>v>0)) workers.push({name,luong,d,phucap,hdmuale,nd,role});
  });
  if(!workers.length){ toast('Chưa có công nhân nào!','error'); return; }

  // Save CC data
  ccData=ccData.filter(w=>!(w.fromDate===fromDate&&w.ct===ct));
  ccData.unshift({id:Date.now(), fromDate, toDate, ct, workers});
  save('cc_v2',ccData);

  // ── Tự động thêm tên mới + vai trò vào danh mục Công Nhân ───────
  let cnUpdated=false;
  workers.forEach(wk=>{
    if(!wk.name) return;
    const known=cats.congNhan.find(n=>n.toLowerCase()===wk.name.toLowerCase());
    if(!known){ cats.congNhan.push(wk.name); cnUpdated=true; }
    if(wk.role && !cnRoles[wk.name]){ cnRoles[wk.name]=wk.role; cnUpdated=true; }
  });
  if(cnUpdated){ cats.congNhan.sort(); save('cat_cn',cats.congNhan); save('cat_cn_roles',cnRoles); }

  // ── UPSERT HĐ Mua Lẻ to invoices (one per worker with hdmuale > 0) ──
  // First, remove old hdml invoices for workers no longer having hdmuale
  const weekPrefix='cc|'+fromDate+'|'+ct+'|';
  // Remove hdml keys for workers not in current list or with 0 amount
  const activeHdmlKeys=new Set(workers.filter(w=>w.hdmuale>0).map(w=>weekPrefix+w.name+'|hdml'));
  invoices=invoices.filter(i=>{
    if(!i.ccKey||!i.ccKey.startsWith(weekPrefix)) return true;
    if(!i.ccKey.endsWith('|hdml')) return true;
    return activeHdmlKeys.has(i.ccKey);
  });
  let hdCount=0;
  workers.forEach(wk=>{
    if(!wk.hdmuale||wk.hdmuale<=0) return;
    const key=weekPrefix+wk.name+'|hdml';
    ccUpsertInvoice(key,{
      ngay:toDate, congtrinh:ct, loai:'Hóa Đơn Lẻ',
      nguoi:wk.name, ncc:'',
      nd:wk.nd||('HĐ mua lẻ – '+wk.name+' ('+viShort(fromDate)+'–'+viShort(toDate)+')'),
      tien:wk.hdmuale, thanhtien:wk.hdmuale
    });
    hdCount++;
  });

  // ── UPSERT Nhân Công invoice for the whole week ──
  // One invoice per week+ct, Người TH = tên công nhân đầu tiên
  const ncKey=weekPrefix+'nhanCong';
  const totalLuong=workers.reduce((s,wk)=>{ const tc=wk.d.reduce((a,v)=>a+v,0); return s+tc*wk.luong+(wk.phucap||0); },0);
  const firstWorker=(workers.find(w=>w.name)||{name:''}).name;
  const ndNhanCong='Lương tuần '+viShort(fromDate)+'–'+viShort(toDate);
  if(totalLuong>0){
    ccUpsertInvoice(ncKey,{
      ngay:toDate, congtrinh:ct, loai:'Nhân Công',
      nguoi:firstWorker, ncc:'',
      nd:ndNhanCong,
      tien:totalLuong, thanhtien:totalLuong
    });
  } else {
    // if total = 0, remove the NC invoice
    invoices=invoices.filter(i=>i.ccKey!==ncKey);
  }

  save('inv_v3',invoices); updateTop();

  rebuildCCNameList();
  populateCCCtSel();
  // Chỉ cập nhật dropdown filter, KHÔNG render toàn bộ bảng lịch sử
  document.getElementById('cc-hist-week').value = fromDate;
  document.getElementById('cc-tlt-week').value  = fromDate;
  buildCCHistFilters();
  const msg=`✅ Đã lưu ${viShort(fromDate)}–${viShort(toDate)} [${ct}]`
    +(hdCount?` · ${hdCount} HĐ lẻ`:'')
    +(totalLuong>0?' · Nhân công cập nhật':'');
  toast(msg,'success');
}

function clearCCWeek(){
  if(!confirm('Xóa bảng nhập tuần này?')) return;
  buildCCTable([]);
}
let ccClipboard=null;
function copyCCWeek(){
  const workers=[];
  document.querySelectorAll('#cc-tbody tr:not(.cc-sum-row)').forEach(tr=>{
    const name=tr.querySelector('[data-cc="name"]')?.value?.trim()||'';
    const luong=parseInt(tr.querySelector('[data-cc="luong"]')?.dataset?.raw||0)||0;
    const phucap=parseInt(tr.querySelector('[data-cc="phucap"]')?.dataset?.raw||0)||0;
    const hdmuale=parseInt(tr.querySelector('[data-cc="hdml"]')?.dataset?.raw||0)||0;
    const nd=tr.querySelector('[data-cc="nd"]')?.value?.trim()||'';
    const d=[];
    for(let i=0;i<7;i++) d.push(parseFloat(tr.querySelector(`[data-cc="d${i}"]`)?.value||0)||0);
    if(name||luong>0||d.some(v=>v>0)) workers.push({name,luong,d,phucap,hdmuale,nd});
  });
  if(!workers.length){toast('Bảng trống, chưa có gì để copy!','error');return;}
  ccClipboard=workers;
  document.getElementById('cc-paste-btn').style.display='';
  const tc=workers.reduce((s,w)=>s+w.d.reduce((a,v)=>a+v,0),0);
  toast('📋 Đã copy '+workers.length+' công nhân ('+tc+' công) — nhấn Dán để áp dụng!','success');
}
function pasteCCWeek(){
  if(!ccClipboard||!ccClipboard.length){toast('Chưa copy tuần nào!','error');return;}
  // Dán toàn bộ: tên, lương, ngày công, phụ cấp, HĐ lẻ, nội dung
  buildCCTable(ccClipboard.map(w=>({...w})));
  toast('📌 Đã dán '+ccClipboard.length+' công nhân đầy đủ ngày công!','success');
}

// ─── CT selector ──────────────────────────────────────────────────
function populateCCCtSel(){
  // Lấy tất cả CT từ danh mục + ccData
  const allCts = [...new Set([...cats.congTrinh, ...ccData.map(w=>w.ct)].filter(Boolean))].sort();
  // Lọc mềm: chỉ hiện CT có phát sinh trong năm đang chọn (hoặc "Tất cả năm")
  const filtered = allCts.filter(ct => _entityInYear(ct, 'ct'));
  const sel = document.getElementById('cc-ct-sel');
  const cur = sel.value;
  sel.innerHTML = '<option value="">-- Chọn công trình --</option>' +
    filtered.map(v => `<option value="${x(v)}" ${v===cur?'selected':''}>${x(v)}</option>`).join('');
}

function onCCCtSelChange(){
  loadCCWeekForm();
}

// ─── history (per week) ───────────────────────────────────────────
function buildCCHistFilters(){
  const yearCC=ccData.filter(w=>inActiveYear(w.fromDate));
  const allCts=[...new Set(yearCC.map(w=>w.ct).filter(Boolean))].sort();
  // weeks list — chỉ năm đang chọn
  const allWeeks=[...new Set(yearCC.map(w=>w.fromDate))].sort().reverse();

  const ctSel=document.getElementById('cc-hist-ct'); const cv=ctSel.value;
  ctSel.innerHTML='<option value="">Tất cả CT</option>'+allCts.map(c=>`<option ${c===cv?'selected':''} value="${x(c)}">${x(c)}</option>`).join('');

  const wkSel=document.getElementById('cc-hist-week'); const wv=wkSel.value;
  wkSel.innerHTML='<option value="">Tất cả tuần</option>'+allWeeks.map(w=>`<option ${w===wv?'selected':''} value="${w}">${weekLabel(w)}</option>`).join('');

  // also update TLT week filter
  const tltSel=document.getElementById('cc-tlt-week'); const tv=tltSel.value;
  tltSel.innerHTML='<option value="">Tất cả tuần</option>'+allWeeks.map(w=>`<option ${w===tv?'selected':''} value="${w}">${weekLabel(w)}</option>`).join('');

  // Cập nhật dropdown CT cho TLT
  const tltCtSel=document.getElementById('cc-tlt-ct');
  if(tltCtSel){ const tcv=tltCtSel.value;
    tltCtSel.innerHTML='<option value="">Tất cả CT</option>'+allCts.map(ct=>`<option ${ct===tcv?'selected':''} value="${x(ct)}">${x(ct)}</option>`).join('');
  }
}

function renderCCHistory(){
  buildCCHistFilters();
  const fCt=document.getElementById('cc-hist-ct').value;
  const fWk=document.getElementById('cc-hist-week').value;
  const fQ=(document.getElementById('cc-hist-search')?.value||'').toLowerCase().trim();

  let rows=[];
  ccData.forEach(w=>{
    if(!inActiveYear(w.fromDate)) return;  // lọc năm
    if(fCt&&w.ct!==fCt) return;
    if(fWk&&w.fromDate!==fWk) return;
    w.workers.forEach(wk=>{
      if(fQ&&!(wk.name||'').toLowerCase().includes(fQ)) return;
      const tc=wk.d.reduce((s,v)=>s+v,0);
      const tl=tc*wk.luong;
      const pc=wk.phucap||0;
      const hd=wk.hdmuale||0;
      rows.push({fromDate:w.fromDate,toDate:w.toDate,ct:w.ct,name:wk.name,luong:wk.luong,d:wk.d,tc,tl,pc,hd,nd:wk.nd||'',tongcong:tl+pc+hd,wid:w.id});
    });
  });

  const tbody=document.getElementById('cc-hist-tbody');
  const totalTL=rows.reduce((s,r)=>s+r.tl,0);
  const totalTC2=rows.reduce((s,r)=>s+r.tongcong,0);

  if(!rows.length){
    tbody.innerHTML=`<tr class="empty-row"><td colspan="18">Chưa có dữ liệu chấm công</td></tr>`;
    document.getElementById('cc-hist-pagination').innerHTML=''; return;
  }

  const start=(ccHistPage-1)*CC_PG_HIST;
  const paged=rows.slice(start,start+CC_PG_HIST);

  tbody.innerHTML=paged.map(r=>`<tr>
    <td style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--ink2);white-space:nowrap">${viShort(r.fromDate)}<br><span style="color:var(--ink3)">${viShort(r.toDate)}</span></td>
    <td style="font-weight:600;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x(r.ct||'—')}</td>
    <td style="font-weight:600">${x(r.name||'—')}</td>
    ${r.d.map(v=>`<td style="text-align:center;font-family:'IBM Plex Mono',monospace;font-weight:600;font-size:12px;${v===1?'color:var(--green)':v>0?'color:var(--blue)':'color:var(--line2)'}">${v||'·'}</td>`).join('')}
    <td style="text-align:center;font-family:'IBM Plex Mono',monospace;font-weight:700;color:var(--gold)">${r.tc}</td>
    <td style="text-align:right;font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--ink2)">${r.luong?numFmt(r.luong):'—'}</td>
    <td class="amount-td">${r.tl?numFmt(r.tl):'—'}</td>
    <td style="text-align:right;font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--blue)">${r.pc?numFmt(r.pc):'—'}</td>
    <td style="text-align:right;font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--ink2)">${r.hd?numFmt(r.hd):'—'}</td>
    <td style="color:var(--ink2);font-size:11px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x(r.nd||'—')}</td>
    <td style="text-align:right;font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:13px;color:var(--gold)">${r.tongcong?numFmt(r.tongcong):'—'}</td>
    <td>
      <button class="btn btn-outline btn-sm btn-icon" onclick="loadCCWeekFromHistory('${r.fromDate}','${x(r.ct)}')" title="Tải tuần này">↩</button>
      <button class="btn btn-danger btn-sm btn-icon" onclick="delCCWorker(${r.wid},'${x(r.name)}')" title="Xóa">✕</button>
    </td>
  </tr>`).join('');

  const tp=Math.ceil(rows.length/CC_PG_HIST);
  let pag=`<span>${rows.length} dòng · Tổng lương: <strong style="color:var(--green);font-family:'IBM Plex Mono',monospace">${fmtS(totalTL)}</strong> · Tổng cộng: <strong style="color:var(--gold);font-family:'IBM Plex Mono',monospace">${fmtS(totalTC2)}</strong></span>`;
  if(tp>1){
    pag+='<div class="page-btns">';
    for(let p=1;p<=Math.min(tp,10);p++) pag+=`<button class="page-btn ${p===ccHistPage?'active':''}" onclick="ccHistGoTo(${p})">${p}</button>`;
    if(tp>10) pag+=`<span style="padding:4px 6px;color:var(--ink3)">...${tp}</span>`;
    pag+='</div>';
  }
  document.getElementById('cc-hist-pagination').innerHTML=pag;
  renderCCTLT();
}

function ccHistGoTo(p){ ccHistPage=p; renderCCHistory(); }

// ─── Tổng Lương Tuần (grouped by name per week) ───────────────────
function renderCCTLT(){
  buildCCHistFilters();
  const fWk=document.getElementById('cc-tlt-week').value;
  const fCt2=document.getElementById('cc-tlt-ct')?.value||'';

  // Group by name only khi "tất cả tuần", hoặc (tuần+name) khi lọc tuần cụ thể
  const map={};
  ccData.forEach(w=>{
    if(!inActiveYear(w.fromDate)) return;
    if(fCt2&&w.ct!==fCt2) return;
    if(fWk&&w.fromDate!==fWk) return;
    w.workers.forEach(wk=>{
      const key = fWk ? w.fromDate+'|'+wk.name : wk.name;
      if(!map[key]) map[key]={fromDate:w.fromDate,toDate:w.toDate,name:wk.name,
        d:[0,0,0,0,0,0,0],tc:0,tl:0,pc:0,hdml:0,cts:[],luongList:[]};
      wk.d.forEach((v,i)=>{ map[key].d[i]+=v; });
      const tc=wk.d.reduce((s,v)=>s+v,0);
      map[key].tc+=tc;
      map[key].tl+=tc*(wk.luong||0);
      map[key].pc+=(wk.phucap||0);
      map[key].hdml+=(wk.hdmuale||0);
      if(!map[key].cts.includes(w.ct)) map[key].cts.push(w.ct);
      map[key].luongList.push(wk.luong||0);
      if(!fWk){ if(w.fromDate<map[key].fromDate) map[key].fromDate=w.fromDate;
                if(w.toDate>map[key].toDate) map[key].toDate=w.toDate; }
    });
  });

  const rows=Object.values(map).sort((a,b)=>
    fWk ? b.fromDate.localeCompare(a.fromDate)||a.name.localeCompare(b.name,'vi')
        : a.name.localeCompare(b.name,'vi'));

  const tbody=document.getElementById('cc-tlt-tbody');
  const tableWrap=document.getElementById('cc-tlt-table-wrap');
  const cardsEl=document.getElementById('cc-tlt-cards');
  const isMobile=window.innerWidth<768;

  if(!rows.length){
    if(isMobile){ tableWrap.style.display='none'; cardsEl.style.display='block'; cardsEl.innerHTML='<p style="text-align:center;color:var(--ink3);padding:20px">Chưa có dữ liệu</p>'; }
    else{ tableWrap.style.display=''; cardsEl.style.display='none'; tbody.innerHTML=`<tr class="empty-row"><td colspan="14">Chưa có dữ liệu</td></tr>`; }
    document.getElementById('cc-tlt-pagination').innerHTML=''; return;
  }

  const grandTCLuong=rows.reduce((s,r)=>s+r.tl+r.pc+r.hdml,0);
  const start=(ccTltPage-1)*CC_PG_TLT;
  const paged=rows.slice(start,start+CC_PG_TLT);
  const mono="font-family:'IBM Plex Mono',monospace";
  const DAY_LABELS=['CN','T2','T3','T4','T5','T6','T7'];

  if(isMobile){
    // ── Mobile: card view ──
    tableWrap.style.display='none';
    cardsEl.style.display='block';
    cardsEl.innerHTML=paged.map(r=>{
      const tcLuong=r.tl+r.pc+r.hdml;
      const daysHtml=r.d.map((v,i)=>v>0?`<span class="tlt-day-badge${v>=1?' tlt-day-full':' tlt-day-half'}">${DAY_LABELS[i]}: ${v}</span>`:'').filter(Boolean).join('');
      const ctsHtml=r.cts.length?`<div class="tlt-card-cts">${r.cts.map(c=>x(c)).join(' · ')}</div>`:'';
      const periodHtml=fWk?`${viShort(r.fromDate)} – ${viShort(r.toDate)}`:'Tổng nhiều tuần';
      return `<div class="tlt-card"
        data-name="${x(r.name)}" data-from="${r.fromDate}" data-to="${r.toDate}"
        data-tc="${r.tc}" data-tl="${r.tl}" data-pc="${r.pc}" data-hdml="${r.hdml}"
        data-cts="${r.cts.join('|')}">
        <div class="tlt-card-header">
          <label class="tlt-card-label">
            <input type="checkbox" class="cc-tlt-chk">
            <span class="tlt-card-name">${x(r.name||'—')}</span>
          </label>
          <span class="tlt-card-amount">${tcLuong?numFmt(tcLuong)+' đ':'—'}</span>
        </div>
        <div class="tlt-card-meta">${periodHtml} &nbsp;·&nbsp; <strong>${r.tc}</strong> công</div>
        ${daysHtml?`<div class="tlt-card-days">${daysHtml}</div>`:''}
        ${ctsHtml}
      </div>`;
    }).join('');
  } else {
    // ── Desktop: table view ──
    tableWrap.style.display='';
    cardsEl.style.display='none';
    tbody.innerHTML=paged.map(r=>{
      const tcLuong=r.tl+r.pc+r.hdml;
      const luongTB=r.tc>0?Math.round(r.tl/r.tc):0;
      return `<tr
        data-name="${x(r.name)}" data-from="${r.fromDate}" data-to="${r.toDate}"
        data-tc="${r.tc}" data-tl="${r.tl}" data-pc="${r.pc}" data-hdml="${r.hdml}"
        data-cts="${r.cts.join('|')}">
        <td style="text-align:center;padding:4px"><input type="checkbox" class="cc-tlt-chk" style="width:15px;height:15px;cursor:pointer"></td>
        <td style="${mono};font-size:10px;color:var(--ink2);white-space:nowrap">${fWk?viShort(r.fromDate):'Tổng'}<br><span style="color:var(--ink3)">${fWk?viShort(r.toDate):r.tc+' công'}</span></td>
        <td style="font-weight:700;font-size:13px">${x(r.name||'—')}</td>
        ${r.d.map(v=>`<td style="text-align:center;${mono};font-weight:600;font-size:12px;${v===1?'color:var(--green)':v>0?'color:var(--blue)':'color:var(--line2)'}">${v||'·'}</td>`).join('')}
        <td style="text-align:center;${mono};font-weight:700;color:var(--gold)">${r.tc}</td>
        <td style="text-align:right;${mono};font-weight:700;font-size:13px;color:var(--green)">${tcLuong?numFmt(tcLuong):'—'}</td>
        <td style="text-align:right;${mono};font-size:12px;color:var(--ink2)">${luongTB?numFmt(luongTB):'—'}</td>
        <td style="font-size:11px;color:var(--ink2);max-width:200px">${r.cts.map(c=>x(c)).join('<br>')}</td>
      </tr>`;
    }).join('');
  }

  const tp=Math.ceil(rows.length/CC_PG_TLT);
  let pag=`<span>${rows.length} công nhân · Tổng TC Lương: <strong style="color:var(--green);${mono}">${fmtS(grandTCLuong)}</strong></span>`;
  if(tp>1){
    pag+='<div class="page-btns">';
    for(let p=1;p<=Math.min(tp,10);p++) pag+=`<button class="page-btn ${p===ccTltPage?'active':''}" onclick="ccTltGoTo(${p})">${p}</button>`;
    pag+='</div>';
  }
  document.getElementById('cc-tlt-pagination').innerHTML=pag;
}

function exportCCTLTCSV(){
  const fWk=document.getElementById('cc-tlt-week').value;
  const fCt2=document.getElementById('cc-tlt-ct')?.value||'';
  const map={};
  ccData.forEach(w=>{
    if(!inActiveYear(w.fromDate)) return;
    if(fCt2&&w.ct!==fCt2) return;
    if(fWk&&w.fromDate!==fWk) return;
    w.workers.forEach(wk=>{
      const key=w.fromDate+'|'+wk.name;
      if(!map[key]) map[key]={fromDate:w.fromDate,toDate:w.toDate,name:wk.name,
        d:[0,0,0,0,0,0,0],tc:0,tl:0,pc:0,cts:[]};
      wk.d.forEach((v,i)=>{ map[key].d[i]+=v; });
      const tc=wk.d.reduce((s,v)=>s+v,0);
      map[key].tc+=tc; map[key].tl+=tc*(wk.luong||0);
      map[key].pc+=(wk.phucap||0); map[key].cts.push(w.ct);
    });
  });
  const rows=[['Tuần','Tên CN','CN','T2','T3','T4','T5','T6','T7','TC','TC Lương','Lương TB/Ngày','Công Trình']];
  Object.values(map).sort((a,b)=>b.fromDate.localeCompare(a.fromDate)||a.name.localeCompare(b.name)).forEach(r=>{
    const tcL=r.tl+r.pc;
    const ltb=r.tc>0?Math.round(tcL/r.tc):0;
    rows.push([viShort(r.fromDate)+'–'+viShort(r.toDate),r.name,...r.d,r.tc,tcL,ltb,r.cts.join(', ')]);
  });
  dlCSV(rows,'tong_luong_tuan_'+today()+'.csv');
}

function ccTltGoTo(p){ ccTltPage=p; renderCCTLT(); }

function loadCCWeekFromHistory(fromDate,ct){
  const thisSun=ccSundayISO(0);
  const [ty,tm,td]=thisSun.split('-').map(Number);
  const [fy,fm,fd]=fromDate.split('-').map(Number);
  const diffMs=new Date(fy,fm-1,fd)-new Date(ty,tm-1,td);
  ccOffset=Math.round(diffMs/(7*86400000));
  const satISO=ccSaturdayISO(fromDate);
  document.getElementById('cc-from').value=fromDate;
  document.getElementById('cc-to').value=satISO;
  document.getElementById('cc-week-label').textContent='Tuần: '+weekLabel(fromDate);
  document.getElementById('cc-ct-sel').value=ct;
  const rec=ccData.find(w=>w.fromDate===fromDate&&w.ct===ct);
  buildCCTable(rec?rec.workers:[]);
  window.scrollTo({top:0,behavior:'smooth'});
  toast('Đã tải tuần '+viShort(fromDate)+' – '+ct);
}

function delCCWorker(wid,name){
  if(!confirm(`Xóa "${name}" khỏi tuần này?`)) return;
  const w=ccData.find(r=>r.id===wid);
  if(w){ w.workers=w.workers.filter(wk=>wk.name!==name); if(!w.workers.length) ccData=ccData.filter(r=>r.id!==wid); }
  save('cc_v2',ccData); renderCCHistory(); toast('Đã xóa');
}

// ─── export ────────────────────────────────────────────────────────
function exportCCWeekCSV(){
  const f=document.getElementById('cc-from').value;
  const ct=document.getElementById('cc-ct-sel').value||'?';
  const rows=[['CT','Từ','Đến','Tên','CN','T2','T3','T4','T5','T6','T7','TC','Lương/N','Tổng Lương','Phụ Cấp','HĐ Mua Lẻ','Nội Dung','Tổng Cộng']];
  document.querySelectorAll('#cc-tbody tr:not(.cc-sum-row)').forEach(tr=>{
    const name=tr.querySelector('[data-cc="name"]')?.value?.trim()||'';
    if(!name) return;
    const d=[]; for(let i=0;i<7;i++) d.push(parseFloat(tr.querySelector(`[data-cc="d${i}"]`)?.value||0)||0);
    const tc=d.reduce((s,v)=>s+v,0);
    const l=parseInt(tr.querySelector('[data-cc="luong"]')?.dataset?.raw||0)||0;
    const pc=parseInt(tr.querySelector('[data-cc="phucap"]')?.dataset?.raw||0)||0;
    const hd=parseInt(tr.querySelector('[data-cc="hdml"]')?.dataset?.raw||0)||0;
    const nd=tr.querySelector('[data-cc="nd"]')?.value?.trim()||'';
    rows.push([ct,f,document.getElementById('cc-to').value,name,...d,tc,l,tc*l,pc,hd,nd,tc*l+pc+hd]);
  });
  dlCSV(rows,'chamcong_'+f+'.csv');
}

function exportCCHistCSV(){
  // Xuất đúng dữ liệu đang lọc trong bảng Lịch Sử Chấm Công Tuần
  const fCt=document.getElementById('cc-hist-ct').value;
  const fWk=document.getElementById('cc-hist-week').value;
  const rows=[['CT','Từ','Đến','Tên CN','CN','T2','T3','T4','T5','T6','T7','TC','Lương/Ngày','Tổng Lương','Phụ Cấp','HĐ Mua Lẻ','Nội Dung','Tổng Cộng']];
  ccData.forEach(w=>{
    if(fCt&&w.ct!==fCt) return;
    if(fWk&&w.fromDate!==fWk) return;
    w.workers.forEach(wk=>{
      const tc=wk.d.reduce((s,v)=>s+v,0);
      const tl=tc*(wk.luong||0);
      const pc=wk.phucap||0;
      const hd=wk.hdmuale||0;
      rows.push([w.ct,viShort(w.fromDate)+'–'+viShort(w.toDate),w.toDate,wk.name,...wk.d,tc,wk.luong||0,tl,pc,hd,wk.nd||'',tl+pc+hd]);
    });
  });
  const label=fWk?viShort(fWk):'all';
  dlCSV(rows,'lich_su_cham_cong_'+label+'_'+today()+'.csv');
}

// ══════════════════════════════════════════════════════════════════
//  BỘ LỌC NĂM TOÀN CỤC
// ══════════════════════════════════════════════════════════════════
let activeYear = new Date().getFullYear();


function onYearChange() {
  const sel = document.getElementById('global-year');
  if(sel) activeYear = parseInt(sel.value) || 0;

  // Nếu chọn "Tất cả" → hiển thị luôn, không cần tải từ cloud
  if(activeYear === 0) { _refreshAllTabs(); return; }

  const ys = String(activeYear);
  const hasLocal = invoices.some(i=>i.ngay&&i.ngay.startsWith(ys))
    || ccData.some(w=>w.fromDate&&w.fromDate.startsWith(ys))
    || ungRecords.some(u=>u.ngay&&u.ngay.startsWith(ys));

  if(!hasLocal && fbReady()) {
    showSyncBanner('⏳ Đang tải dữ liệu năm ' + activeYear + '...');
    gsLoadAll(function(data) {
      invoices   = load('inv_v3', []);
      ungRecords = load('ung_v1', []);
      ccData     = load('cc_v2', []);
      tbData     = load('tb_v1', []);
      rebuildInvoicesFromCC();
      invoices   = load('inv_v3', []);
      buildYearSelect();
      _refreshAllTabs();
      hideSyncBanner();
      toast('✅ Đã tải năm ' + activeYear + ' từ Firebase!', 'success');
    });
    return;
  }
  _refreshAllTabs();
}

function _refreshAllTabs() {
  // Refresh DATA cho tất cả tab (không chỉ tab đang active)
  // → đảm bảo khi đổi năm, mọi tab đều nhất quán khi mở

  // Tầng 1: Rebuild filter dropdowns theo năm mới
  buildFilters();
  buildUngFilters();
  buildCCHistFilters();
  populateCCCtSel();        // dropdown CT trong Chấm Công
  tbPopulateSels();         // dropdown CT trong Thiết Bị

  // Tầng 2: Render lại nội dung TẤT CẢ các tab
  filterAndRender();        // Tất cả CP
  renderTrash();
  filterAndRenderUng();     // Tiền Ứng
  renderCtPage();           // Tổng CP CT
  renderCCHistory();        // Lịch sử CC
  renderCCTLT();            // Tổng lương tuần
  renderTodayInvoices();    // HĐ trong ngày (tab Nhập)
  tbRenderList();           // Thiết Bị
  renderDashboard();        // Dashboard

  dtPopulateSels();          // dropdowns tab Doanh Thu
  renderThuTable();          // lịch sử thu tiền
  renderLaiLo();             // bảng lãi/lỗ trong Dashboard
  // Topbar tổng
  updateTop();
}

// ── Lọc năm helper ────────────────────────────────────────────────
// Tầng 1 — lọc tuyệt đối theo ngày của 1 record
function inActiveYear(dateStr) {
  if(!dateStr) return false;
  if(activeYear === 0) return true; // "Tất cả năm"
  return parseInt(dateStr.split('-')[0]) === activeYear;
}

// Tầng 2 — lọc mềm cho entity (CT, CN, TB)
// Trả về true nếu entity có BẤT KỲ phát sinh nào trong năm đang chọn
// Dùng cho: dropdown, danh mục, tổng hợp
function _entityInYear(name, type) {
  if (activeYear === 0) return true; // "Tất cả năm" → hiện hết
  if (!name) return false;
  if (type === 'ct') {
    // CT xuất hiện nếu có HĐ, CC, hoặc tiền ứng trong năm
    return invoices.some(i  => inActiveYear(i.ngay)      && i.congtrinh === name)
        || ccData.some(w    => inActiveYear(w.fromDate)   && w.ct        === name)
        || ungRecords.some(r => inActiveYear(r.ngay)      && r.congtrinh === name);
  }
  if (type === 'cn') {
    // Công nhân xuất hiện nếu có tuần chấm công trong năm
    return ccData.some(w => inActiveYear(w.fromDate)
        && (w.workers || []).some(wk => wk.name === name));
  }
  if (type === 'tb') {
    // Thiết bị: hiện nếu CT của nó hoạt động trong năm HOẶC đang hoạt động
    return tbData.some(r => r.ten === name && (
      r.tinhtrang === 'Đang hoạt động'
      || _entityInYear(r.ct, 'ct')
    ));
  }
  return true;
}

// ══════════════════════════════════════════════════════════════════
//  THÙNG RÁC (Hóa Đơn Đã Xóa)
// ══════════════════════════════════════════════════════════════════
let trash = load('trash_v1', []);

function trashAdd(inv) {
  inv._deletedAt = new Date().toISOString();
  trash.unshift(inv);
  // Giữ tối đa 200 HĐ trong thùng rác
  if(trash.length>200) trash=trash.slice(0,200);
  localStorage.setItem('trash_v1', JSON.stringify(trash));
}

function trashRestore(id) {
  const idx=trash.findIndex(i=>String(i.id)===String(id));
  if(idx<0) return;
  const inv={...trash[idx]};
  delete inv._deletedAt;
  invoices.unshift(inv);
  trash.splice(idx,1);
  inv._ts = Date.now(); // đánh dấu vừa khôi phục
  save('inv_v3',invoices);
  localStorage.setItem('trash_v1',JSON.stringify(trash));
  updateTop(); buildFilters(); filterAndRender(); renderTrash();
  toast('✅ Đã khôi phục hóa đơn!','success');
}

function trashDeletePermanent(id) {
  trash=trash.filter(i=>String(i.id)!==String(id));
  localStorage.setItem('trash_v1',JSON.stringify(trash));
  renderTrash();
  toast('Đã xóa vĩnh viễn','success');
}

function trashClearAll() {
  if(!trash.length) return;
  if(!confirm(`Xóa vĩnh viễn ${trash.length} hóa đơn trong thùng rác?\nKhông thể khôi phục!`)) return;
  trash=[];
  localStorage.setItem('trash_v1',JSON.stringify(trash));
  renderTrash();
  toast('Đã xóa toàn bộ thùng rác','success');
}

function renderTrash() {
  const wrap=document.getElementById('trash-wrap');
  const empty=document.getElementById('trash-empty');
  const tbody=document.getElementById('trash-tbody');
  if(!wrap||!tbody||!empty) return;
  if(!trash.length) {
    wrap.style.display='none'; empty.style.display='';
    return;
  }
  wrap.style.display=''; empty.style.display='none';
  tbody.innerHTML=trash.slice(0,100).map(inv=>`<tr>
    <td style="font-size:11px;color:var(--ink2);white-space:nowrap;font-family:'IBM Plex Mono',monospace">${inv.ngay||''}</td>
    <td style="font-size:12px;font-weight:600;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x(inv.congtrinh||'—')}</td>
    <td><span class="tag tag-gold">${x(inv.loai||'—')}</span></td>
    <td style="color:var(--ink2);font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x(inv.nd||'—')}</td>
    <td style="text-align:right;font-family:'IBM Plex Mono',monospace;font-weight:600;color:var(--green)">${numFmt(inv.tien||0)}</td>
    <td style="white-space:nowrap;display:flex;gap:4px;padding:5px 4px">
      <button class="btn btn-outline btn-sm" onclick="trashRestore('${inv.id}')" title="Khôi phục">↩ Khôi phục</button>
      <button class="btn btn-danger btn-sm" onclick="trashDeletePermanent('${inv.id}')" title="Xóa vĩnh viễn">✕</button>
    </td>
  </tr>`).join('');
}

// ══════════════════════════════════════════════════════════════════
//  BẢNG HÓA ĐƠN ĐÃ NHẬP TRONG NGÀY
// ══════════════════════════════════════════════════════════════════
function renderTodayInvoices() {
  const date = document.getElementById('entry-date')?.value || today();
  const dateEl = document.getElementById('today-inv-date');
  if(dateEl) dateEl.textContent = '— ' + date;

  const tbody = document.getElementById('today-inv-tbody');
  const footer = document.getElementById('today-inv-footer');
  if(!tbody) return;

  // Lọc HĐ theo ngày đã chọn (không phân biệt năm)
  const todayInvs = invoices.filter(i => i.ngay === date && !i.ccKey);
  if(!todayInvs.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="8">Chưa có hóa đơn nào vào ngày ${date}</td></tr>`;
    if(footer) footer.innerHTML = '';
    return;
  }

  const mono = "font-family:'IBM Plex Mono',monospace";
  tbody.innerHTML = todayInvs.map(inv => {
    const sl = inv.sl||1;
    const th = inv.thanhtien || (inv.tien*(sl));
    return `<tr>
      <td><span class="tag tag-gold">${x(inv.loai||'—')}</span></td>
      <td style="font-size:12px;font-weight:600;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x(inv.congtrinh||'—')}</td>
      <td style="text-align:right;${mono};font-size:12px;color:var(--ink2)">${inv.tien?numFmt(inv.tien):'—'}</td>
      <td style="text-align:center;${mono};font-size:12px;color:var(--blue)">${sl!==1?sl:''}</td>
      <td style="text-align:right;${mono};font-weight:700;color:var(--green)">${numFmt(th)}</td>
      <td style="color:var(--ink2);font-size:11px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x(inv.nd||'—')}</td>
      <td style="color:var(--ink2);font-size:11px">${x(inv.nguoi||'—')}</td>
      <td style="white-space:nowrap;display:flex;gap:3px;padding:5px 4px">
        <button class="btn btn-outline btn-sm" onclick="editTodayInv('${inv.id}')" title="Sửa">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="delInvoice('${inv.id}');renderTodayInvoices()">✕</button>
      </td>
    </tr>`;
  }).join('');

  const total = todayInvs.reduce((s,i)=>s+(i.thanhtien||i.tien||0),0);
  if(footer) footer.innerHTML = `<span>${todayInvs.length} hóa đơn</span><span>Tổng: <strong style="color:var(--gold);${mono}">${fmtS(total)}</strong></span>`;
}

function editTodayInv(id) {
  const inv = invoices.find(i=>String(i.id)===String(id));
  if(!inv) return;
  document.getElementById('entry-date').value = inv.ngay || today();
  document.getElementById('entry-tbody').innerHTML = '';
  addRow({loai:inv.loai, congtrinh:inv.congtrinh, sl:inv.sl||undefined,
           nguoi:inv.nguoi||'', ncc:inv.ncc||'', nd:inv.nd||'', tien:inv.tien||0});
  const row = document.querySelector('#entry-tbody tr');
  if(row) row.dataset.editId = String(inv.id);
  calcSummary();
  window.scrollTo({top:0, behavior:'smooth'});
  toast('✏️ Chỉnh sửa rồi nhấn 💾 Lưu / Cập Nhật', 'success');
}

// ══════════════════════════════════════════════════════════════════
//  NUMPAD OVERLAY — bàn phím số mobile
// ══════════════════════════════════════════════════════════════════
const isTouchDevice = () => window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

let _npTarget = null;
let _npRaw = '0';
let _npOp  = null;
let _npLeft = null;

function openNumpad(inputEl, label) {
  _npTarget = inputEl;
  // cc-day-input: lấy value (0, 0.5, 1)
  // np-num-input: lấy value số thô
  // cc-wage-input / tien-input: lấy data-raw
  let startVal;
  if(inputEl.classList.contains('cc-day-input')) {
    startVal = String(parseFloat(inputEl.value)||0);
  } else if(inputEl.classList.contains('np-num-input')) {
    startVal = String(parseFloat(inputEl.value)||0);
  } else {
    startVal = String(inputEl.dataset.raw || inputEl.value || '0');
  }
  _npRaw = (startVal && startVal!=='0') ? startVal : '0';
  if(!_npRaw) _npRaw='0';
  _npOp = null; _npLeft = null;
  document.getElementById('numpad-label').textContent = label || 'Nhập số tiền';
  _npRefresh();
  document.getElementById('numpad-overlay').classList.add('open');
  inputEl.blur();
  inputEl.setAttribute('readonly', '');
}

function closeNumpad() {
  document.getElementById('numpad-overlay').classList.remove('open');
  if(_npTarget) _npTarget.removeAttribute('readonly');
  _npTarget = null;
}

function _npCalcResult() {
  const isDay = _npTarget && _npTarget.classList.contains('cc-day-input');
  if(isDay) return parseFloat(_npRaw)||0;
  const right = parseInt(_npRaw)||0;
  if(_npLeft !== null && _npOp) {
    if(_npOp==='+') return _npLeft + right;
    if(_npOp==='−') return Math.max(0, _npLeft - right);
    if(_npOp==='×') return _npLeft * right;
    if(_npOp==='÷') return right ? Math.round(_npLeft / right) : _npLeft;
  }
  return parseInt(_npRaw)||0;
}

function _npRefresh() {
  const txt = document.getElementById('numpad-text');
  if(!txt) return;
  const isDay = _npTarget && _npTarget.classList.contains('cc-day-input');
  if(isDay) {
    // Hiện giá trị thập phân thực sự (không format tiền)
    txt.textContent = _npRaw || '0';
    const saveBtn = document.getElementById('numpad-save-btn');
    if(saveBtn) saveBtn.textContent = 'Lưu  ' + (_npRaw||'0') + ' công';
    // Ẩn/hiện layout numpad day vs tiền
    const keysEl = document.getElementById('numpad-keys');
    const dayKeysEl = document.getElementById('numpad-day-keys');
    const shortcutsEl2 = document.getElementById('numpad-shortcuts');
    if(keysEl) keysEl.style.display = 'none';
    if(dayKeysEl) dayKeysEl.style.display = 'grid';
    if(shortcutsEl2) shortcutsEl2.style.display = 'none';
  } else {
    const keysEl = document.getElementById('numpad-keys');
    const dayKeysEl = document.getElementById('numpad-day-keys');
    const shortcutsEl2 = document.getElementById('numpad-shortcuts');
    if(keysEl) keysEl.style.display = 'grid';
    if(dayKeysEl) dayKeysEl.style.display = 'none';
    if(shortcutsEl2) shortcutsEl2.style.display = 'flex';
    const raw = parseInt(_npRaw)||0;
    if(_npLeft !== null && _npOp) {
      const leftFmt = numFmt(_npLeft);
      const rightStr = (_npRaw && _npRaw!=='0') ? numFmt(parseInt(_npRaw)||0) : '?';
      txt.textContent = leftFmt + ' ' + _npOp + ' ' + rightStr;
    } else {
      txt.textContent = raw ? numFmt(raw) : '0';
    }
    const val = _npCalcResult();
    const saveBtn = document.getElementById('numpad-save-btn');
    if(saveBtn) saveBtn.textContent = val ? 'Lưu  ' + numFmt(val) : 'Lưu';
  }
}

function numpadKey(k) {
  const isDay = _npTarget && _npTarget.classList.contains('cc-day-input');
  if(k==='C') {
    _npRaw='0'; _npOp=null; _npLeft=null;
  } else if(k==='⌫') {
    _npRaw = _npRaw.length > 1 ? _npRaw.slice(0,-1) : '0';
  } else if(k==='.') {
    if(!_npRaw.includes('.')) _npRaw += '.';
  } else if(k==='000') {
    _npRaw = _npRaw==='0' ? '0' : _npRaw + '000';
  } else if(['÷','×','−','+'].includes(k)) {
    if(!isDay) { // phép tính chỉ cho ô tiền
      if(_npLeft!==null && _npOp && _npRaw!=='0') {
        _npLeft = _npCalcResult(); _npRaw = '0';
      } else {
        _npLeft = parseInt(_npRaw)||0; _npRaw = '0';
      }
      _npOp = k;
    }
  } else {
    // Thêm chữ số
    if(isDay) {
      // Day: cho phép decimal tự do, tối đa 5 ký tự (e.g. "99.99")
      if(_npRaw==='0' && k!=='.') _npRaw = k;
      else _npRaw = _npRaw + k;
      if(_npRaw.length > 5) _npRaw = _npRaw.slice(0,5);
    } else {
      _npRaw = _npRaw==='0' ? k : _npRaw + k;
      if(_npRaw.length > 12) _npRaw = _npRaw.slice(0,12);
    }
  }
  _npRefresh();
}

function _npSetDayVal(val) {
  // Shortcut cho ô ngày công — đặt giá trị rồi tự đóng
  _npRaw = String(val);
  _npOp = null; _npLeft = null;
  numpadDone();
}
function numpadShortcut(amount) {
  const cur = _npCalcResult();
  _npRaw = String(cur + amount);
  _npOp = null; _npLeft = null;
  _npRefresh();
}

function numpadDone() {
  const val = _npCalcResult();
  if(_npTarget) {
    const el = _npTarget;
    el.dataset.raw = val;
    const isCC = el.classList.contains('cc-wage-input');
    const isNum = el.classList.contains('np-num-input');

    if(el.classList.contains('cc-day-input')) {
      // CC ngày công: đọc _npRaw trực tiếp để giữ decimal (0.5, 0.3, 11, 12...)
      const rawStr = _npRaw || '0';
      const dayVal = parseFloat(rawStr) || 0;
      el.value = dayVal || '';
      el.classList.toggle('has-val', dayVal >= 1);
      el.classList.toggle('half-val', dayVal > 0 && dayVal < 1);
      el.dataset.raw = dayVal;
      const tr2 = el.closest('tr');
      if(tr2) try { onCCDayKey(el); calcCCRow(tr2); updateCCSumRow && updateCCSumRow(); } catch(e){}
    } else if(isCC) {
      // CC wage: set data-raw trực tiếp rồi gọi hàm tính lại
      el.dataset.raw = val;
      el.value = val ? numFmt(val) : '';
      // Gọi calcCCRow để cập nhật tổng lương
      const tr2 = el.closest('tr');
      if(tr2) try { calcCCRow(tr2); updateCCSumRow && updateCCSumRow(); } catch(e){}
    } else if(isNum) {
      // np-num-input (TB soluong, modal): giá trị thô
      el.value = val || '';
    } else {
      // tien-input: format
      el.value = val ? numFmt(val) : '';
      // Trigger updateThTien
      const tr = el.closest('tr');
      if(tr) {
        const slEl = tr.querySelector('[data-f="sl"]');
        const thEl = tr.querySelector('[data-f="thtien"]');
        if(slEl && thEl) {
          const sl = parseFloat(slEl.value)||1;
          const th = val * sl;
          thEl.textContent = th ? numFmt(th) : '';
          thEl.dataset.raw = th;
        }
      }
    }
    try { calcSummary(); } catch(e){}
    try { calcUngSummary(); } catch(e){}
  }
  closeNumpad();
}

// ── Helper: nhận biết ô số cần numpad ──────────────────────────
function isNumpadTarget(el) {
  return el.classList.contains('tien-input') ||
         el.classList.contains('cc-wage-input') ||
         el.classList.contains('cc-day-input') ||
         el.classList.contains('np-num-input');
}

// ── Build label từ context ────────────────────────────────────
function buildNumpadLabel(el) {
  const tr = el.closest('tr');
  // CC wage fields
  const ccAttr = el.dataset.cc;
  if(ccAttr) {
    if(ccAttr.startsWith('d')) {
      const name = tr?.querySelector('[data-cc="name"]')?.value||'';
      const days = ['CN','T2','T3','T4','T5','T6','T7'];
      const idx = parseInt(ccAttr.slice(1));
      return (days[idx]||ccAttr) + (name?' — '+name:'');
    }
    const labels = {luong:'Lương/Ngày', phucap:'Phụ Cấp', hdml:'HĐ Mua Lẻ'};
    const name = tr?.querySelector('[data-cc="name"]')?.value||'';
    return (labels[ccAttr]||'Nhập số') + (name?' — '+name:'');
  }
  // TB
  const tbAttr = el.dataset.tb;
  if(tbAttr==='soluong') {
    const ten = tr?.querySelector('[data-tb="ten"]')?.value||'';
    return 'Số Lượng' + (ten?' — '+ten:'');
  }
  // Modal inputs
  if(el.id==='tb-ei-sl') return 'Số Lượng';
  // tien / tiền ứng
  if(tr) {
    const loai = tr.querySelector('[data-f="loai"]')?.value || tr.querySelector('[data-f="tp"]')?.value || '';
    const ct   = tr.querySelector('[data-f="ct"]')?.value || '';
    return [loai, ct].filter(Boolean).join(' · ') || 'Nhập số tiền';
  }
  return 'Nhập số';
}

// Event delegation: intercept focus/click on touch devices
document.addEventListener('focus', function(e) {
  const el = e.target;
  if(!isNumpadTarget(el)) return;
  if(!isTouchDevice()) return;
  e.preventDefault(); e.stopPropagation();
  el.blur();
  setTimeout(() => openNumpad(el, buildNumpadLabel(el)), 30);
}, true);

document.addEventListener('click', function(e) {
  const el = e.target;
  if(!isNumpadTarget(el)) return;
  if(!isTouchDevice()) return;
  e.preventDefault(); e.stopPropagation();
  el.blur();
  openNumpad(el, buildNumpadLabel(el));
}, true);

// Close with Escape key on desktop
document.addEventListener('keydown', function(e) {
  if(e.key==='Escape') closeNumpad();
});

init();

// ══════════════════════════════════════════════════════════════════
//  THEO DÕI THIẾT BỊ (tb_v1)
// ══════════════════════════════════════════════════════════════════
const TB_TINH_TRANG = ['Đang hoạt động', 'Hoạt động lâu', 'Cần sửa chữa'];
const TB_TEN_MAY = [
  'Máy cắt cầm tay', 'Máy cắt bàn', 'Máy uốn sắt lớn', 'Bàn uốn sắt',
  'Thước nhôm', 'Chân Dàn 1.7m', 'Chân Dàn 1.5m',
  'Chéo lớn', 'Chéo nhỏ', 'Kít tăng giàn giáo', 'Cây chống tăng'
];
const TB_KHO_TONG = 'KHO TỔNG';
const TB_STATUS_STYLE = {
  'Đang hoạt động': 'background:#e6f4ec;color:#1a7a45;',
  'Hoạt động lâu':  'background:#fef3dc;color:#c8870a;',
  'Cần sửa chữa':   'background:#fdecea;color:#c0392b;'
};

let tbData = load('tb_v1', []);
let hopDongData = load('hopdong_v1', {});  // { "TênCT": { giaTri, phatSinh } }
let thuRecords  = load('thu_v1', []);       // [{ id, ngay, congtrinh, tien, nd }]

// ── Populate selects ──────────────────────────────────────────────
function tbPopulateSels() {
  const allCts = [
    TB_KHO_TONG,
    ...[...new Set([...cats.congTrinh, ...tbData.map(r=>r.ct)]
      .filter(v => v && v !== TB_KHO_TONG))].sort()
  ];
  // Lọc mềm: CT có phát sinh trong năm đang chọn
  const filtered = allCts.filter(ct => _entityInYear(ct, 'ct'));

  const sel = document.getElementById('tb-ct-sel');
  const cur = sel.value;
  // Select nhập mới: dùng allCts (không lọc năm — cho phép gán TB vào CT bất kỳ)
  sel.innerHTML = '<option value="">-- Chọn công trình --</option>' +
    allCts.map(v=>`<option value="${x(v)}" ${v===cur?'selected':''}>${x(v)}</option>`).join('');

  // Filter danh sách: chỉ CT có liên quan năm đang chọn
  const fSel = document.getElementById('tb-filter-ct');
  const fCur = fSel.value;
  fSel.innerHTML = '<option value="">Tất cả công trình</option>' +
    filtered.map(v=>`<option value="${x(v)}" ${v===fCur?'selected':''}>${x(v)}</option>`).join('');
}

// ── Build nhập bảng ───────────────────────────────────────────────
function tbBuildRows(n=5) {
  const tbody = document.getElementById('tb-tbody');
  tbody.innerHTML = '';
  for (let i=0; i<n; i++) tbAddRow(null, i+1);
}

function tbAddRows(n) {
  const tbody = document.getElementById('tb-tbody');
  const cur = tbody.querySelectorAll('tr').length;
  for (let i=0; i<n; i++) tbAddRow(null, cur+i+1);
}

function tbAddRow(data, num) {
  const tbody = document.getElementById('tb-tbody');
  const idx = num || (tbody.querySelectorAll('tr').length + 1);
  const tr = document.createElement('tr');

  const ttOpts = TB_TINH_TRANG.map(v =>
    `<option value="${v}" ${data&&data.tinhtrang===v?'selected':v==='Đang hoạt động'&&!data?'selected':''}>${v}</option>`
  ).join('');

  const tenDl = `<datalist id="tb-ten-dl">${TB_TEN_MAY.map(n=>`<option value="${x(n)}">`).join('')}</datalist>`;

  tr.innerHTML = `
    <td class="row-num">${idx}</td>
    <td style="padding:0">
      <input class="cc-name-input" list="tb-ten-dl" data-tb="ten"
        value="${x(data?.ten||'')}" placeholder="Nhập tên hoặc chọn..."
        style="width:100%;border:none;background:transparent;padding:7px 10px;font-size:13px;font-family:'IBM Plex Sans',sans-serif;outline:none;color:var(--ink)">
    </td>
    <td style="padding:0">
      <input type="number" data-tb="soluong" class="np-num-input" min="0" step="1"
        value="${data?.soluong||''}" placeholder="0"
        style="width:100%;border:none;background:transparent;padding:7px 8px;text-align:center;font-size:13px;font-family:'IBM Plex Mono',monospace;outline:none;color:var(--ink)">
    </td>
    <td style="padding:0">
      <select data-tb="tinhtrang"
        style="width:100%;border:none;background:transparent;padding:7px 8px;font-size:12px;font-family:'IBM Plex Sans',sans-serif;outline:none;color:var(--ink);cursor:pointer">
        ${ttOpts}
      </select>
    </td>
    <td style="padding:0">
      <input class="cc-name-input" data-tb="nguoi" list="tb-nguoi-dl"
        value="${x(data?.nguoi||'')}" placeholder="—"
        style="width:100%;border:none;background:transparent;padding:7px 8px;font-size:12px;font-family:'IBM Plex Sans',sans-serif;outline:none;color:var(--ink)">
    </td>
    <td style="padding:0">
      <input class="cc-name-input" data-tb="ghichu"
        value="${x(data?.ghichu||'')}" placeholder="—"
        style="width:100%;border:none;background:transparent;padding:7px 8px;font-size:12px;font-family:'IBM Plex Sans',sans-serif;outline:none;color:var(--ink)">
    </td>
    <td style="padding:3px 4px;text-align:center">
      <button class="btn btn-danger btn-sm" onclick="this.closest('tr').remove();tbRenum()" title="Xóa dòng">✕</button>
    </td>`;
  tbody.appendChild(tr);

  // Đảm bảo datalist tồn tại
  if (!document.getElementById('tb-ten-dl')) {
    document.body.insertAdjacentHTML('beforeend', tenDl);
  }
  // Datalist nguoi
  if (!document.getElementById('tb-nguoi-dl')) {
    const dl = document.createElement('datalist');
    dl.id = 'tb-nguoi-dl';
    dl.innerHTML = cats.nguoiTH.map(n=>`<option value="${x(n)}">`).join('');
    document.body.appendChild(dl);
  }
}

function tbRenum() {
  document.querySelectorAll('#tb-tbody tr').forEach((tr,i) => {
    const numCell = tr.querySelector('.row-num');
    if (numCell) numCell.textContent = i+1;
  });
}

function tbClearRows() {
  if (!confirm('Xóa bảng nhập?')) return;
  tbBuildRows();
}

// ── Lưu thiết bị ─────────────────────────────────────────────────
function tbSave() {
  const saveBtn = document.getElementById('tb-save-btn');
  if (saveBtn && saveBtn.disabled) return;
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ Đang lưu...'; }

  const ct = document.getElementById('tb-ct-sel').value.trim();
  if (!ct) {
    toast('Vui lòng chọn công trình!', 'error');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 Lưu thiết bị'; }
    return;
  }

  const rows = [];
  const ngay = today();
  document.querySelectorAll('#tb-tbody tr').forEach(tr => {
    const ten    = tr.querySelector('[data-tb="ten"]')?.value?.trim() || '';
    const sl     = parseFloat(tr.querySelector('[data-tb="soluong"]')?.value) || 0;
    const tt     = tr.querySelector('[data-tb="tinhtrang"]')?.value || 'Đang hoạt động';
    const nguoi  = tr.querySelector('[data-tb="nguoi"]')?.value?.trim() || '';
    const ghichu = tr.querySelector('[data-tb="ghichu"]')?.value?.trim() || '';
    if (ten) rows.push({ id: Date.now()+'_'+Math.random().toString(36).slice(2), ct, ten, soluong:sl, tinhtrang:tt, nguoi, ghichu, ngay });
  });

  if (!rows.length) {
    toast('Không có dữ liệu để lưu!', 'error');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 Lưu thiết bị'; }
    return;
  }

  tbData = [...tbData, ...rows];
  save('tb_v1', tbData);
  tbPopulateSels();
  tbRenderList();
  tbRenderThongKeVon();
  tbBuildRows();
  toast(`✅ Đã lưu ${rows.length} thiết bị vào ${ct}`, 'success');
  setTimeout(() => {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 Lưu thiết bị'; }
  }, 1500);
}

// ── Render bảng danh sách ─────────────────────────────────────────
const TB_PG = 50;
let tbPage = 1;

function tbRenderList() {
  const fCt = document.getElementById('tb-filter-ct')?.value || '';
  const fTt = document.getElementById('tb-filter-tt')?.value || '';
  const fQ  = (document.getElementById('tb-search')?.value || '').toLowerCase().trim();
  let filtered = tbData.filter(r => {
    if (fCt && r.ct !== fCt) return false;
    if (fTt && r.tinhtrang !== fTt) return false;
    if (fQ && !(r.ten||'').toLowerCase().includes(fQ) && !(r.nguoi||'').toLowerCase().includes(fQ) && !(r.ghichu||'').toLowerCase().includes(fQ)) return false;
    // Lọc mềm theo năm: TB của CT có phát sinh năm đang chọn, HOẶC đang hoạt động
    if (activeYear !== 0) {
      const ctActive = _entityInYear(r.ct, 'ct');
      const isRunning = r.tinhtrang === 'Đang hoạt động';
      if (!ctActive && !isRunning) return false;
    }
    return true;
  });

  // Sort: CT → tên
  filtered.sort((a,b) => (a.ct||'').localeCompare(b.ct,'vi') || (a.ten||'').localeCompare(b.ten,'vi'));

  const tbody = document.getElementById('tb-list-tbody');
  const start = (tbPage-1)*TB_PG;
  const paged = filtered.slice(start, start+TB_PG);

  if (!paged.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="8">Chưa có thiết bị nào${fCt?' tại '+fCt:''}</td></tr>`;
    document.getElementById('tb-pagination').innerHTML = '';
    return;
  }

  tbody.innerHTML = paged.map(r => {
    const ttStyle = TB_STATUS_STYLE[r.tinhtrang] || '';
    const ttOpts = TB_TINH_TRANG.map(v =>
      `<option value="${v}" ${r.tinhtrang===v?'selected':''}>${v}</option>`
    ).join('');
    return `<tr data-tbid="${r.id}">
      <td style="font-size:12px;font-weight:600;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${x(r.ct)}">${x(r.ct)}</td>
      <td style="font-weight:600;font-size:13px">${x(r.ten)}</td>
      <td style="text-align:center;font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:14px;color:var(--gold)">${r.soluong||0}</td>
      <td>
        <select onchange="tbUpdateField('${r.id}','tinhtrang',this.value)"
          style="padding:3px 8px;border-radius:5px;border:1px solid var(--line2);font-size:11px;font-weight:600;cursor:pointer;${ttStyle}">
          ${ttOpts}
        </select>
      </td>
      <td style="color:var(--ink2);font-size:12px">${x(r.nguoi||'—')}</td>
      <td style="color:var(--ink2);font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${x(r.ghichu)}">${x(r.ghichu||'—')}</td>
      <td style="font-size:10px;color:var(--ink3);white-space:nowrap">${r.ngay||''}</td>
      <td style="white-space:nowrap;display:flex;gap:4px;padding:6px 4px">
        <button class="btn btn-outline btn-sm" onclick="tbEditRow('${r.id}')" title="Sửa">✏️</button>
        ${r.ct !== TB_KHO_TONG
          ? `<button class="btn btn-sm" onclick="tbThuHoi('${r.id}')" title="Thu hồi về KHO TỔNG"
               style="background:#2563eb;color:#fff;border:none;font-size:11px;padding:3px 8px;border-radius:5px;cursor:pointer;font-family:inherit">↩ Thu Hồi</button>`
          : ''}
        <button class="btn btn-danger btn-sm" onclick="tbDeleteRow('${r.id}')">✕</button>
      </td>
    </tr>`;
  }).join('');

  const tp = Math.ceil(filtered.length/TB_PG);
  let pag = `<span>${filtered.length} thiết bị</span>`;
  if (tp>1) {
    pag += '<div class="page-btns">';
    for(let p=1;p<=Math.min(tp,10);p++) pag+=`<button class="page-btn ${p===tbPage?'active':''}" onclick="tbGoTo(${p})">${p}</button>`;
    pag += '</div>';
  }
  document.getElementById('tb-pagination').innerHTML = pag;
}

function tbGoTo(p) { tbPage=p; tbRenderList(); }

// ── Cập nhật tình trạng inline ────────────────────────────────────
function tbUpdateField(id, field, val) {
  const idx = tbData.findIndex(r=>r.id===id);
  if (idx<0) return;
  tbData[idx][field] = val;
  save('tb_v1', tbData);
  // Re-style select
  const tr = document.querySelector(`tr[data-tbid="${id}"]`);
  if (tr) {
    const sel = tr.querySelector('select');
    if (sel) {
      sel.style.cssText = `padding:3px 8px;border-radius:5px;border:1px solid var(--line2);font-size:11px;font-weight:600;cursor:pointer;${TB_STATUS_STYLE[val]||''}`;
    }
  }
  toast('✅ Đã cập nhật tình trạng', 'success');
}

// ── Xóa thiết bị ─────────────────────────────────────────────────
function tbDeleteRow(id) {
  if (!confirm('Xóa thiết bị này?')) return;
  tbData = tbData.filter(r=>r.id!==id);
  save('tb_v1', tbData);
  tbRenderList();
  tbRenderThongKeVon();
  toast('Đã xóa thiết bị');
}

// ── Sửa thiết bị (modal) ─────────────────────────────────────────
function tbEditRow(id) {
  const r = tbData.find(r=>r.id===id);
  if (!r) return;
  let ov = document.getElementById('tb-edit-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'tb-edit-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px';
    ov.onclick = function(e){ if(e.target===this) this.remove(); };
    document.body.appendChild(ov);
  }
  const ctOpts = cats.congTrinh.map(v=>`<option value="${x(v)}" ${v===r.ct?'selected':''}>${x(v)}</option>`).join('');
  const ttOpts = TB_TINH_TRANG.map(v=>`<option value="${v}" ${r.tinhtrang===v?'selected':''}>${v}</option>`).join('');
  ov.innerHTML = `
  <div style="background:#fff;border-radius:14px;padding:24px;width:min(480px,96vw);box-shadow:0 8px 32px rgba(0,0,0,.2);font-family:'IBM Plex Sans',sans-serif" onclick="event.stopPropagation()">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h3 style="font-size:16px;font-weight:700">✏️ Sửa Thiết Bị</h3>
      <button onclick="document.getElementById('tb-edit-overlay').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#888">✕</button>
    </div>
    <div style="display:grid;gap:10px">
      <div><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:3px">Công Trình</label>
        <select id="tb-ei-ct" style="width:100%;padding:8px 10px;border:1.5px solid #ddd;border-radius:7px;font-family:inherit;font-size:13px;outline:none">
          <option value="">-- Chọn --</option>${ctOpts}</select></div>
      <div><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:3px">Tên Thiết Bị</label>
        <input id="tb-ei-ten" type="text" value="${x(r.ten)}" list="tb-ten-dl"
          style="width:100%;padding:8px 10px;border:1.5px solid #ddd;border-radius:7px;font-family:inherit;font-size:13px;outline:none"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:3px">Số Lượng</label>
          <input id="tb-ei-sl" type="number" class="np-num-input" min="0" value="${r.soluong||0}"
            style="width:100%;padding:8px 10px;border:1.5px solid #ddd;border-radius:7px;font-family:inherit;font-size:13px;outline:none"></div>
        <div><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:3px">Tình Trạng</label>
          <select id="tb-ei-tt" style="width:100%;padding:8px 10px;border:1.5px solid #ddd;border-radius:7px;font-family:inherit;font-size:13px;outline:none">${ttOpts}</select></div>
      </div>
      <div><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:3px">Người TH</label>
        <input id="tb-ei-nguoi" type="text" value="${x(r.nguoi||'')}" list="tb-nguoi-dl"
          style="width:100%;padding:8px 10px;border:1.5px solid #ddd;border-radius:7px;font-family:inherit;font-size:13px;outline:none"></div>
      <div><label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:3px">Ghi Chú</label>
        <input id="tb-ei-ghichu" type="text" value="${x(r.ghichu||'')}"
          style="width:100%;padding:8px 10px;border:1.5px solid #ddd;border-radius:7px;font-family:inherit;font-size:13px;outline:none"></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:16px">
      <button onclick="document.getElementById('tb-edit-overlay').remove()"
        style="flex:1;padding:10px;border-radius:8px;border:1.5px solid #ddd;background:#fff;font-family:inherit;font-size:13px;cursor:pointer">Hủy</button>
      <button onclick="tbSaveEdit('${r.id}')"
        style="flex:2;padding:10px;border-radius:8px;border:none;background:#1a1814;color:#fff;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer">💾 Cập Nhật</button>
    </div>
  </div>`;
  ov.style.display = 'flex';
}

function tbSaveEdit(id) {
  const idx = tbData.findIndex(r=>r.id===id);
  if (idx<0) return;
  tbData[idx] = { ...tbData[idx],
    ct:        document.getElementById('tb-ei-ct').value,
    ten:       document.getElementById('tb-ei-ten').value.trim(),
    soluong:   parseFloat(document.getElementById('tb-ei-sl').value)||0,
    tinhtrang: document.getElementById('tb-ei-tt').value,
    nguoi:     document.getElementById('tb-ei-nguoi').value.trim(),
    ghichu:    document.getElementById('tb-ei-ghichu').value.trim()
  };
  save('tb_v1', tbData);
  document.getElementById('tb-edit-overlay').remove();
  tbPopulateSels();
  tbRenderList();
  tbRenderThongKeVon();
  toast('✅ Đã cập nhật thiết bị!', 'success');
}

// ── Xuất CSV ─────────────────────────────────────────────────────
function tbExportCSV() {
  const fCt = document.getElementById('tb-filter-ct')?.value||'';
  const fTt = document.getElementById('tb-filter-tt')?.value||'';
  let data = tbData.filter(r=>{
    if(fCt && r.ct!==fCt) return false;
    if(fTt && r.tinhtrang!==fTt) return false;
    return true;
  });
  const rows = [['Công Trình','Tên Thiết Bị','Số Lượng','Tình Trạng','Người TH','Ghi Chú','Cập Nhật']];
  data.forEach(r=>rows.push([r.ct,r.ten,r.soluong||0,r.tinhtrang||'',r.nguoi||'',r.ghichu||'',r.ngay||'']));
  dlCSV(rows, 'thiet_bi_'+today()+'.csv');
}

// ── Thu hồi thiết bị về KHO TỔNG ─────────────────────────────────
function tbThuHoi(id) {
  const r = tbData.find(r => r.id === id);
  if (!r) return;
  if (r.ct === TB_KHO_TONG) { toast('Thiết bị này đã ở KHO TỔNG!', 'error'); return; }
  if (!confirm(`Thu hồi "${r.ten}" (SL: ${r.soluong||0}) về KHO TỔNG?`)) return;

  // Tìm record KHO TỔNG cùng tên → cộng dồn, hoặc tạo mới
  const khoIdx = tbData.findIndex(x => x.ct === TB_KHO_TONG && x.ten === r.ten);
  if (khoIdx >= 0) {
    tbData[khoIdx].soluong = (tbData[khoIdx].soluong || 0) + (r.soluong || 0);
    tbData[khoIdx].ngay = today();
  } else {
    tbData.push({
      id: Date.now() + '_' + Math.random().toString(36).slice(2),
      ct: TB_KHO_TONG,
      ten: r.ten,
      soluong: r.soluong || 0,
      tinhtrang: r.tinhtrang || 'Đang hoạt động',
      nguoi: r.nguoi || '',
      ghichu: `Thu hồi từ ${r.ct}`,
      ngay: today()
    });
  }
  // Xóa record cũ (Tổng Sở Hữu giữ nguyên — chỉ dịch chuyển SL)
  tbData = tbData.filter(x => x.id !== id);
  save('tb_v1', tbData);
  tbPopulateSels();
  tbRenderList();
  tbRenderThongKeVon();
  toast(`✅ Đã thu hồi "${r.ten}" về KHO TỔNG`, 'success');
}

// ── Bảng Thống Kê Theo Tên Thiết Bị ─────────────────────────────
function tbRenderThongKeVon() {
  const tbody = document.getElementById('tb-vonke-tbody');
  if (!tbody) return;

  // Nhóm theo tên thiết bị
  const map = {};
  tbData.forEach(r => {
    if (!r.ten) return;
    if (!map[r.ten]) map[r.ten] = { ten: r.ten, total: 0, kho: 0, cts: {} };
    const sl = r.soluong || 0;
    map[r.ten].total += sl;
    if (r.ct === TB_KHO_TONG) {
      map[r.ten].kho += sl;
    } else if (r.ct) {
      map[r.ten].cts[r.ct] = (map[r.ten].cts[r.ct] || 0) + sl;
    }
  });

  const items = Object.values(map).sort((a, b) => a.ten.localeCompare(b.ten, 'vi'));

  if (!items.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="4">Chưa có dữ liệu thiết bị</td></tr>';
    return;
  }

  tbody.innerHTML = items.map(item => {
    const tags = Object.entries(item.cts)
      .map(([ct, sl]) =>
        `<span style="background:#e8f0fe;color:#1967d2;padding:1px 7px;border-radius:10px;font-size:10px;margin:1px;display:inline-block">${x(ct)}: ${sl}</span>`)
      .join('');
    return `<tr>
      <td style="font-weight:600;font-size:13px">${x(item.ten)}</td>
      <td style="text-align:center;font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:15px;color:var(--ink)">${item.total}</td>
      <td style="text-align:center;font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:14px;color:#1a7a45">${item.kho || 0}</td>
      <td style="line-height:2">${tags || '<span style="color:var(--ink3);font-size:12px">—</span>'}</td>
    </tr>`;
  }).join('');
}

// ── Init TB khi load trang ────────────────────────────────────────
// (tbData đã load ở trên, tbBuildRows gọi khi goPage)


// ══════════════════════════════════════════════════════════════
// IMPORT EXCEL → FIREBASE
// ══════════════════════════════════════════════════════════════

function openImportModal() {
  document.getElementById('import-file-input').click();
}

function handleImportFile(e) {
  const file = e.target.files[0];
  if(!file) return;
  e.target.value = '';
  const reader = new FileReader();
  reader.onload = function(ev) {
    try {
      const wb = XLSX.read(ev.target.result, {type:'array'});
      _processImportWorkbook(wb, file.name);
    } catch(err) {
      toast('❌ Không đọc được file Excel: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function _processImportWorkbook(wb, filename) {
  const result = { inv:[], ung:[], cc:[], tb:[], cats:{} };
  let log = [];

  // Helper: parse ngày YYYY-MM-DD hoặc Excel serial
  function parseDate(v) {
    if(!v) return '';
    if(typeof v === 'number') {
      // Excel date serial
      const d = new Date(Math.round((v - 25569)*86400*1000));
      return d.toISOString().slice(0,10);
    }
    const s = String(v).trim();
    if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // dd/mm/yyyy
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if(m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    return '';
  }
  function num(v) { return parseFloat(String(v||'').replace(/[^0-9.\-]/g,''))||0; }
  function str(v) { return v ? String(v).trim() : ''; }
  function sheetToRows(ws) {
    return XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
  }

  // ── Sheet 1: HoaDon / ChiPhi ──────────────────────────────
  const s1name = wb.SheetNames.find(n=>n.includes('HoaDon')||n.includes('1_'));
  if(s1name) {
    const rows = sheetToRows(wb.Sheets[s1name]);
    let dataStart = -1;
    for(let i=0;i<rows.length;i++) {
      const r = rows[i];
      if(r[0] && /^\d{4}-\d{2}-\d{2}$/.test(String(r[0]).trim()) ||
         (r[0] && String(r[0]).match(/^\d{4}[\-\/]\d/))) {
        dataStart = i; break;
      }
      // Cũng check dạng ngày serial Excel
      if(typeof r[0]==='number' && r[0]>40000 && r[0]<60000) {
        dataStart = i; break;
      }
    }
    if(dataStart >= 0) {
      for(let i=dataStart; i<rows.length; i++) {
        const r = rows[i];
        const ngay = parseDate(r[0]);
        const ct   = str(r[1]);
        const loai = str(r[2]);
        const tien = num(r[4]);
        if(!ngay || !ct || !loai || !tien) continue;
        result.inv.push({
          id: Date.now() + Math.random(),
          ngay, congtrinh:ct, loai, nd:str(r[3]),
          tien, sl: num(r[5])||undefined,
          thanhtien: tien * (num(r[5])||1),
          nguoi:str(r[6]), ncc:str(r[7]), sohd:str(r[8]),
          _ts: Date.now()
        });
      }
      log.push(`✅ Hóa Đơn: ${result.inv.length} hàng`);
    }
  }

  // ── Sheet 2: TienUng ─────────────────────────────────────
  const s2name = wb.SheetNames.find(n=>n.includes('TienUng')||n.includes('2_'));
  if(s2name) {
    const rows = sheetToRows(wb.Sheets[s2name]);
    let dataStart = -1;
    for(let i=0;i<rows.length;i++) {
      const r = rows[i];
      if(parseDate(r[0])) { dataStart=i; break; }
    }
    if(dataStart >= 0) {
      for(let i=dataStart; i<rows.length; i++) {
        const r = rows[i];
        const ngay = parseDate(r[0]);
        const ct   = str(r[1]);
        const tp   = str(r[2]);
        const tien = num(r[3]);
        if(!ngay || !ct || !tp || !tien) continue;
        result.ung.push({ id:Date.now()+Math.random(), ngay, congtrinh:ct, tp, tien, nd:str(r[4]), _ts:Date.now() });
      }
      log.push(`✅ Tiền Ứng: ${result.ung.length} hàng`);
    }
  }

  // ── Sheet 3: ChamCong ─────────────────────────────────────
  const s3name = wb.SheetNames.find(n=>n.includes('ChamCong')||n.includes('3_'));
  if(s3name) {
    const rows = sheetToRows(wb.Sheets[s3name]);
    let dataStart = -1;
    for(let i=0;i<rows.length;i++) {
      const r = rows[i];
      if(parseDate(r[0])) { dataStart=i; break; }
    }
    // Group theo fromDate + ct
    const weekMap = {};
    if(dataStart >= 0) {
      for(let i=dataStart; i<rows.length; i++) {
        const r = rows[i];
        const fromDate = parseDate(r[0]);
        const ct = str(r[1]);
        const name = str(r[2]);
        const luong = num(r[3]);
        if(!fromDate || !ct || !name) continue;
        const key = fromDate+'|'+ct;
        if(!weekMap[key]) {
          // Tính toDate = fromDate + 6 ngày (Thứ 7)
          let toDate = '';
          try {
            const [y,m,d] = fromDate.split('-').map(Number);
            const sat = new Date(y, m-1, d+6);
            toDate = sat.getFullYear() + '-' +
              String(sat.getMonth()+1).padStart(2,'0') + '-' +
              String(sat.getDate()).padStart(2,'0');
          } catch(e) { toDate = fromDate; }
          weekMap[key] = { id:Date.now()+Math.random(), fromDate, toDate, ct, workers:[] };
        }
        const d = [num(r[6]),num(r[7]),num(r[8]),num(r[9]),num(r[10]),num(r[11]),num(r[12])];
        weekMap[key].workers.push({ name, luong, phucap:num(r[4]), hdmuale:num(r[5]), d, nd:str(r[13]) });
      }
    }
    result.cc = Object.values(weekMap);
    if(result.cc.length) log.push(`✅ Chấm Công: ${result.cc.length} tuần, ${result.cc.reduce((s,w)=>s+w.workers.length,0)} CN`);
  }

  // ── Sheet 4: ThietBi ─────────────────────────────────────
  const s4name = wb.SheetNames.find(n=>n.includes('ThietBi')||n.includes('4_'));
  if(s4name) {
    const rows = sheetToRows(wb.Sheets[s4name]);
    let dataStart = -1;
    for(let i=0;i<rows.length;i++) {
      const r = rows[i];
      if(str(r[0]) && str(r[1]) && !['CÔNG TRÌNH','CONGTRINH'].includes(str(r[0]).toUpperCase())) {
        dataStart=i; break;
      }
    }
    if(dataStart >= 0) {
      for(let i=dataStart; i<rows.length; i++) {
        const r = rows[i];
        const ct = str(r[0]); const ten = str(r[1]);
        if(!ct || !ten) continue;
        result.tb.push({ id:Date.now()+Math.random(), ct, ten,
          soluong: num(r[2])||1, tinhtrang: str(r[3])||'Đang hoạt động',
          nguoi:str(r[4]), ngay:parseDate(r[5])||'', ghichu:str(r[6]) });
      }
      log.push(`✅ Thiết Bị: ${result.tb.length} hàng`);
    }
  }

  // ── Sheet 5: DanhMuc ─────────────────────────────────────
  const s5name = wb.SheetNames.find(n=>n.includes('DanhMuc')||n.includes('5_'));
  if(s5name) {
    const rows = sheetToRows(wb.Sheets[s5name]);
    const newCats = { ct:[], loai:[], ncc:[], nguoi:[] };
    for(let i=2; i<rows.length; i++) {
      const r = rows[i];
      if(str(r[0])) newCats.ct.push(str(r[0]));
      if(str(r[1])) newCats.loai.push(str(r[1]));
      if(str(r[2])) newCats.ncc.push(str(r[2]));
      if(str(r[3])) newCats.nguoi.push(str(r[3]));
    }
    result.cats = newCats;
    log.push(`✅ Danh Mục: ${newCats.ct.length} CT, ${newCats.loai.length} Loại, ${newCats.ncc.length} NCC`);
  }

  const total = result.inv.length + result.ung.length + result.cc.length + result.tb.length;
  if(total === 0 && Object.keys(result.cats).length === 0) {
    toast('⚠️ Không tìm thấy dữ liệu hợp lệ trong file!', 'error'); return;
  }

  _showImportPreview(result, log, filename);
}

function _showImportPreview(result, log, filename) {
  let ov = document.getElementById('import-modal-overlay');
  if(!ov) {
    ov = document.createElement('div');
    ov.id = 'import-modal-overlay';
    ov.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;align-items:center;justify-content:center';
    ov.onclick = function(e) { if(e.target===this) ov.style.display='none'; };
    document.body.appendChild(ov);
  }

  // Đếm theo năm
  const years = new Set();
  result.inv.forEach(i=>{ if(i.ngay) years.add(i.ngay.slice(0,4)); });
  result.ung.forEach(i=>{ if(i.ngay) years.add(i.ngay.slice(0,4)); });
  result.cc.forEach(i=>{ if(i.fromDate) years.add(i.fromDate.slice(0,4)); });

  ov.innerHTML = `<div onclick="event.stopPropagation()" style="max-width:480px;width:95vw;background:#fff;border-radius:16px;padding:24px;font-family:'IBM Plex Sans',sans-serif;box-shadow:0 12px 48px rgba(0,0,0,.18);max-height:90vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h3 style="font-size:16px;font-weight:800;margin:0">📥 Xem Trước Import</h3>
      <button onclick="document.getElementById('import-modal-overlay').style.display='none'" style="background:none;border:none;font-size:22px;cursor:pointer;color:#888">✕</button>
    </div>
    <div style="background:#f0f4ff;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:12px;color:#333">
      <strong>📄 File:</strong> ${filename}<br>
      <strong>📅 Năm dữ liệu:</strong> ${[...years].sort().join(', ')||'—'}
    </div>
    <div style="margin-bottom:14px">
      ${log.map(l=>`<div style="padding:5px 10px;margin-bottom:4px;background:#f0fff4;border-left:3px solid #1a7a45;border-radius:4px;font-size:12px">${l}</div>`).join('')}
    </div>
    <div style="background:#fff3cd;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:#856404">
      ⚠️ Dữ liệu mới sẽ được <strong>gộp</strong> vào dữ liệu hiện có (không xoá dữ liệu cũ).
      ${fbReady() ? '<br>Sau khi nhập sẽ tự động lưu lên Firebase.' : '<br>Chưa kết nối Firebase — chỉ lưu local.'}
    </div>
    <div style="display:flex;gap:8px">
      <button onclick="document.getElementById('import-modal-overlay').style.display='none'" style="flex:1;padding:11px;border-radius:8px;border:1.5px solid #ccc;background:#fff;font-family:inherit;font-size:13px;cursor:pointer">Huỷ</button>
      <button onclick="_confirmImport()" style="flex:2;padding:11px;border-radius:8px;border:none;background:#1a1814;color:#fff;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer">✅ Xác Nhận Import</button>
    </div>
  </div>`;
  ov.style.display = 'flex';
  ov._importResult = result;
}

function _confirmImport() {
  const ov = document.getElementById('import-modal-overlay');
  const result = ov._importResult;
  if(!result) return;
  ov.style.display = 'none';

  // Merge vào localStorage
  if(result.inv.length) {
    const existing = load('inv_v3',[]);
    localStorage.setItem('inv_v3', JSON.stringify([...result.inv, ...existing]));
    invoices = load('inv_v3',[]);
  }
  if(result.ung.length) {
    const existing = load('ung_v1',[]);
    localStorage.setItem('ung_v1', JSON.stringify([...result.ung, ...existing]));
    ungRecords = load('ung_v1',[]);
  }
  if(result.cc.length) {
    const existing = load('cc_v2',[]);
    localStorage.setItem('cc_v2', JSON.stringify([...result.cc, ...existing]));
    ccData = load('cc_v2',[]);
  }
  if(result.tb.length) {
    const existing = load('tb_v1',[]);
    localStorage.setItem('tb_v1', JSON.stringify([...result.tb, ...existing]));
    tbData = load('tb_v1',[]);
  }

  // Merge danh mục
  const c = result.cats;
  if(c.ct && c.ct.length)    { const cur=load('cat_ct',DEFAULTS.congTrinh); const merged=[...new Set([...cur,...c.ct])]; localStorage.setItem('cat_ct',JSON.stringify(merged)); cats.congTrinh=merged; }
  if(c.loai && c.loai.length) { const cur=load('cat_loai',DEFAULTS.loaiChiPhi); const merged=[...new Set([...cur,...c.loai])]; localStorage.setItem('cat_loai',JSON.stringify(merged)); cats.loaiChiPhi=merged; }
  if(c.ncc && c.ncc.length)   { const cur=load('cat_ncc',DEFAULTS.nhaCungCap); const merged=[...new Set([...cur,...c.ncc])]; localStorage.setItem('cat_ncc',JSON.stringify(merged)); cats.nhaCungCap=merged; }
  if(c.nguoi && c.nguoi.length){ const cur=load('cat_nguoi',DEFAULTS.nguoiTH); const merged=[...new Set([...cur,...c.nguoi])]; localStorage.setItem('cat_nguoi',JSON.stringify(merged)); cats.nguoiTH=merged; }

  // ── Xử lý Chấm Công import: sinh HĐ nhân công đúng như saveCCWeek ──
  let builtMsg = '';
  if(result.cc.length) {
    let totalWeeks = 0, totalHdml = 0;

    result.cc.forEach(week => {
      const { fromDate, ct, workers } = week;
      if(!fromDate || !ct || !workers || !workers.length) return;

      // Tính toDate (T7 = fromDate + 6 ngày) nếu trống
      let toDate = week.toDate;
      if(!toDate) {
        try {
          const [y,m,d] = fromDate.split('-').map(Number);
          const sat = new Date(y, m-1, d+6);
          toDate = sat.getFullYear() + '-' +
            String(sat.getMonth()+1).padStart(2,'0') + '-' +
            String(sat.getDate()).padStart(2,'0');
        } catch(e) { toDate = fromDate; }
      }

      const weekPrefix = 'cc|' + fromDate + '|' + ct + '|';

      // Xóa HĐ cũ của tuần này nếu đã tồn tại (tránh duplicate khi import lại)
      invoices = invoices.filter(i => !i.ccKey || !i.ccKey.startsWith(weekPrefix));

      // HĐ Mua Lẻ — mỗi worker có hdmuale > 0
      workers.forEach(wk => {
        if(!wk.hdmuale || wk.hdmuale <= 0) return;
        const key = weekPrefix + wk.name + '|hdml';
        invoices.unshift({
          id: Date.now() + Math.random(),
          ccKey: key,
          ngay: toDate, congtrinh: ct, loai: 'Hóa Đơn Lẻ',
          nguoi: wk.name, ncc: '',
          nd: wk.nd || ('HĐ mua lẻ – ' + wk.name + ' (' + viShort(fromDate) + '–' + viShort(toDate) + ')'),
          tien: wk.hdmuale, thanhtien: wk.hdmuale,
          _ts: Date.now()
        });
        totalHdml++;
      });

      // HĐ Nhân Công — 1 HĐ tổng mỗi tuần+CT
      const totalLuong = workers.reduce((s, wk) => {
        const tc = (wk.d || []).reduce((a, v) => a + (v || 0), 0);
        return s + tc * (wk.luong || 0) + (wk.phucap || 0);
      }, 0);

      if(totalLuong > 0) {
        const ncKey = weekPrefix + 'nhanCong';
        const firstWorker = (workers.find(w => w.name) || {name:''}).name;
        invoices.unshift({
          id: Date.now() + Math.random(),
          ccKey: ncKey,
          ngay: toDate, congtrinh: ct, loai: 'Nhân Công',
          nguoi: firstWorker, ncc: '',
          nd: 'Lương tuần ' + viShort(fromDate) + '–' + viShort(toDate),
          tien: totalLuong, thanhtien: totalLuong,
          _ts: Date.now()
        });
        totalWeeks++;
      }

      // Cập nhật danh mục công trình + công nhân
      if(!cats.congTrinh.includes(ct)) { cats.congTrinh.push(ct); cats.congTrinh.sort(); }
      workers.forEach(wk => {
        if(wk.name && !cats.nguoiTH.includes(wk.name)) cats.nguoiTH.push(wk.name);
        if(wk.name && !cats.congNhan.includes(wk.name)) cats.congNhan.push(wk.name);
      });
    });

    // Lưu lại invoices đã được bổ sung HĐ nhân công
    save('inv_v3', invoices);
    // Lưu danh mục đã cập nhật
    localStorage.setItem('cat_ct',   JSON.stringify(cats.congTrinh));
    localStorage.setItem('cat_nguoi', JSON.stringify(cats.nguoiTH.sort()));
    localStorage.setItem('cat_cn',   JSON.stringify(cats.congNhan.sort()));

    builtMsg = ' | ' + totalWeeks + ' HĐ lương' + (totalHdml ? ' + ' + totalHdml + ' HĐ lẻ' : '');
  }

  buildYearSelect();
  rebuildEntrySelects(); rebuildUngSelects();
  buildFilters(); filterAndRender(); renderTrash();
  renderCCHistory(); renderCCTLT();
  buildUngFilters(); filterAndRenderUng();
  renderCtPage(); renderSettings(); updateTop();

  toast('✅ Import thành công!' + builtMsg, 'success');

  // Push lên Firebase tất cả các năm có trong data
  if(fbReady()) {
    showSyncBanner('☁️ Đang lưu lên Firebase...');
    const years = new Set();
    result.inv.forEach(i=>{ if(i.ngay) years.add(parseInt(i.ngay.slice(0,4))); });
    result.ung.forEach(i=>{ if(i.ngay) years.add(parseInt(i.ngay.slice(0,4))); });
    result.cc.forEach(i=>{ if(i.fromDate) years.add(parseInt(i.fromDate.slice(0,4))); });
    if(!years.size) years.add(activeYear||new Date().getFullYear());

    let pending = years.size;
    years.forEach(yr => {
      const payload = fbYearPayload(yr);
      fsSet(fbDocYear(yr), payload).then(()=>{
        pending--;
        if(pending===0) {
          fsSet(fbDocCats(), fbCatsPayload()).then(()=>{
            showSyncBanner('✅ Đã lưu lên Firebase!', 3000);
          });
        }
      }).catch(()=>{ pending--; });
    });
  }
}


// ══════════════════════════════════════════════════════════════
// XUẤT DỮ LIỆU RA EXCEL (Export)
// ══════════════════════════════════════════════════════════════

function openExportModal() {
  let ov = document.getElementById('export-modal-overlay');
  if(!ov) {
    ov = document.createElement('div');
    ov.id = 'export-modal-overlay';
    ov.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;align-items:center;justify-content:center';
    ov.onclick = function(e){ if(e.target===this) ov.style.display='none'; };
    document.body.appendChild(ov);
  }

  // Đếm dữ liệu theo năm
  const yearStats = {};
  const allItems = [
    ...invoices.filter(i=>i.ngay&&!i.ccKey),
    ...invoices.filter(i=>i.ccKey)  // HĐ nhân công auto
  ];
  invoices.forEach(i=>{
    const y = i.ngay?i.ngay.slice(0,4):'?';
    if(!yearStats[y]) yearStats[y]={inv:0,ung:0,cc:0};
    yearStats[y].inv++;
  });
  ungRecords.forEach(u=>{
    const y = u.ngay?u.ngay.slice(0,4):'?';
    if(!yearStats[y]) yearStats[y]={inv:0,ung:0,cc:0};
    yearStats[y].ung++;
  });
  ccData.forEach(w=>{
    const y = w.fromDate?w.fromDate.slice(0,4):'?';
    if(!yearStats[y]) yearStats[y]={inv:0,ung:0,cc:0};
    yearStats[y].cc++;
  });

  const sortedYears = Object.keys(yearStats).filter(y=>y!=='?').sort((a,b)=>b-a);
  const curYr = activeYear===0 ? 'tat_ca' : String(activeYear);

  ov.innerHTML = `<div onclick="event.stopPropagation()" style="max-width:440px;width:95vw;background:#fff;border-radius:16px;padding:24px;font-family:'IBM Plex Sans',sans-serif;box-shadow:0 12px 48px rgba(0,0,0,.2);max-height:90vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h3 style="font-size:16px;font-weight:800;margin:0">📤 Xuất Dữ Liệu Ra Excel</h3>
      <button onclick="document.getElementById('export-modal-overlay').style.display='none'" style="background:none;border:none;font-size:22px;cursor:pointer;color:#888">✕</button>
    </div>
    <div style="margin-bottom:14px">
      <label style="font-size:12px;font-weight:700;color:#444;display:block;margin-bottom:6px">Chọn năm xuất:</label>
      <select id="export-year-sel" style="width:100%;padding:9px 12px;border:1.5px solid #ddd;border-radius:8px;font-family:inherit;font-size:13px;font-weight:600;color:#1a1814;outline:none">
        <option value="0">📅 Tất cả năm</option>
        ${sortedYears.map(y=>`<option value="${y}" ${y===curYr?'selected':''}>${y} — ${yearStats[y].inv} HĐ, ${yearStats[y].ung} tiền ứng, ${yearStats[y].cc} tuần CC</option>`).join('')}
      </select>
    </div>
    <div style="background:#f0f4ff;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#333">
      <strong>File sẽ bao gồm:</strong><br>
      Sheet 1_HoaDon, 2_TienUng, 3_ChamCong, 4_ThietBi, 5_DanhMuc
    </div>
    <div style="display:flex;gap:8px">
      <button onclick="document.getElementById('export-modal-overlay').style.display='none'" style="flex:1;padding:11px;border-radius:8px;border:1.5px solid #ccc;background:#fff;font-family:inherit;font-size:13px;cursor:pointer">Huỷ</button>
      <button onclick="_doExport()" style="flex:2;padding:11px;border-radius:8px;border:none;background:#1a7a45;color:#fff;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer">📥 Tải File Excel</button>
    </div>
  </div>`;
  ov.style.display = 'flex';
}

function _doExport() {
  const sel = document.getElementById('export-year-sel');
  const yr = sel ? parseInt(sel.value)||0 : 0;
  document.getElementById('export-modal-overlay').style.display = 'none';

  // Filter theo năm
  const filterY = (dateStr) => yr===0 || (dateStr&&dateStr.startsWith(String(yr)));
  const expInv = invoices.filter(i=>filterY(i.ngay)&&!i.ccKey);
  const expUng = ungRecords.filter(u=>filterY(u.ngay));
  const expCC  = ccData.filter(w=>filterY(w.fromDate));
  const expTb  = tbData.filter(t=>filterY(t.ngay)||yr===0);

  // Build workbook bằng SheetJS
  const wb = XLSX.utils.book_new();

  // Sheet 1: HoaDon
  const inv_data = [['NGÀY','CÔNG TRÌNH','LOẠI CHI PHÍ','NỘI DUNG','ĐƠN GIÁ','SỐ LƯỢNG','THÀNH TIỀN','NGƯỜI TH','NHÀ CC','SỐ HĐ']];
  expInv.forEach(i=>inv_data.push([i.ngay||'',i.congtrinh||'',i.loai||'',i.nd||'',i.tien||0,i.sl||1,i.thanhtien||i.tien||0,i.nguoi||'',i.ncc||'',i.sohd||'']));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(inv_data), '1_HoaDon');

  // Sheet 2: TienUng
  const ung_data = [['NGÀY','CÔNG TRÌNH','THẦU PHỤ / NHÀ CC','SỐ TIỀN ỨNG','NỘI DUNG']];
  expUng.forEach(u=>ung_data.push([u.ngay||'',u.congtrinh||'',u.tp||'',u.tien||0,u.nd||'']));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ung_data), '2_TienUng');

  // Sheet 3: ChamCong (flatten)
  const cc_data = [['NGÀY ĐẦU TUẦN','CÔNG TRÌNH','TÊN CÔNG NHÂN','LƯƠNG/NGÀY','PHỤ CẤP','HĐ MUA LẺ','CN','T2','T3','T4','T5','T6','T7','GHI CHÚ']];
  expCC.forEach(w=>{
    (w.workers||[]).forEach(wk=>{
      const d = wk.d||[0,0,0,0,0,0,0];
      cc_data.push([w.fromDate||'',w.ct||'',wk.name||'',wk.luong||0,wk.phucap||0,wk.hdmuale||0,d[0]||0,d[1]||0,d[2]||0,d[3]||0,d[4]||0,d[5]||0,d[6]||0,wk.nd||'']);
    });
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cc_data), '3_ChamCong');

  // Sheet 4: ThietBi
  const tb_data = [['CÔNG TRÌNH','TÊN THIẾT BỊ','SỐ LƯỢNG','TÌNH TRẠNG','NGƯỜI PHỤ TRÁCH','NGÀY','GHI CHÚ']];
  expTb.forEach(t=>tb_data.push([t.ct||'',t.ten||'',t.soluong||1,t.tinhtrang||'',t.nguoi||'',t.ngay||'',t.ghichu||'']));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tb_data), '4_ThietBi');

  // Sheet 5: DanhMuc
  const dm_data = [['CÔNG TRÌNH','NGƯỜI THỰC HIỆN','NHÀ CC / THẦU PHỤ','LOẠI CHI PHÍ']];
  const maxDm = Math.max(cats.congTrinh.length,cats.nguoiTH.length,cats.nhaCungCap.length,cats.loaiChiPhi.length);
  for(let i=0;i<maxDm;i++) dm_data.push([cats.congTrinh[i]||'',cats.nguoiTH[i]||'',cats.nhaCungCap[i]||'',cats.loaiChiPhi[i]||'']);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dm_data), '5_DanhMuc');

  const fname = yr===0 ? 'export_tat_ca_nam.xlsx' : `export_${yr}.xlsx`;
  XLSX.writeFile(wb, fname);
  toast(`✅ Đã xuất ${expInv.length} HĐ, ${expUng.length} tiền ứng, ${expCC.reduce((s,w)=>s+w.workers.length,0)} CN`, 'success');
}

// ══════════════════════════════════════════════════════════════
// XÓA DỮ LIỆU THEO NĂM / THEO LOẠI
// ══════════════════════════════════════════════════════════════

function openDeleteModal() {
  let ov = document.getElementById('delete-modal-overlay');
  if(!ov) {
    ov = document.createElement('div');
    ov.id = 'delete-modal-overlay';
    ov.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;align-items:center;justify-content:center';
    ov.onclick = function(e){ if(e.target===this) ov.style.display='none'; };
    document.body.appendChild(ov);
  }
  _renderDeleteModal();
}

function _renderDeleteModal() {
  const ov = document.getElementById('delete-modal-overlay');
  if(!ov) return;

  // Thống kê theo năm
  const yearStats = {};
  const addStat = (y, type) => {
    if(!y) return;
    if(!yearStats[y]) yearStats[y] = {inv:0, invAuto:0, ung:0, cc:0, tb:0};
    yearStats[y][type]++;
  };
  invoices.forEach(i=>{ const y=i.ngay?i.ngay.slice(0,4):'?'; addStat(y, i.ccKey?'invAuto':'inv'); });
  ungRecords.forEach(u=>addStat(u.ngay?u.ngay.slice(0,4):'?','ung'));
  ccData.forEach(w=>addStat(w.fromDate?w.fromDate.slice(0,4):'?','cc'));
  tbData.forEach(t=>addStat(t.ngay?t.ngay.slice(0,4):'?','tb'));

  const sortedYears = Object.keys(yearStats).filter(y=>y!=='?').sort((a,b)=>b-a);

  ov.innerHTML = `<div onclick="event.stopPropagation()" style="max-width:480px;width:95vw;background:#fff;border-radius:16px;padding:24px;font-family:'IBM Plex Sans',sans-serif;box-shadow:0 12px 48px rgba(0,0,0,.25);max-height:90vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
      <h3 style="font-size:16px;font-weight:800;margin:0;color:#c0392b">🗑️ Xóa Dữ Liệu</h3>
      <button onclick="document.getElementById('delete-modal-overlay').style.display='none'" style="background:none;border:none;font-size:22px;cursor:pointer;color:#888">✕</button>
    </div>
    <p style="font-size:12px;color:#888;margin:0 0 16px">Chọn năm và loại dữ liệu cần xóa. Thao tác này không thể hoàn tác trừ khi bạn có backup.</p>

    <div style="margin-bottom:14px">
      <label style="font-size:12px;font-weight:700;color:#444;display:block;margin-bottom:6px">Chọn năm:</label>
      <select id="del-year-sel" onchange="_renderDeleteCheckboxes()" style="width:100%;padding:9px 12px;border:1.5px solid #ddd;border-radius:8px;font-family:inherit;font-size:13px;font-weight:600;color:#1a1814;outline:none">
        <option value="0">📅 Tất cả năm (xóa toàn bộ)</option>
        ${sortedYears.map(y=>{
          const s=yearStats[y];
          return `<option value="${y}">${y} — ${s.inv} HĐ tay + ${s.invAuto} HĐ auto + ${s.ung} tiền ứng + ${s.cc} tuần CC</option>`;
        }).join('')}
      </select>
    </div>

    <div id="del-checkboxes" style="background:#fef9f9;border:1.5px solid #f5c6cb;border-radius:8px;padding:12px;margin-bottom:14px">
      <!-- rendered by _renderDeleteCheckboxes -->
    </div>

    <div style="background:#fff3cd;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:#856404">
      ⚠️ Sau khi xóa local sẽ tự động <strong>xóa luôn trên Firebase</strong> (nếu đã kết nối).
      Hãy Export backup trước nếu cần.
    </div>

    <div style="display:flex;gap:8px">
      <button onclick="document.getElementById('delete-modal-overlay').style.display='none'" style="flex:1;padding:11px;border-radius:8px;border:1.5px solid #ccc;background:#fff;font-family:inherit;font-size:13px;cursor:pointer">Huỷ</button>
      <button onclick="openExportModal();document.getElementById('delete-modal-overlay').style.display='none'" style="flex:1;padding:11px;border-radius:8px;border:none;background:#1a7a45;color:#fff;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer">📤 Export Trước</button>
      <button onclick="_confirmDelete()" style="flex:1;padding:11px;border-radius:8px;border:none;background:#c0392b;color:#fff;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer">🗑️ Xóa</button>
    </div>
  </div>`;

  _renderDeleteCheckboxes();
  ov.style.display = 'flex';
}

function _renderDeleteCheckboxes() {
  const box = document.getElementById('del-checkboxes');
  if(!box) return;
  const yr = parseInt(document.getElementById('del-year-sel')?.value)||0;

  const filterY = (dateStr) => yr===0 || (dateStr&&dateStr.startsWith(String(yr)));
  const cntInv  = invoices.filter(i=>filterY(i.ngay)&&!i.ccKey).length;
  const cntAuto = invoices.filter(i=>filterY(i.ngay)&&i.ccKey).length;
  const cntUng  = ungRecords.filter(u=>filterY(u.ngay)).length;
  const cntCC   = ccData.filter(w=>filterY(w.fromDate)).length;
  const cntTb   = tbData.filter(t=>filterY(t.ngay)||yr===0).length;

  const row = (id, label, cnt, color='#333') => cnt>0
    ? `<label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer;border-bottom:1px solid #f0e0e0">
        <input type="checkbox" id="${id}" checked style="width:16px;height:16px;accent-color:#c0392b;cursor:pointer">
        <span style="font-size:12px;color:${color};flex:1">${label}</span>
        <span style="font-size:11px;font-weight:700;color:#c0392b;background:#fde8e8;padding:2px 8px;border-radius:10px">${cnt} mục</span>
       </label>`
    : `<div style="padding:5px 0;font-size:12px;color:#bbb;border-bottom:1px solid #f5f5f5">${label}: <em>không có dữ liệu</em></div>`;

  box.innerHTML = `
    ${row('del-inv',   '📋 Hóa Đơn (nhập tay)', cntInv)}
    ${row('del-auto',  '🤖 Hóa Đơn Nhân Công (tự động từ CC)', cntAuto, '#666')}
    ${row('del-ung',   '💰 Tiền Ứng', cntUng)}
    ${row('del-cc',    '👷 Chấm Công (tuần)', cntCC)}
    ${row('del-tb',    '🔧 Thiết Bị', cntTb)}
  `;
}

function _confirmDelete() {
  const yr = parseInt(document.getElementById('del-year-sel')?.value)||0;
  const delInv  = document.getElementById('del-inv')?.checked;
  const delAuto = document.getElementById('del-auto')?.checked;
  const delUng  = document.getElementById('del-ung')?.checked;
  const delCC   = document.getElementById('del-cc')?.checked;
  const delTb   = document.getElementById('del-tb')?.checked;

  if(!delInv && !delAuto && !delUng && !delCC && !delTb) {
    toast('⚠️ Chưa chọn loại dữ liệu nào!', 'error'); return;
  }

  const yrLabel = yr===0 ? 'TẤT CẢ NĂM' : String(yr);
  if(!confirm('Xác nhận XÓA dữ liệu năm ' + yrLabel + '?\nThao tác này không thể hoàn tác!')) return;

  document.getElementById('delete-modal-overlay').style.display = 'none';

  const filterY = (dateStr) => yr===0 || (dateStr&&dateStr.startsWith(String(yr)));
  let msg = [];

  if(delInv || delAuto) {
    const before = invoices.length;
    invoices = invoices.filter(i => {
      if(!filterY(i.ngay)) return true;
      if(delInv && !i.ccKey) return false;
      if(delAuto && i.ccKey) return false;
      return true;
    });
    save('inv_v3', invoices);
    msg.push(`${before-invoices.length} HĐ`);
  }
  if(delUng) {
    const before = ungRecords.length;
    ungRecords = ungRecords.filter(u=>!filterY(u.ngay));
    save('ung_v1', ungRecords);
    msg.push(`${before-ungRecords.length} tiền ứng`);
  }
  if(delCC) {
    const before = ccData.length;
    ccData = ccData.filter(w=>!filterY(w.fromDate));
    save('cc_v2', ccData);
    // Rebuild HĐ auto sau khi xóa CC
    rebuildInvoicesFromCC();
    invoices = load('inv_v3', []);
    msg.push(`${before-ccData.length} tuần CC`);
  }
  if(delTb) {
    const before = tbData.length;
    tbData = tbData.filter(t=>yr===0 ? false : !filterY(t.ngay));
    save('tb_v1', tbData);
    msg.push(`${before-tbData.length} thiết bị`);
  }

  // Xóa trên Firebase
  if(fbReady()) {
    if(yr===0) {
      // Xóa toàn bộ — push data trống lên tất cả năm
      showSyncBanner('☁️ Đang xóa trên Firebase...');
      const years = new Set();
      [...invoices,...ungRecords,...ccData].forEach(i=>{
        const d=i.ngay||i.fromDate||''; if(d) years.add(parseInt(d.slice(0,4)));
      });
      if(!years.size) years.add(new Date().getFullYear());
      let pending=years.size;
      years.forEach(y=>{ fsSet(fbDocYear(y), fbYearPayload(y)).finally(()=>{ pending--; if(!pending) hideSyncBanner(); }); });
    } else {
      showSyncBanner('☁️ Đang cập nhật Firebase...');
      fsSet(fbDocYear(yr), fbYearPayload(yr)).then(()=>hideSyncBanner()).catch(()=>hideSyncBanner());
    }
    fsSet(fbDocCats(), fbCatsPayload()).catch(()=>{});
  }

  buildYearSelect();
  rebuildEntrySelects(); rebuildUngSelects();
  buildFilters(); filterAndRender(); renderTrash();
  renderCCHistory(); renderCCTLT();
  buildUngFilters(); filterAndRenderUng();
  renderCtPage(); updateTop();

  toast(`🗑️ Đã xóa: ${msg.join(', ')}`, 'success');
}


// ══════════════════════════════════════════════════════════════
// [MODULE: DASHBOARD] — KPI · Bar chart · Pie · Top5 · By CT
// Tìm nhanh: Ctrl+F → "MODULE: DASHBOARD"
// ══════════════════════════════════════════════════════════════

function renderDashboard() {
  const yr   = activeYear;
  const data = invoices.filter(i => inActiveYear(i.ngay));
  if (!data.length) {
    ['db-kpi-row','db-bar-chart','db-pie-chart','db-top5','db-by-ct'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<div class="db-empty">Chưa có dữ liệu cho năm ' + yr + '</div>';
    });
    return;
  }

  _dbKPI(data, yr);
  _dbBarChart(data);
  _dbPieChart(data);
  _dbTop5(data);
  _dbByCT(data);
  renderCtPage();   // Chi tiết từng CT (gộp từ tab cũ)
  renderLaiLo();    // Bảng lãi/lỗ
}

// ── KPI Cards ─────────────────────────────────────────────────
function _dbKPI(data, yr) {
  const total   = data.reduce((s, i) => s + (i.thanhtien || i.tien || 0), 0);
  const months  = new Set(data.map(i => i.ngay?.slice(0,7))).size;
  const avgMonth= months ? Math.round(total / months) : 0;
  const maxInv  = data.reduce((mx, i) => (i.thanhtien||i.tien||0) > (mx.thanhtien||mx.tien||0) ? i : mx, data[0]);
  const ctSet   = new Set(data.map(i => i.congtrinh).filter(Boolean));

  const cards = [
    { label:'Tổng Chi Phí ' + yr,  val: fmtM(total),      sub: data.length + ' hóa đơn',         cls:'accent-gold'  },
    { label:'TB / Tháng',           val: fmtM(avgMonth),   sub: months + ' tháng có phát sinh',    cls:'accent-blue'  },
    { label:'HĐ Lớn Nhất',          val: fmtM(maxInv.thanhtien||maxInv.tien||0),
                                    sub: (maxInv.nd||maxInv.loai||'').slice(0,30),                  cls:'accent-red'   },
    { label:'Công Trình',           val: ctSet.size,       sub: 'đang theo dõi năm ' + yr,         cls:'accent-green' },
  ];

  document.getElementById('db-kpi-row').innerHTML = cards.map(k =>
    `<div class="db-kpi-card ${k.cls}">
       <div class="db-kpi-label">${k.label}</div>
       <div class="db-kpi-val">${k.val}</div>
       <div class="db-kpi-sub">${k.sub}</div>
     </div>`
  ).join('');
}

// ── Bar Chart theo tháng (SVG) ────────────────────────────────
function _dbBarChart(data) {
  // Tổng hợp theo tháng
  const byMonth = {};
  data.forEach(i => {
    const m = i.ngay?.slice(0,7);
    if (!m) return;
    byMonth[m] = (byMonth[m] || 0) + (i.thanhtien || i.tien || 0);
  });
  const months = Object.keys(byMonth).sort();
  if (!months.length) return;

  const vals    = months.map(m => byMonth[m]);
  const maxVal  = Math.max(...vals);
  const H       = 160;  // chiều cao cột max
  const colW    = Math.max(28, Math.min(60, Math.floor(620 / months.length) - 6));
  const gap     = 5;
  const svgW    = months.length * (colW + gap);

  const bars = months.map((m, i) => {
    const h    = maxVal ? Math.round((vals[i] / maxVal) * H) : 2;
    const x    = i * (colW + gap);
    const y    = H - h;
    const lbl  = m.slice(5);   // "01"→"T1"
    const amt  = vals[i] >= 1e9 ? (vals[i]/1e9).toFixed(1)+'tỷ'
               : vals[i] >= 1e6 ? Math.round(vals[i]/1e6)+'tr' : fmtS(vals[i]);
    return `
      <g>
        <rect x="${x}" y="${y}" width="${colW}" height="${h}"
              rx="3" fill="var(--gold)" opacity=".85">
          <title>${m}: ${fmtM(vals[i])}</title>
        </rect>
        <text x="${x + colW/2}" y="${y - 4}" text-anchor="middle"
              font-size="9" fill="var(--ink2)">${h > 14 ? amt : ''}</text>
        <text x="${x + colW/2}" y="${H + 14}" text-anchor="middle"
              font-size="9" fill="var(--ink3)">T${parseInt(lbl)}</text>
      </g>`;
  }).join('');

  document.getElementById('db-bar-chart').innerHTML =
    `<svg viewBox="0 -10 ${svgW} ${H + 28}" width="100%" class="db-pie-svg"
          style="min-width:${Math.min(svgW,300)}px;max-width:100%">
       ${bars}
       <line x1="0" y1="${H}" x2="${svgW}" y2="${H}" stroke="var(--line)" stroke-width="1"/>
     </svg>`;
}

// ── Pie Chart tỷ trọng (SVG) ─────────────────────────────────
function _dbPieChart(data) {
  // Nhóm theo loại — gộp loại nhỏ vào "Khác"
  const COLORS = ['#f0b429','#1db954','#4a90d9','#e74c3c','#9b59b6','#e67e22','#aaa'];
  const KEY_TYPES = ['Nhân Công','Vật Liệu XD','Thầu Phụ','Sắt Thép','Đổ Bê Tông'];

  const byType = {};
  data.forEach(i => {
    const k = KEY_TYPES.includes(i.loai) ? i.loai : 'Khác';
    byType[k] = (byType[k] || 0) + (i.thanhtien || i.tien || 0);
  });

  const total   = Object.values(byType).reduce((s,v) => s+v, 0);
  const entries = Object.entries(byType)
    .sort((a,b) => b[1]-a[1])
    .map(([name, val], i) => ({ name, val, pct: val/total, color: COLORS[i % COLORS.length] }));

  // Vẽ SVG pie
  const R = 70, CX = 80, CY = 80;
  let startAngle = -Math.PI / 2;
  const slices = entries.map(e => {
    const angle = e.pct * Math.PI * 2;
    const x1 = CX + R * Math.cos(startAngle);
    const y1 = CY + R * Math.sin(startAngle);
    startAngle += angle;
    const x2 = CX + R * Math.cos(startAngle);
    const y2 = CY + R * Math.sin(startAngle);
    const large = angle > Math.PI ? 1 : 0;
    return `<path d="M${CX},${CY} L${x1.toFixed(1)},${y1.toFixed(1)}
              A${R},${R} 0 ${large},1 ${x2.toFixed(1)},${y2.toFixed(1)} Z"
              fill="${e.color}" stroke="#fff" stroke-width="2">
              <title>${e.name}: ${Math.round(e.pct*100)}%</title>
            </path>`;
  }).join('');

  const legend = entries.map(e =>
    `<div class="db-legend-row">
       <div class="db-legend-dot" style="background:${e.color}"></div>
       <span style="flex:1;color:var(--ink2)">${e.name}</span>
       <span class="db-legend-pct" style="color:${e.color}">${Math.round(e.pct*100)}%</span>
     </div>`
  ).join('');

  document.getElementById('db-pie-chart').innerHTML =
    `<svg viewBox="0 0 160 160" width="140" height="140" class="db-pie-svg">${slices}</svg>
     <div class="db-legend">${legend}</div>`;
}

// ── Top 5 hóa đơn lớn nhất ────────────────────────────────────
function _dbTop5(data) {
  const top5 = [...data]
    .sort((a,b) => (b.thanhtien||b.tien||0) - (a.thanhtien||a.tien||0))
    .slice(0, 5);
  const max  = top5[0] ? (top5[0].thanhtien||top5[0].tien||0) : 1;

  document.getElementById('db-top5').innerHTML = top5.map((inv, i) => {
    const amt = inv.thanhtien || inv.tien || 0;
    const pct = Math.round(amt / max * 100);
    return `<div class="db-rank-row">
      <div class="db-rank-num ${i===0?'top1':''}">${i===0?'🥇':i+1}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${inv.nd || inv.loai || '—'}
        </div>
        <div style="font-size:10px;color:var(--ink3)">${inv.ngay} · ${inv.congtrinh||'—'}</div>
        <div class="db-rank-bar-bg" style="margin-top:4px">
          <div class="db-rank-bar-fill" style="width:${pct}%"></div>
        </div>
      </div>
      <div class="db-rank-amt">${fmtM(amt)}</div>
    </div>`;
  }).join('');
}

// ── Chi phí theo Công Trình ────────────────────────────────────
function _dbByCT(data) {
  const byCT = {};
  data.forEach(i => {
    const k = i.congtrinh || '(Không rõ)';
    byCT[k] = (byCT[k] || 0) + (i.thanhtien || i.tien || 0);
  });
  const sorted = Object.entries(byCT).sort((a,b) => b[1]-a[1]);
  const max    = sorted[0]?.[1] || 1;

  document.getElementById('db-by-ct').innerHTML = sorted.map(([ct, amt], i) => {
    const pct = Math.round(amt / max * 100);
    return `<div class="db-rank-row">
      <div class="db-rank-num ${i===0?'top1':''}">${i+1}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
             title="${ct}">${ct}</div>
        <div class="db-rank-bar-bg" style="margin-top:4px">
          <div class="db-rank-bar-fill" style="width:${pct}%;background:${i===0?'var(--green)':'var(--gold)'}"></div>
        </div>
      </div>
      <div class="db-rank-amt">${fmtM(amt)}</div>
    </div>`;
  }).join('');
}


// ══════════════════════════════════════════════════════════════
// [MODULE: KEYBOARD NAV] — Entry table & Ung table
// Enter = xuống ô dưới, Ctrl+Enter = lưu, Shift+Enter = thêm dòng
// Tìm nhanh: Ctrl+F → "MODULE: KEYBOARD NAV"
// ══════════════════════════════════════════════════════════════

(function _initKeyboardNav() {

  // Các selector ô có thể focus trong bảng nhập
  const FOCUSABLE = 'input:not([readonly]):not([disabled]), select:not([disabled]), textarea:not([disabled])';

  // Lấy tất cả ô focusable trong 1 tbody theo thứ tự DOM
  function _getCells(tbody) {
    return Array.from(tbody.querySelectorAll(FOCUSABLE));
  }

  function _handleKey(e, tbodyId, saveFn, addRowFn) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    // Ctrl+Enter → Lưu
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      saveFn();
      return;
    }

    // Shift+Enter → Thêm dòng mới
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      addRowFn();
      // Focus vào ô đầu tiên của dòng mới
      setTimeout(() => {
        const rows = tbody.querySelectorAll('tr');
        const lastRow = rows[rows.length - 1];
        if (lastRow) {
          const first = lastRow.querySelector(FOCUSABLE);
          if (first) first.focus();
        }
      }, 50);
      return;
    }

    // Enter đơn → xuống ô tiếp theo trong cùng cột (hoặc ô kế tiếp nếu cuối)
    if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey) {
      // Không áp dụng cho select (Enter mở dropdown là hành vi tự nhiên)
      if (e.target.tagName === 'SELECT') return;
      e.preventDefault();

      const cells = _getCells(tbody);
      const curIdx = cells.indexOf(e.target);
      if (curIdx === -1) return;

      // Tìm ô cùng cột dòng dưới
      const curTr = e.target.closest('tr');
      const curTds = Array.from(curTr.querySelectorAll('td'));
      const curTdIdx = curTds.findIndex(td => td.contains(e.target));

      const nextTr = curTr.nextElementSibling;
      if (nextTr) {
        const nextTds = Array.from(nextTr.querySelectorAll('td'));
        const targetTd = nextTds[curTdIdx] || nextTds[nextTds.length - 1];
        const targetInput = targetTd?.querySelector(FOCUSABLE);
        if (targetInput) { targetInput.focus(); return; }
      }

      // Không có dòng dưới → focus ô tiếp theo
      const nextCell = cells[curIdx + 1];
      if (nextCell) nextCell.focus();
    }
  }

  // Đợi DOM sẵn sàng rồi bind
  document.addEventListener('keydown', function(e) {
    const active = document.activeElement;
    if (!active) return;

    // Bảng Nhập HĐ
    if (active.closest('#entry-tbody')) {
      _handleKey(e, 'entry-tbody', saveAllRows, () => addRows(1));
      return;
    }

    // Bảng Tiền Ứng
    if (active.closest('#ung-tbody')) {
      _handleKey(e, 'ung-tbody', saveAllUngRows, () => addUngRows(1));
      return;
    }
  });

})();


// ══════════════════════════════════════════════════════════════
// [MODULE: DOANH THU & CÔNG NỢ] — hopDongData · thuRecords · Lãi/Lỗ
// Ctrl+F → "MODULE: DOANH THU"
// ══════════════════════════════════════════════════════════════

// ── Helper: format input tiền tệ khi gõ ──────────────────────
function fmtInputMoney(el) {
  const raw = el.value.replace(/[^0-9]/g, '');
  el.dataset.raw = raw;
  el.value = raw ? parseInt(raw).toLocaleString('vi-VN') : '';
}

function _readMoneyInput(id) {
  const el = document.getElementById(id);
  if (!el) return 0;
  const raw = el.dataset.raw || el.value.replace(/[^0-9]/g, '');
  return parseInt(raw) || 0;
}

// ── Populate CT selects trong tab Doanh Thu ───────────────────
function dtPopulateSels() {
  const allCts = [...new Set([...cats.congTrinh,
    ...invoices.map(i => i.congtrinh),
    ...thuRecords.map(r => r.congtrinh)
  ].filter(Boolean))].sort();

  ['hd-ct-sel', 'thu-ct-sel'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">-- Chọn --</option>' +
      allCts.map(v => `<option value="${x(v)}" ${v===cur?'selected':''}>${x(v)}</option>`).join('');
  });
}

// ── Load giá trị hợp đồng khi chọn CT ────────────────────────
function hdLoadCT() {
  const ct = document.getElementById('hd-ct-sel')?.value;
  if (!ct) return;
  const hd = hopDongData[ct] || {};
  const gtEl = document.getElementById('hd-giatri');
  const psEl = document.getElementById('hd-phatsinh');
  if (hd.giaTri) { gtEl.dataset.raw = hd.giaTri; gtEl.value = hd.giaTri.toLocaleString('vi-VN'); }
  else { gtEl.dataset.raw = ''; gtEl.value = ''; }
  if (hd.phatSinh) { psEl.dataset.raw = hd.phatSinh; psEl.value = hd.phatSinh.toLocaleString('vi-VN'); }
  else { psEl.dataset.raw = ''; psEl.value = ''; }
  renderHopDongList();
}

// ── Lưu hợp đồng ─────────────────────────────────────────────
function saveHopDong() {
  const ct = document.getElementById('hd-ct-sel')?.value;
  if (!ct) { toast('Vui lòng chọn Công Trình!', 'error'); return; }
  const giaTri   = _readMoneyInput('hd-giatri');
  const phatSinh = _readMoneyInput('hd-phatsinh');
  hopDongData[ct] = { giaTri, phatSinh };
  save('hopdong_v1', hopDongData);
  renderHopDongList();
  renderDashboard();
  toast(`✅ Đã lưu hợp đồng: ${x(ct)}`, 'success');
}

// ── Render danh sách hợp đồng đã khai báo ────────────────────
function renderHopDongList() {
  const wrap = document.getElementById('hd-list-wrap');
  if (!wrap) return;
  const entries = Object.entries(hopDongData).filter(([,v]) => v.giaTri > 0);
  if (!entries.length) { wrap.innerHTML = ''; return; }

  const rows = entries.sort((a,b) => a[0].localeCompare(b[0],'vi')).map(([ct, hd]) => {
    const tongDT = (hd.giaTri||0) + (hd.phatSinh||0);
    return `<div style="display:flex;align-items:center;gap:12px;padding:9px 14px;
        border-bottom:1px solid var(--line);font-size:13px;flex-wrap:wrap">
      <div style="flex:1;font-weight:600;color:var(--ink)">${x(ct)}</div>
      <div style="color:var(--ink3);font-size:12px">
        HĐ: <b style="color:var(--ink)">${fmtM(hd.giaTri||0)}</b>
        &nbsp;+&nbsp; PS: <b style="color:var(--ink)">${fmtM(hd.phatSinh||0)}</b>
        &nbsp;=&nbsp; <b style="color:var(--gold)">${fmtM(tongDT)}</b>
      </div>
      <button class="btn btn-outline btn-sm" style="color:var(--red)"
        data-ct="${x(ct)}" onclick="delHopDong(this.dataset.ct)" title="Xóa hợp đồng này">✕</button>
    </div>`;
  }).join('');

  wrap.innerHTML = `<div class="records-wrap" style="overflow:hidden">${rows}</div>`;
}

function delHopDong(ct) {
  if (!confirm('Xóa hợp đồng của ' + ct + '?')) return;
  delete hopDongData[ct];
  save('hopdong_v1', hopDongData);
  renderHopDongList();
  renderDashboard();
  toast('Đã xóa hợp đồng: ' + ct, 'success');
}

// ── Lưu bản ghi thu tiền ─────────────────────────────────────
function saveThuRecord() {
  const ct   = document.getElementById('thu-ct-sel')?.value;
  const ngay = document.getElementById('thu-ngay')?.value;
  const tien = _readMoneyInput('thu-tien');
  const nd   = document.getElementById('thu-nd')?.value.trim() || '';
  if (!ct)   { toast('Vui lòng chọn Công Trình!', 'error'); return; }
  if (!ngay) { toast('Vui lòng chọn Ngày!', 'error'); return; }
  if (!tien) { toast('Vui lòng nhập Số Tiền!', 'error'); return; }

  thuRecords.unshift({ id: Date.now() + Math.random(), ngay, congtrinh: ct, tien, nd });
  save('thu_v1', thuRecords);

  // Reset form
  document.getElementById('thu-tien').value = '';
  document.getElementById('thu-tien').dataset.raw = '';
  document.getElementById('thu-nd').value = '';

  renderThuTable();
  renderDashboard();
  toast('✅ Đã ghi nhận thu ' + fmtM(tien) + ' từ ' + ct, 'success');
}

// ── Render bảng lịch sử thu ───────────────────────────────────
function renderThuTable() {
  const tbody = document.getElementById('thu-tbody');
  const empty = document.getElementById('thu-empty');
  const badge = document.getElementById('thu-count-badge');
  if (!tbody) return;

  // Lọc theo năm đang chọn (activeYear)
  const filtered = thuRecords.filter(r => inActiveYear(r.ngay))
    .sort((a,b) => b.ngay.localeCompare(a.ngay));

  if (badge) badge.textContent = filtered.length ? `(${filtered.length} đợt)` : '';
  if (!filtered.length) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  tbody.innerHTML = filtered.map(r => `
    <tr>
      <td>${r.ngay}</td>
      <td>${x(r.congtrinh)}</td>
      <td style="text-align:right;font-family:'IBM Plex Mono',monospace;font-weight:600;color:var(--green)">${fmtM(r.tien)}</td>
      <td style="color:var(--ink3)">${x(r.nd)||'—'}</td>
      <td style="text-align:center">
        <button class="btn btn-outline btn-sm" style="color:var(--red);padding:2px 8px"
          onclick="delThuRecord('${r.id}')">✕</button>
      </td>
    </tr>`).join('');
}

function delThuRecord(id) {
  if (!confirm('Xóa bản ghi thu tiền này?')) return;
  thuRecords = thuRecords.filter(r => String(r.id) !== String(id));
  save('thu_v1', thuRecords);
  renderThuTable();
  renderDashboard();
  toast('Đã xóa bản ghi thu tiền', 'success');
}

// ── Render bảng Lãi/Lỗ trong Dashboard ───────────────────────
function renderLaiLo() {
  const wrap = document.getElementById('db-lailo-wrap');
  if (!wrap) return;

  // Tổng chi theo CT trong năm đang chọn
  const tongChi = {};
  invoices.filter(i => inActiveYear(i.ngay)).forEach(i => {
    const ct = i.congtrinh || '(Không rõ)';
    tongChi[ct] = (tongChi[ct] || 0) + (i.thanhtien || i.tien || 0);
  });

  // Tổng đã thu theo CT trong năm đang chọn
  const daThu = {};
  thuRecords.filter(r => inActiveYear(r.ngay)).forEach(r => {
    daThu[r.congtrinh] = (daThu[r.congtrinh] || 0) + (r.tien || 0);
  });

  // Gộp tất cả CT xuất hiện
  const allCts = [...new Set([
    ...Object.keys(tongChi),
    ...Object.keys(hopDongData)
  ])].filter(Boolean).sort((a,b) => a.localeCompare(b,'vi'));

  if (!allCts.length) {
    wrap.innerHTML = '<div class="db-empty">Chưa có dữ liệu</div>';
    return;
  }

  let tongHD = 0, tongPS = 0, tongDT = 0, tongChi_ = 0, tongThu = 0;

  const rows = allCts.map(ct => {
    const hd       = hopDongData[ct] || {};
    const giaTri   = hd.giaTri   || 0;
    const phatSinh = hd.phatSinh || 0;
    const tongDTct = giaTri + phatSinh;
    const chi      = tongChi[ct]  || 0;
    const thu      = daThu[ct]    || 0;
    const conPhaiThu = tongDTct - thu;
    const laiLo    = tongDTct - chi;
    const llClass  = laiLo > 0 ? 'll-pos' : laiLo < 0 ? 'll-neg' : 'll-zero';
    const llPrefix = laiLo > 0 ? '+' : '';

    tongHD  += giaTri; tongPS  += phatSinh;
    tongDT  += tongDTct; tongChi_ += chi; tongThu += thu;

    return `<tr>
      <td>${x(ct)}</td>
      <td>${giaTri ? fmtS(giaTri) : '<span style="color:var(--ink3)">—</span>'}</td>
      <td>${phatSinh ? fmtS(phatSinh) : '<span style="color:var(--ink3)">—</span>'}</td>
      <td style="font-weight:600">${tongDTct ? fmtS(tongDTct) : '—'}</td>
      <td style="color:var(--red)">${fmtS(chi)}</td>
      <td style="color:var(--green)">${thu ? fmtS(thu) : '—'}</td>
      <td>${tongDTct ? fmtS(conPhaiThu) : '—'}</td>
      <td class="${llClass}">${tongDTct ? llPrefix + fmtS(laiLo) : '—'}</td>
    </tr>`;
  }).join('');

  const tongLaiLo = tongDT - tongChi_;
  const tongLLClass = tongLaiLo > 0 ? 'll-pos' : tongLaiLo < 0 ? 'll-neg' : 'll-zero';

  wrap.innerHTML = `
    <div style="overflow-x:auto">
      <table class="ll-table">
        <thead>
          <tr>
            <th style="text-align:left;min-width:140px">Công Trình</th>
            <th>Hợp Đồng</th>
            <th>Phát Sinh</th>
            <th>Tổng DT</th>
            <th>Tổng Chi</th>
            <th>Đã Thu</th>
            <th>Còn Phải Thu</th>
            <th>Lãi / Lỗ</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td style="text-align:left">TỔNG CỘNG</td>
            <td>${fmtS(tongHD)}</td>
            <td>${fmtS(tongPS)}</td>
            <td style="font-weight:700">${fmtS(tongDT)}</td>
            <td style="color:var(--red);font-weight:700">${fmtS(tongChi_)}</td>
            <td style="color:var(--green);font-weight:700">${fmtS(tongThu)}</td>
            <td>${fmtS(tongDT - tongThu)}</td>
            <td class="${tongLLClass}">${tongDT ? (tongLaiLo>=0?'+':'') + fmtS(tongLaiLo) : '—'}</td>
          </tr>
        </tfoot>
      </table>
    </div>`;
}

// ── Init tab Doanh Thu khi mở ─────────────────────────────────
function initDoanhThu() {
  dtPopulateSels();
  renderHopDongList();
  renderThuTable();
  // Set ngày mặc định = hôm nay
  const ngayEl = document.getElementById('thu-ngay');
  if (ngayEl && !ngayEl.value) ngayEl.value = today();
}


// ══════════════════════════════════════════════════════════════
// [MODULE: PHIẾU LƯƠNG] — xuatPhieuLuong · html2canvas
// Ctrl+F → "MODULE: PHIẾU LƯƠNG"
// ══════════════════════════════════════════════════════════════

function removeVietnameseTones(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // xóa dấu
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9\s_]/g, '')    // xóa ký tự đặc biệt
    .trim()
    .replace(/\s+/g, '_');
}

function xuatPhieuLuong() {
  // 1. Thu thập công nhân được tick từ bảng Tổng Lương Tuần
  //    Hỗ trợ cả table row (desktop) và card div (mobile)
  const rows = [];
  document.querySelectorAll('.cc-tlt-chk:checked').forEach(chk => {
    const container = chk.closest('[data-name]');
    if (!container) return;
    const name     = container.dataset.name || '(Chưa đặt tên)';
    const fromDate = container.dataset.from  || '';
    const toDate   = container.dataset.to    || '';
    const tc       = parseFloat(container.dataset.tc)   || 0;
    const tl       = parseInt(container.dataset.tl)     || 0; // tc * luong
    const pc       = parseInt(container.dataset.pc)     || 0; // phụ cấp
    const hdml     = parseInt(container.dataset.hdml)   || 0; // HĐ mua lẻ
    const cts      = (container.dataset.cts || '').split('|').filter(Boolean);
    const tongCong = tl + pc + hdml;
    const luongTB  = tc > 0 ? Math.round(tl / tc) : 0;
    rows.push({ name, fromDate, toDate, tc, tl, pc, hdml, cts, tongCong, luongTB });
  });

  if (!rows.length) {
    toast('⚠️ Tick chọn ít nhất 1 công nhân trong bảng Tổng Lương Tuần!', 'error');
    return;
  }

  // 2. Tổng hợp thông tin chung
  const allFrom = rows.map(r => r.fromDate).filter(Boolean).sort();
  const allTo   = rows.map(r => r.toDate).filter(Boolean).sort();
  const fromDt  = allFrom[0] || '';
  const toDt    = allTo[allTo.length - 1] || '';
  const period  = fromDt && toDt ? _fmtDate(fromDt) + ' — ' + _fmtDate(toDt) : '(Chưa rõ)';

  const allCts     = [...new Set(rows.flatMap(r => r.cts))];
  const ctLabel    = allCts.join(', ') || '(Nhiều công trình)';
  const today_     = new Date().toLocaleDateString('vi-VN');
  const tongThanhToan = rows.reduce((s, r) => s + r.tongCong, 0);

  // 3. Đổ dữ liệu vào template
  document.getElementById('pl-ct-name').textContent = ctLabel;
  document.getElementById('pl-ct-label').textContent = ctLabel;
  document.getElementById('pl-period').textContent   = period;
  document.getElementById('pl-date').textContent     = today_;

  document.getElementById('pl-tbody').innerHTML = rows.map(r => `
    <tr>
      <td>${x(r.name)}</td>
      <td>${r.tc}</td>
      <td>${r.luongTB ? numFmt(r.luongTB) + ' đ' : '—'}</td>
      <td>${r.pc ? numFmt(r.pc) + ' đ' : '—'}</td>
      <td style="color:#c0392b">${r.hdml ? numFmt(r.hdml) + ' đ' : '—'}</td>
      <td style="font-weight:700;color:#c8870a">${numFmt(r.tongCong)} đ</td>
    </tr>`).join('');

  document.getElementById('pl-total-cell').textContent  = numFmt(tongThanhToan) + ' đ';
  document.getElementById('pl-grand-total').textContent =
    'TỔNG TIỀN THANH TOÁN: ' + numFmt(tongThanhToan) + ' đồng';

  // 4. Hiện template tạm để chụp
  const tpl = document.getElementById('phieu-luong-template');
  tpl.style.display = 'block';

  // 5. Chụp bằng html2canvas
  const safeCT = removeVietnameseTones(ctLabel);
  const workerParts = rows.map(r =>
    removeVietnameseTones(r.name) + '_' + r.tc + 'cong'
  ).join('_');
  const fileName = 'Phieuluong_' + safeCT + '_' + workerParts;
  toast('⏳ Đang tạo phiếu lương...', 'info');

  document.fonts.ready.then(() => {
    html2canvas(tpl, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      windowWidth: 760
    }).then(canvas => {
      tpl.style.display = 'none';
      const link = document.createElement('a');
      link.download = fileName + '.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast('✅ Đã xuất phiếu lương ' + rows.length + ' người!', 'success');
    }).catch(err => {
      tpl.style.display = 'none';
      console.error('html2canvas error:', err);
      toast('❌ Lỗi khi tạo ảnh: ' + err.message, 'error');
    });
  });
}

// Helper: format ngày YYYY-MM-DD → DD/MM/YYYY
function exportUngToImage() {
  // 1. Lấy các dòng được tick (dựa vào data-id khớp filteredUng)
  const checkedIds = new Set(
    [...document.querySelectorAll('.ung-row-chk:checked')].map(el => el.dataset.id)
  );
  if (!checkedIds.size) {
    toast('⚠️ Vui lòng tick chọn ít nhất 1 khoản ứng!', 'error');
    return;
  }
  const rows = filteredUng.filter(r => checkedIds.has(String(r.id)));
  if (!rows.length) {
    toast('⚠️ Không tìm thấy dữ liệu — thử lọc lại rồi tick chọn!', 'error');
    return;
  }

  // 2. Thông tin chung
  const ct       = rows[0]?.congtrinh || '(Chưa rõ CT)';
  const tongTien = rows.reduce((s, r) => s + (r.tien || 0), 0);

  // 3. Đổ dữ liệu vào template
  document.getElementById('pul-ct-name').textContent  = ct;
  document.getElementById('pul-ct-label').textContent = ct;
  document.getElementById('pul-date').textContent     = new Date().toLocaleDateString('vi-VN');

  document.getElementById('pul-tbody').innerHTML = rows.map((r, i) => `
    <tr style="${i % 2 === 1 ? 'background:#f9f7f4' : ''}">
      <td style="padding:8px 10px;white-space:nowrap">${r.ngay}</td>
      <td style="padding:8px 10px;font-weight:600">${x(r.tp || '—')}</td>
      <td style="padding:8px 10px;color:#555">${x(r.nd || '—')}</td>
      <td style="padding:8px 10px;text-align:right;font-weight:700;color:#c8870a;white-space:nowrap">
        ${numFmt(r.tien || 0)} đ
      </td>
    </tr>`).join('');

  document.getElementById('pul-total-cell').textContent   = numFmt(tongTien) + ' đ';
  document.getElementById('pul-grand-total').textContent  =
    'TỔNG TIỀN TẠM ỨNG: ' + numFmt(tongTien) + ' đồng';

  // 4. Tạo tên file:  Phieuung_TenCT_TenTP1_500k_TenTP2_300k.png
  const safeCT = removeVietnameseTones(ct);
  const tpMap  = {};
  rows.forEach(r => {
    const key = r.tp || 'KhongRo';
    tpMap[key] = (tpMap[key] || 0) + (r.tien || 0);
  });
  const workerParts = Object.entries(tpMap)
    .map(([tp, tien]) => removeVietnameseTones(tp) + '_' + Math.round(tien / 1000) + 'k')
    .join('_');
  const fileName = 'Phieuung_' + safeCT + '_' + workerParts;

  // 5. Chụp ảnh
  const tpl = document.getElementById('phieu-ung-template');
  tpl.style.display = 'block';
  toast('⏳ Đang tạo phiếu tạm ứng...', 'info');

  document.fonts.ready.then(() => {
    html2canvas(tpl, {
      scale: 2, backgroundColor: '#ffffff',
      useCORS: true, logging: false, windowWidth: 760
    }).then(canvas => {
      tpl.style.display = 'none';
      const link = document.createElement('a');
      link.download = fileName + '.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast('✅ Đã xuất phiếu tạm ứng ' + rows.length + ' dòng!', 'success');
    }).catch(err => {
      tpl.style.display = 'none';
      toast('❌ Lỗi khi tạo ảnh: ' + err.message, 'error');
    });
  });
}

function _fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return d + '/' + m + '/' + y;
}

