// doanhtu.js — Doanh Thu / Hop Dong / Dashboard
// Load order: 6

// Khai bao bien (dung chung voi lib.js/gsLoadAll)
let hopDongData = load('hopdong_v1', {});
let thuRecords  = load('thu_v1', []);

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