/* =========================================================
   MAJU ABADI ERP — GOOGLE SHEETS CONNECTOR
   URL Web App Google Apps Script sudah permanen (hardcoded)
   di DEFAULT_API_URLS di bawah ini.
   ========================================================= */

// Setiap modul punya Web App Google Apps Script sendiri-sendiri (URL beda-beda).
// URL ini sudah permanen (hardcoded) — tidak lagi diatur lewat menu Pengaturan API.
const MODULES = ['inventory','finance','tasks','routines','goals','notes'];
const DEFAULT_API_URLS = {
  inventory: 'https://script.google.com/macros/s/AKfycbwmfDjOKGeJ0DK-nbEIGnDpXpXx5K041vWrhvA9tXcNIuaQrYjfUA7fFfw8L-Vy6I3fVg/exec',
  finance: 'https://script.google.com/macros/s/AKfycbxt1imcKcfNWeC3FTrogup1YWGpJYHT8CbLaTuB0hvXr3sTF1mtoOoWvxRTls2OKOBY/exec',
  tasks: 'https://script.google.com/macros/s/AKfycby23H_CQlayULvq-i6-9U1DdZgZqtVxVS2DIcJk321E1KL3Iu-P5vsq5nj2kN8H0Vvt/exec',
  routines: 'https://script.google.com/macros/s/AKfycbxT6Gj2vzZqc2rPLtPnXDAnhoi2NW8YOfU3w4KGnL55sKTpSH-OjnrrCmJEat0WPEz2qQ/exec',
  goals: 'https://script.google.com/macros/s/AKfycbw4A82KcZ7qTp_uyxmlXB2fAm-RKO199eOT3EOFgH3BX-F-0-hl89VyKOnQRJ9HkvN8vA/exec',
  notes: 'https://script.google.com/macros/s/AKfycbz0Yr0ApRJO2IJoQaysrO-CJaTcH_z4SBi5yqFFVud6s9h4ENAHVHh7HKpL7I7NEA7Z_A/exec'
};
// Pemetaan action -> modul, dipakai supaya api(action, data) tahu URL mana yang harus dipanggil.
const ACTION_MODULE_MAP = {
  getInventory: 'inventory', saveInventory: 'inventory', updateInventory: 'inventory', deleteInventory: 'inventory',
  getFinance: 'finance', saveFinance: 'finance', updateFinance: 'finance', deleteFinance: 'finance',
  getTasks: 'tasks', saveTask: 'tasks', updateTask: 'tasks', deleteTask: 'tasks',
  getRoutines: 'routines', saveRoutine: 'routines', updateRoutine: 'routines', deleteRoutine: 'routines',
  getGoals: 'goals', saveGoal: 'goals', updateGoal: 'goals', deleteGoal: 'goals',
  getNotes: 'notes', saveNote: 'notes', updateNote: 'notes', deleteNote: 'notes'
};
let state = { inventory: [], finance: [], tasks: [], routines: [], goals: [], notes: [] };
let routineHistory = JSON.parse(localStorage.getItem('lifeRoutineHistory') || '{}');
let editingInventoryId = null;
let editingFinanceId = null;
let editingTaskId = null;
let editingProjectId = null;
let taskModalMode = 'task';
let editingRoutineId = null;
const DAILY_FOCUS_KEY = 'lifeDailyFocus';
let financeModuleChart = null;
let financeCategoryChart = null;

function $(id) { return document.getElementById(id); }

function getApiUrls() {
  return { ...DEFAULT_API_URLS };
}

function getApiUrl(moduleKey) {
  return (getApiUrls()[moduleKey] || '').trim();
}

function showToast(message, type = 'success') {
  const stack = $('toast-stack');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = `toast-item ${type}`;
  el.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}"></i><span>${escapeHtml(message)}</span>`;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function formatRupiah(value) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value) || 0);
}

async function api(action, data = {}) {
  const moduleKey = ACTION_MODULE_MAP[action];
  if (!moduleKey) throw new Error('Action "' + action + '" tidak dikenal di sisi frontend.');
  const url = getApiUrl(moduleKey);
  if (!url) throw new Error(`URL Google Apps Script untuk modul "${moduleKey}" belum diatur di DEFAULT_API_URLS.`);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, data })
  });
  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch (_) {
    throw new Error('API tidak mengembalikan JSON. Pastikan URL Web App menggunakan deployment terbaru dan berakhiran /exec.');
  }
  if (!result.ok) throw new Error(result.error || 'Terjadi kesalahan API.');
  return result;
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.items)) return value.items;
  if (value && Array.isArray(value.rows)) return value.rows;
  if (value && Array.isArray(value.data)) return value.data;
  return [];
}

function pickApiArray(obj, aliases) {
  if (!obj || typeof obj !== 'object') return [];
  for (const key of aliases) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const arr = normalizeArray(obj[key]);
      if (arr.length || Array.isArray(obj[key]) || (obj[key] && typeof obj[key] === 'object')) return arr;
    }
  }
  const normalized = Object.keys(obj).reduce((acc, key) => {
    acc[key.toLowerCase().replace(/[^a-z0-9]+/g, '')] = obj[key];
    return acc;
  }, {});
  for (const key of aliases) {
    const nk = key.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (Object.prototype.hasOwnProperty.call(normalized, nk)) return normalizeArray(normalized[nk]);
  }
  return [];
}

function normalizeApiData(payload) {
  // Accept current, legacy, and Indonesian response key names.
  let d = payload?.data ?? payload ?? {};
  for (let i = 0; i < 3; i++) {
    if (d && d.data && typeof d.data === 'object' && !Array.isArray(d.data)) d = d.data;
    else break;
  }
  return {
    inventory: pickApiArray(d, ['inventory','inventaris','aset','assets','assetInventaris']),
    finance: pickApiArray(d, ['finance','keuangan','keuanganPribadi']),
    tasks: pickApiArray(d, ['tasks','task','tugas','tugasProyek']),
    routines: pickApiArray(d, ['routines','routine','rutinitas','kebiasaan']),
    goals: pickApiArray(d, ['goals','goal','target','targetGoals']),
    notes: pickApiArray(d, ['notes','note','catatan','catatanPribadi'])
  };
}

// Cache-first: tampilkan data hasil sync terakhir (dari localStorage) secara
// instan saat halaman dibuka, sebelum data terbaru selesai diambil dari Google
// Sheet. Menghilangkan kesan "loading lama" walau koneksi ke Apps Script lambat.
function loadCachedState() {
  try {
    const cached = JSON.parse(localStorage.getItem('lifeOSCachedState') || 'null');
    if (!cached || typeof cached !== 'object') return false;
    state = { inventory: [], finance: [], tasks: [], routines: [], goals: [], notes: [], ...cached };
    renderInventory(); renderFinance(); renderTasks(); renderRoutines(); renderGoals(); renderNotes(); updateDashboard();
    if (localStorage.getItem('lifeLastSync')) setText('last-sync-text', 'Data cache — memuat data terbaru...');
    return true;
  } catch (_) {
    return false;
  }
}

async function syncData(silent = false) {
  try {
    // Read every Life OS module independently. This prevents one incomplete/legacy
    // getAll response from making Tugas/Rutinitas/Target/Catatan appear empty.
    const actions = [
      ['inventory','getInventory'], ['finance','getFinance'], ['tasks','getTasks'],
      ['routines','getRoutines'], ['goals','getGoals'], ['notes','getNotes']
    ];
    const results = await Promise.all(actions.map(async ([key, action]) => {
      try {
        return [key, normalizeApiData(await api(action))[key], null];
      } catch (err) {
        return [key, [], err];
      }
    }));

    // Catatan: tiap modul sekarang punya Web App sendiri, jadi tidak ada lagi
    // fallback ke 'getAll' gabungan — kalau satu modul gagal, cukup modul itu saja yang kosong.
    state = Object.fromEntries(results.map(([key, arr]) => [key, Array.isArray(arr) ? arr : []]));
    renderInventory(); renderFinance(); renderTasks(); renderRoutines(); renderGoals(); renderNotes(); updateDashboard();

    const total = Object.values(state).reduce((n, arr) => n + arr.length, 0);
    const failedNames = results.filter(([,arr,err]) => err).map(([key]) => key);
    localStorage.setItem('lifeLastSync', new Date().toISOString());
    // Simpan hasil sync ke cache lokal supaya kunjungan berikutnya bisa langsung
    // tampil instan dari cache sambil data terbaru diambil di belakang layar.
    try { localStorage.setItem('lifeOSCachedState', JSON.stringify(state)); } catch (_) {}
    setConnectionStatus(true);
    setText('last-sync-text', 'Terakhir sinkron: ' + new Date().toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'}));

    if (!silent) {
      if (total === 0) showToast('API tersambung, tetapi belum ada data yang terbaca. Buka Diagnostik Data untuk melihat nama Sheet dan jumlah baris.', 'error');
      else if (failedNames.length) showToast(`Data tersinkron sebagian (${total} item). Gagal membaca: ${failedNames.join(', ')}.`, 'error');
      else showToast(`Data tersinkron: ${total} item dari Google Sheet.`);
    }
  } catch (err) {
    setConnectionStatus(false); setText('last-sync-text', 'Gagal sinkron');
    if (!silent) showToast(err.message, 'error');
    console.error('syncData error:', err);
  }
}

function setConnectionStatus(connected) {
  const btn = $('sync-btn');
  if (!btn) return;
  btn.innerHTML = connected
    ? '<i class="fa-solid fa-cloud-arrow-down me-1"></i> Sinkronkan Data'
    : '<i class="fa-solid fa-link me-1"></i> Hubungkan Google Sheet';
}

function getInventoryFiltered() {
  const items = state.inventory || [];
  const q = String($('inventory-search')?.value || '').trim().toLowerCase();
  const category = String($('inventory-filter-category')?.value || '');
  const location = String($('inventory-filter-location')?.value || '');
  const condition = String($('inventory-filter-condition')?.value || '');
  const status = String($('inventory-filter-status')?.value || '');

  return items.filter(item => {
    const haystack = [
      item.ID, item['Nama Barang'], item.Kategori, item.Lokasi, item.Catatan,
      item.Kondisi, item.Status
    ].join(' ').toLowerCase();
    return (!q || haystack.includes(q))
      && (!category || String(item.Kategori || '') === category)
      && (!location || String(item.Lokasi || '') === location)
      && (!condition || String(item.Kondisi || '') === condition)
      && (!status || String(item.Status || '') === status);
  });
}

function inventoryBadge(value, type) {
  const v = String(value || '-');
  let cls = 'text-bg-secondary';
  if (type === 'condition') {
    if (v === 'Baik') cls = 'text-bg-success';
    else if (v === 'Rusak Ringan') cls = 'text-bg-warning';
    else if (v === 'Rusak Berat') cls = 'text-bg-danger';
  } else {
    if (v === 'Tersedia') cls = 'text-bg-success';
    else if (v === 'Digunakan') cls = 'text-bg-primary';
    else if (v === 'Dipinjam') cls = 'text-bg-warning';
    else if (v === 'Maintenance') cls = 'text-bg-info';
  }
  return `<span class="badge ${cls}">${escapeHtml(v)}</span>`;
}

function refreshInventoryFilterOptions() {
  const items = state.inventory || [];
  const unique = key => [...new Set(items.map(x => String(x[key] || '').trim()).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'id'));
  const fill = (id, values, label) => {
    const el = $(id); if (!el) return;
    const current = el.value;
    el.innerHTML = `<option value="">${label}</option>` + values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    if (values.includes(current)) el.value = current;
  };
  fill('inventory-filter-category', unique('Kategori'), 'Semua Kategori');
  fill('inventory-filter-location', unique('Lokasi'), 'Semua Lokasi');

  const dl = $('inventory-location-list');
  if (dl) dl.innerHTML = unique('Lokasi').map(v => `<option value="${escapeHtml(v)}"></option>`).join('');
}

function renderInventory() {
  const tbody = $('inventory-table-body');
  if (!tbody) return;
  refreshInventoryFilterOptions();
  const rows = getInventoryFiltered();
  const countEl = $('inventory-result-count');
  if (countEl) countEl.textContent = `${rows.length} dari ${(state.inventory || []).length} aset ditampilkan`;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><i class="fa-solid fa-box-open"></i>${(state.inventory || []).length ? 'Tidak ada aset yang cocok dengan filter.' : 'Belum ada aset. Klik <b>Tambah Aset</b> untuk mulai.'}</div></td></tr>`;
    updateInventoryDashboard();
    return;
  }

  tbody.innerHTML = rows.map(item => `
    <tr>
      <td><strong>${escapeHtml(item['Nama Barang'])}</strong><div class="small text-secondary">${escapeHtml(item.ID)}</div></td>
      <td>${escapeHtml(item.Kategori || '-')}</td>
      <td>${escapeHtml(item.Lokasi || '-')}</td>
      <td>${escapeHtml(item.Jumlah ?? 0)}</td>
      <td>${formatRupiah(item['Harga Satuan'])}</td>
      <td><strong>${formatRupiah(item['Total Nilai'])}</strong></td>
      <td>${inventoryBadge(item.Kondisi, 'condition')}</td>
      <td>${inventoryBadge(item.Status, 'status')}</td>
      <td class="text-nowrap">
        <button class="btn btn-sm btn-outline-light me-1" title="Edit" onclick="editInventory('${escapeHtml(item.ID)}')"><i class="fa-solid fa-pen"></i></button>
        <button class="btn btn-sm btn-outline-danger" title="Hapus" onclick="deleteInventory('${escapeHtml(item.ID)}')"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>`).join('');
  updateInventoryDashboard();
}

function updateInventoryDashboard() {
  const items = state.inventory || [];
  const qty = items.reduce((s,x) => s + Number(x.Jumlah || 0), 0);
  const value = items.reduce((s,x) => s + Number(x['Total Nilai'] || 0), 0);
  const attention = items.filter(x => ['Rusak Ringan','Rusak Berat'].includes(String(x.Kondisi)) || ['Maintenance','Hilang'].includes(String(x.Status))).length;
  setText('inv-dash-count', items.length);
  setText('inv-dash-qty', qty);
  setText('inv-dash-value', formatRupiah(value));
  setText('inv-dash-attention', attention);
}

function resetInventoryFilters() {
  ['inventory-search','inventory-filter-category','inventory-filter-location','inventory-filter-condition','inventory-filter-status'].forEach(id => { if ($(id)) $(id).value = ''; });
  renderInventory();
}

function prepareNewInventory() {
  editingInventoryId = null;
  $('inventory-form')?.reset();
  if ($('inv-qty')) $('inv-qty').value = 1;
  if ($('inv-category')) $('inv-category').value = 'Elektronik';
  if ($('inv-condition')) $('inv-condition').value = 'Baik';
  if ($('inv-status')) $('inv-status').value = 'Tersedia';
  const title = document.querySelector('#inventoryModal .modal-title');
  if (title) title.textContent = 'Tambah Aset';
  updateInventoryTotalPreview();
}

function updateInventoryTotalPreview() {
  const qty = Number($('inv-qty')?.value || 0);
  const value = Number($('inv-value')?.value || 0);
  setText('inv-total-preview', formatRupiah(qty * value));
}

function getFinanceFiltered() {
  const rows = state.finance || [];
  const q = String($('finance-search')?.value || '').trim().toLowerCase();
  const type = String($('finance-filter-type')?.value || '');
  const category = String($('finance-filter-category')?.value || '');
  const month = String($('finance-filter-month')?.value || '');
  return rows.filter(x => {
    const haystack = [x.ID, x.Tanggal, x.Keterangan, x.Kategori, x.Tipe, x.Catatan].join(' ').toLowerCase();
    const normalizedType = String(x.Tipe || '').toLowerCase().includes('masuk') || String(x.Tipe || '').toLowerCase() === 'income' ? 'income' : 'expense';
    return (!q || haystack.includes(q)) && (!type || normalizedType === type) && (!category || String(x.Kategori || '') === category) && (!month || String(x.Tanggal || '').slice(0,7) === month);
  }).sort((a,b) => String(b.Tanggal || '').localeCompare(String(a.Tanggal || '')));
}

function refreshFinanceFilterOptions() {
  const el = $('finance-filter-category'); if (!el) return;
  const current = el.value;
  const cats = [...new Set((state.finance || []).map(x => String(x.Kategori || '').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'id'));
  el.innerHTML = '<option value="">Semua Kategori</option>' + cats.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  if (cats.includes(current)) el.value = current;
}

function financeTypeBadge(value) {
  const isIncome = String(value || '').toLowerCase().includes('masuk') || String(value || '').toLowerCase() === 'income';
  return `<span class="badge ${isIncome ? 'text-bg-success' : 'text-bg-danger'}"><i class="fa-solid ${isIncome ? 'fa-arrow-down' : 'fa-arrow-up'} me-1"></i>${isIncome ? 'Pemasukan' : 'Pengeluaran'}</span>`;
}

function renderFinance() {
  const tbody = $('finance-table-body'); if (!tbody) return;
  refreshFinanceFilterOptions();
  const rows = getFinanceFiltered();
  setText('finance-result-count', `${rows.length} dari ${(state.finance || []).length} transaksi ditampilkan`);
  tbody.innerHTML = rows.length ? rows.map(x => `
    <tr><td>${escapeHtml(x.Tanggal || '-')}</td><td><strong>${escapeHtml(x.Keterangan || '-')}</strong><div class="small text-secondary">${escapeHtml(x.ID || '')}</div></td><td>${escapeHtml(x.Kategori || '-')}</td><td>${financeTypeBadge(x.Tipe)}</td><td class="fw-semibold">${formatRupiah(x.Jumlah)}</td><td class="small text-secondary">${escapeHtml(x.Catatan || '-')}</td><td class="text-nowrap"><button class="btn btn-sm btn-outline-light me-1" title="Edit" onclick="editFinance('${escapeHtml(x.ID)}')"><i class="fa-solid fa-pen"></i></button><button class="btn btn-sm btn-outline-danger" title="Hapus" onclick="deleteFinance('${escapeHtml(x.ID)}')"><i class="fa-solid fa-trash"></i></button></td></tr>`).join('') : `<tr><td colspan="7"><div class="empty-state"><i class="fa-solid fa-wallet"></i>${(state.finance || []).length ? 'Tidak ada transaksi yang cocok dengan filter.' : 'Belum ada transaksi. Klik <b>Tambah Transaksi</b> untuk mulai.'}</div></td></tr>`;
  updateFinanceDashboard();
  renderLifeDashboard();
}

function updateFinanceDashboard() {
  const rows = state.finance || [];
  const income = rows.filter(x => String(x.Tipe || '').toLowerCase().includes('masuk') || String(x.Tipe || '').toLowerCase() === 'income').reduce((s,x)=>s+Number(x.Jumlah||0),0);
  const expense = rows.filter(x => !(String(x.Tipe || '').toLowerCase().includes('masuk') || String(x.Tipe || '').toLowerCase() === 'income')).reduce((s,x)=>s+Number(x.Jumlah||0),0);
  setText('fin-dash-income', formatRupiah(income)); setText('fin-dash-expense', formatRupiah(expense)); setText('fin-dash-balance', formatRupiah(income-expense)); setText('fin-dash-count', rows.length);
  setText('dash-total-income', formatRupiah(income)); setText('dash-total-expense', formatRupiah(expense));
  renderFinanceCharts();
}

function resetFinanceFilters() { ['finance-search','finance-filter-type','finance-filter-category','finance-filter-month'].forEach(id=>{ if($(id)) $(id).value=''; }); renderFinance(); }

function prepareNewFinance() {
  editingFinanceId = null; $('finance-form')?.reset();
  if ($('fin-date')) $('fin-date').value = new Date().toISOString().slice(0,10);
  if ($('fin-type')) $('fin-type').value = 'expense';
  const title=document.querySelector('#financeModal .modal-title'); if(title) title.textContent='Tambah Transaksi';
}

function editFinance(id) {
  const x=(state.finance||[]).find(r=>String(r.ID)===String(id)); if(!x) return;
  editingFinanceId=id; $('fin-date').value=String(x.Tanggal||'').slice(0,10);
  const raw=String(x.Tipe||'').toLowerCase(); $('fin-type').value=(raw.includes('masuk')||raw==='income')?'income':'expense';
  $('fin-description').value=x.Keterangan||''; $('fin-category').value=x.Kategori||''; $('fin-amount').value=Number(x.Jumlah||0); $('fin-notes').value=x.Catatan||'';
  const title=document.querySelector('#financeModal .modal-title'); if(title) title.textContent='Edit Transaksi';
  bootstrap.Modal.getOrCreateInstance($('financeModal')).show();
}

async function deleteFinance(id) {
  if(!confirm('Hapus transaksi ini dari Google Sheet? Tindakan ini tidak dapat dibatalkan.')) return;
  try { await api('deleteFinance',{id}); await syncData(true); showToast('Transaksi berhasil dihapus.'); } catch(err){ showToast(err.message,'error'); }
}

function renderFinanceCharts() {
  if (typeof Chart === 'undefined') return;
  const rows=state.finance||[];
  const now=new Date(); const months=[];
  for(let i=11;i>=0;i--){ const d=new Date(now.getFullYear(),now.getMonth()-i,1); months.push({key:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,label:d.toLocaleDateString('id-ID',{month:'short',year:'2-digit'})}); }
  const income=months.map(m=>rows.filter(x=>String(x.Tanggal||'').slice(0,7)===m.key && (String(x.Tipe||'').toLowerCase().includes('masuk')||String(x.Tipe||'').toLowerCase()==='income')).reduce((s,x)=>s+Number(x.Jumlah||0),0));
  const expense=months.map(m=>rows.filter(x=>String(x.Tanggal||'').slice(0,7)===m.key && !(String(x.Tipe||'').toLowerCase().includes('masuk')||String(x.Tipe||'').toLowerCase()==='income')).reduce((s,x)=>s+Number(x.Jumlah||0),0));
  const ctx=$('financeModuleChart'); if(ctx){ if(financeModuleChart) financeModuleChart.destroy(); financeModuleChart=new Chart(ctx,{type:'bar',data:{labels:months.map(m=>m.label),datasets:[{label:'Pemasukan',data:income},{label:'Pengeluaran',data:expense}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{ticks:{callback:v=>formatRupiah(v)}}}}}); }
  const cats={}; rows.forEach(x=>{const isInc=String(x.Tipe||'').toLowerCase().includes('masuk')||String(x.Tipe||'').toLowerCase()==='income'; if(!isInc){const c=x.Kategori||'Lainnya';cats[c]=(cats[c]||0)+Number(x.Jumlah||0);}});
  const top=Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,7); const cctx=$('financeCategoryChart'); if(cctx){if(financeCategoryChart) financeCategoryChart.destroy(); financeCategoryChart=new Chart(cctx,{type:'doughnut',data:{labels:top.map(x=>x[0]),datasets:[{data:top.map(x=>x[1])}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}}}});}
}

function normalizeTaskStatus(value) {
  const s = String(value || 'todo').toLowerCase().replace(/\s+/g, '-');
  if (['done','selesai'].includes(s)) return 'done';
  if (['in-progress','sedang-dikerjakan','progress'].includes(s)) return 'in-progress';
  return 'todo';
}

function isTaskOverdue(task) {
  const status = normalizeTaskStatus(task.Status);
  const due = String(task['Batas Waktu'] || '').slice(0, 10);
  return status !== 'done' && due && due < new Date().toISOString().slice(0, 10);
}

function taskPriorityBadge(value) {
  const v = String(value || 'sedang').toLowerCase();
  const cls = v === 'tinggi' ? 'text-bg-danger' : v === 'rendah' ? 'text-bg-secondary' : 'text-bg-warning';
  return `<span class="badge ${cls}">${escapeHtml(v.charAt(0).toUpperCase()+v.slice(1))}</span>`;
}

function isProjectRecord(row) { return String(row.Jenis || '').toLowerCase() === 'proyek'; }
function getProjects() { return (state.tasks || []).filter(isProjectRecord); }
function getWorkTasks() { return (state.tasks || []).filter(x => !isProjectRecord(x)); }
function projectName(id) { const p = getProjects().find(x => String(x.ID) === String(id)); return p ? p.Judul : ''; }
function getTaskFiltered() {
  const rows = getWorkTasks();
  const q = String($('task-search')?.value || '').trim().toLowerCase();
  const status = String($('task-filter-status')?.value || '');
  const priority = String($('task-filter-priority')?.value || '');
  const category = String($('task-filter-category')?.value || '');
  return rows.filter(t => {
    const haystack = [t.ID, t.Judul, t.Kategori, t.Prioritas, t['Batas Waktu'], t.Status, t.Catatan, projectName(t.ProjectID)].join(' ').toLowerCase();
    return (!q || haystack.includes(q))
      && (!status || normalizeTaskStatus(t.Status) === status)
      && (!priority || String(t.Prioritas || '').toLowerCase() === priority)
      && (!category || String(t.Kategori || '') === category);
  }).sort((a,b) => String(a['Batas Waktu'] || '9999-12-31').localeCompare(String(b['Batas Waktu'] || '9999-12-31')));
}

function refreshTaskFilterOptions() {
  const el = $('task-filter-category'); if (!el) return;
  const current = el.value;
  const cats = [...new Set(getWorkTasks().map(x => String(x.Kategori || '').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'id'));
  el.innerHTML = '<option value="">Semua Kategori</option>' + cats.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  if (cats.includes(current)) el.value = current;
}

function renderTasks() {
  refreshTaskFilterOptions();
  const groups = { todo: [], 'in-progress': [], done: [] };
  getTaskFiltered().forEach(t => groups[normalizeTaskStatus(t.Status)].push(t));
  Object.entries(groups).forEach(([key, rows]) => {
    const box = $('kanban-' + key), count = $('count-' + key);
    if (count) count.textContent = rows.length;
    if (!box) return;
    box.innerHTML = rows.length ? rows.map(t => {
      const overdue = isTaskOverdue(t), due = String(t['Batas Waktu'] || '').slice(0,10);
      const dueText = due ? new Date(due + 'T00:00:00').toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : 'Tanpa deadline';
      const project = projectName(t.ProjectID), subs = String(t.Subtasks || '').split('\n').map(x=>x.trim()).filter(Boolean);
      return `<article class="kanban-card card mb-3 p-3 ${overdue ? 'overdue' : ''}"><div class="d-flex justify-content-between gap-2 align-items-start"><strong>${escapeHtml(t.Judul || '-')}</strong>${taskPriorityBadge(t.Prioritas)}</div>
        ${project ? `<div class="small task-project-chip mt-2"><i class="fa-solid fa-folder me-1"></i>${escapeHtml(project)}</div>` : ''}
        <div class="small text-secondary mt-2"><i class="fa-regular fa-calendar me-1"></i>${escapeHtml(dueText)}${overdue ? ' · <span class="text-danger fw-semibold">Terlambat</span>' : ''}</div>
        <div class="small text-secondary mt-1"><i class="fa-solid fa-tag me-1"></i>${escapeHtml(t.Kategori || 'Pribadi')}</div>
        ${t.Catatan ? `<div class="small mt-2 task-notes-preview">${escapeHtml(t.Catatan)}</div>` : ''}
        ${subs.length ? `<div class="task-subtask-preview mt-2"><small class="text-secondary">${subs.length} subtask</small><div class="small">${subs.slice(0,2).map(x=>`<div><i class="fa-regular fa-square me-1"></i>${escapeHtml(x)}</div>`).join('')}${subs.length>2?`<div class="text-secondary">+${subs.length-2} lainnya</div>`:''}</div></div>` : ''}
        <div class="d-flex flex-wrap gap-1 mt-3"><button class="btn btn-sm btn-outline-light" onclick="editTask('${escapeHtml(t.ID)}')"><i class="fa-solid fa-pen me-1"></i>Edit</button>${key !== 'done' ? `<button class="btn btn-sm btn-outline-success" onclick="completeTask('${escapeHtml(t.ID)}')"><i class="fa-solid fa-check me-1"></i>Selesai</button>` : ''}<button class="btn btn-sm btn-outline-danger ms-auto" onclick="deleteTask('${escapeHtml(t.ID)}')"><i class="fa-solid fa-trash"></i></button></div></article>`;
    }).join('') : `<div class="empty-state py-4"><i class="fa-solid fa-list-check"></i>Tidak ada tugas di bagian ini.</div>`;
  });
  updateTaskDashboard(); renderProjects();
}
function updateTaskDashboard() {
  const rows=getWorkTasks(), todo=rows.filter(t=>normalizeTaskStatus(t.Status)==='todo').length, prog=rows.filter(t=>normalizeTaskStatus(t.Status)==='in-progress').length, done=rows.filter(t=>normalizeTaskStatus(t.Status)==='done').length, overdue=rows.filter(isTaskOverdue).length;
  setText('task-dash-total',rows.length); setText('task-dash-todo',todo+prog); setText('task-dash-done',done); setText('task-dash-overdue',overdue); setText('project-count',getProjects().length);
  setText('dash-pending-tasks',todo+prog); setText('dash-completed-tasks',`${done} tugas selesai`);
}
function switchTaskView(view) {
  const board=view==='board'; $('task-board-view')?.classList.toggle('d-none',!board); $('task-projects-view')?.classList.toggle('d-none',board);
  $('task-view-board')?.classList.toggle('btn-primary',board); $('task-view-board')?.classList.toggle('btn-outline-light',!board);
  $('task-view-projects')?.classList.toggle('btn-primary',!board); $('task-view-projects')?.classList.toggle('btn-outline-light',board);
  if(!board)renderProjects();
}
function renderProjects() {
  const host=$('project-list'); if(!host)return;
  const q=String($('project-search')?.value||'').toLowerCase().trim(), status=String($('project-filter-status')?.value||'');
  const projects=getProjects().filter(p=>(!q||[p.Judul,p.Catatan,p.Kategori].join(' ').toLowerCase().includes(q))&&(!status||normalizeTaskStatus(p.Status)===status));
  host.innerHTML=projects.length?projects.map(p=>{
    const related=getWorkTasks().filter(t=>String(t.ProjectID||'')===String(p.ID)), done=related.filter(t=>normalizeTaskStatus(t.Status)==='done').length, pct=related.length?Math.round(done/related.length*100):0;
    const due=String(p['Batas Waktu']||'').slice(0,10), overdue=due&&due<new Date().toISOString().slice(0,10)&&normalizeTaskStatus(p.Status)!=='done';
    return `<div class="col-md-6 col-xl-4"><article class="card project-card h-100"><div class="card-body"><div class="d-flex justify-content-between align-items-start gap-2"><span class="badge text-bg-secondary">PROYEK</span>${taskPriorityBadge(p.Prioritas||'sedang')}</div><h5 class="fw-bold mt-3 mb-1">${escapeHtml(p.Judul||'Tanpa judul')}</h5><p class="small text-secondary project-description">${escapeHtml(p.Catatan||'Belum ada deskripsi proyek.')}</p><div class="d-flex justify-content-between small mb-2"><span class="text-secondary">Progress</span><strong>${pct}%</strong></div><div class="progress project-progress mb-3"><div class="progress-bar" style="width:${pct}%"></div></div><div class="d-flex justify-content-between small text-secondary"><span>${done}/${related.length} tugas selesai</span><span class="${overdue?'text-danger':''}">${due?'Deadline '+new Date(due+'T00:00:00').toLocaleDateString('id-ID',{day:'2-digit',month:'short'}):'Tanpa deadline'}</span></div><div class="d-flex gap-2 mt-3"><button class="btn btn-sm btn-outline-light" onclick="showProjectTasks('${escapeHtml(p.ID)}')"><i class="fa-solid fa-list-check me-1"></i>Lihat tugas</button><button class="btn btn-sm btn-outline-light" onclick="editProject('${escapeHtml(p.ID)}')"><i class="fa-solid fa-pen"></i></button><button class="btn btn-sm btn-outline-danger ms-auto" onclick="deleteProject('${escapeHtml(p.ID)}')"><i class="fa-solid fa-trash"></i></button></div></div></article></div>`;
  }).join(''):`<div class="col-12"><div class="empty-state py-5"><i class="fa-solid fa-folder-open"></i>Belum ada proyek. Buat proyek pertama untuk mengelompokkan tugas.</div></div>`;
}
function showProjectTasks(id) { const p=getProjects().find(x=>String(x.ID)===String(id)); if(!p)return; switchTaskView('board'); $('task-search').value=p.Judul||''; renderTasks(); }

function resetTaskFilters() {
  ['task-search','task-filter-status','task-filter-priority','task-filter-category'].forEach(id => { if ($(id)) $(id).value = ''; });
  renderTasks();
}

function refreshTaskProjectOptions(selected='') { const el=$('task-project'); if(!el)return; el.innerHTML='<option value="">Tugas mandiri</option>'+getProjects().map(p=>`<option value="${escapeHtml(p.ID)}">${escapeHtml(p.Judul)}</option>`).join(''); el.value=selected||''; }
function prepareNewTask() {
  editingTaskId=null; editingProjectId=null; taskModalMode='task'; $('task-form')?.reset();
  const submit=document.querySelector('#task-form button[type="submit"]'); if(submit)submit.innerHTML='<i class="fa-solid fa-floppy-disk me-1"></i>Simpan Tugas';
  if($('task-priority'))$('task-priority').value='sedang'; if($('task-status'))$('task-status').value='todo'; if($('task-category'))$('task-category').value='Pribadi';
  $('task-priority-wrap')?.classList.remove('d-none'); $('task-project-wrap')?.classList.remove('d-none'); $('task-subtasks-wrap')?.classList.remove('d-none'); $('project-mode-hint')?.classList.add('d-none');
  const title=document.querySelector('#taskModal .modal-title'); if(title)title.textContent='Tambah Tugas'; refreshTaskProjectOptions();
}
function openNewProject() {
  prepareNewTask(); taskModalMode='project'; $('task-priority-wrap')?.classList.add('d-none'); $('task-project-wrap')?.classList.add('d-none'); $('task-subtasks-wrap')?.classList.add('d-none'); $('project-mode-hint')?.classList.remove('d-none');
  const title=document.querySelector('#taskModal .modal-title'); if(title)title.textContent='Buat Proyek Baru'; const btn=document.querySelector('#task-form button[type="submit"]'); if(btn)btn.innerHTML='<i class="fa-solid fa-folder-plus me-1"></i>Simpan Proyek'; bootstrap.Modal.getOrCreateInstance($('taskModal')).show();
}
function editProject(id) {
  const p=getProjects().find(x=>String(x.ID)===String(id)); if(!p)return; prepareNewTask(); taskModalMode='project'; editingProjectId=id;
  $('task-title').value=p.Judul||''; $('task-category').value=p.Kategori||'Pekerjaan'; $('task-due').value=String(p['Batas Waktu']||'').slice(0,10); $('task-status').value=normalizeTaskStatus(p.Status); $('task-notes').value=p.Catatan||'';
  $('task-priority-wrap')?.classList.add('d-none'); $('task-project-wrap')?.classList.add('d-none'); $('task-subtasks-wrap')?.classList.add('d-none'); $('project-mode-hint')?.classList.remove('d-none');
  const title=document.querySelector('#taskModal .modal-title'); if(title)title.textContent='Edit Proyek'; const btn=document.querySelector('#task-form button[type="submit"]'); if(btn)btn.innerHTML='<i class="fa-solid fa-floppy-disk me-1"></i>Simpan Proyek'; bootstrap.Modal.getOrCreateInstance($('taskModal')).show();
}
function editTask(id) {
  const t=getWorkTasks().find(x=>String(x.ID)===String(id)); if(!t)return; prepareNewTask(); editingTaskId=id;
  $('task-title').value=t.Judul||''; $('task-category').value=t.Kategori||'Pribadi'; $('task-priority').value=String(t.Prioritas||'sedang').toLowerCase(); $('task-due').value=String(t['Batas Waktu']||'').slice(0,10); $('task-status').value=normalizeTaskStatus(t.Status); $('task-notes').value=t.Catatan||''; $('task-subtasks').value=t.Subtasks||''; refreshTaskProjectOptions(t.ProjectID||'');
  const title=document.querySelector('#taskModal .modal-title'); if(title)title.textContent='Edit Tugas'; bootstrap.Modal.getOrCreateInstance($('taskModal')).show();
}
async function saveTaskItem(event) {
  event.preventDefault(); const isProject=taskModalMode==='project';
  const data=isProject?{id:editingProjectId||undefined,Jenis:'Proyek',Judul:$('task-title').value.trim(),Kategori:$('task-category').value,Prioritas:'sedang','Batas Waktu':$('task-due').value,Status:$('task-status').value,Catatan:$('task-notes').value.trim(),ProjectID:''}:{id:editingTaskId||undefined,Jenis:'Tugas',Judul:$('task-title').value.trim(),Kategori:$('task-category').value,Prioritas:$('task-priority').value,'Batas Waktu':$('task-due').value,Status:$('task-status').value,Catatan:$('task-notes').value.trim(),ProjectID:$('task-project').value,Subtasks:$('task-subtasks').value.trim()};
  if(!data.Judul){showToast(isProject?'Nama proyek wajib diisi.':'Judul tugas wajib diisi.','error');return;}
  try { await api((isProject?editingProjectId:editingTaskId)?'updateTask':'saveTask',data); bootstrap.Modal.getOrCreateInstance($('taskModal')).hide(); editingTaskId=null; editingProjectId=null; taskModalMode='task'; await syncData(true); showToast(isProject?'Proyek berhasil disimpan.':'Tugas berhasil disimpan.'); }
  catch(err){showToast(err.message,'error');}
}
async function completeTask(id) { const t=getWorkTasks().find(x=>String(x.ID)===String(id)); if(!t)return; try{await api('updateTask',{id,Status:'done'});await syncData(true);showToast('Tugas ditandai selesai.');}catch(err){showToast(err.message,'error');} }
async function deleteTask(id) { if(!confirm('Hapus tugas ini dari Google Sheet? Tindakan ini tidak dapat dibatalkan.'))return; try{await api('deleteTask',{id});await syncData(true);showToast('Tugas berhasil dihapus.');}catch(err){showToast(err.message,'error');} }
async function deleteProject(id) {
  const linked=getWorkTasks().filter(t=>String(t.ProjectID||'')===String(id)).length;
  if(!confirm(linked?`Proyek ini memiliki ${linked} tugas terkait. Proyek akan dihapus, tetapi tugas tetap dipertahankan sebagai tugas mandiri. Lanjutkan?`:'Hapus proyek ini?'))return;
  try{for(const t of getWorkTasks().filter(x=>String(x.ProjectID||'')===String(id)))await api('updateTask',{id:t.ID,ProjectID:''});await api('deleteTask',{id});await syncData(true);showToast('Proyek dihapus; tugas tetap aman.');}catch(err){showToast(err.message,'error');}
}

function todayKey() { return new Date().toISOString().slice(0,10); }
function routineRuns(id) { const key = String(id); return routineHistory[key] || {}; }
function routineCompleted(id, date=todayKey()) { return !!routineRuns(id)[date]; }
function toggleRoutine(id) {
  const key=String(id), date=todayKey(); const runs={...routineRuns(id)};
  if(runs[date]) delete runs[date]; else runs[date]=true;
  routineHistory[key]=runs; localStorage.setItem('lifeRoutineHistory', JSON.stringify(routineHistory)); renderRoutines();
}
function calculateStreak(id) {
  const runs=routineRuns(id); let d=new Date(); let streak=0;
  while(runs[d.toISOString().slice(0,10)]) { streak++; d.setDate(d.getDate()-1); }
  return streak;
}
function renderRoutines() {
  const rows=state.routines||[], list=$('routine-list'); if(!list)return;
  let done=0; rows.forEach(r=>{if(String(r.Status||'Aktif')!=='Nonaktif'&&routineCompleted(r.ID))done++;});
  const active=rows.filter(r=>String(r.Status||'Aktif')!=='Nonaktif').length;
  setText('routine-done', `${done}/${active}`); setText('routine-active',active);
  const pct=active?Math.round(done/active*100):0; setText('routine-progress',pct+'%');
  const best=rows.reduce((m,r)=>Math.max(m,calculateStreak(r.ID)),0); setText('routine-streak',best+' hari');
  list.innerHTML=rows.length?rows.map(r=>{
    const checked=routineCompleted(r.ID), streak=calculateStreak(r.ID);
    return `<div class="col-md-6 col-xl-4"><div class="card h-100"><div class="card-body"><div class="d-flex justify-content-between align-items-start gap-2"><div class="flex-grow-1"><span class="badge text-bg-secondary mb-2">${escapeHtml(r.Kategori||'Pribadi')}</span><h5 class="fw-bold mb-1">${escapeHtml(r.Nama||'-')}</h5><small class="text-secondary">${escapeHtml(r.Hari||'Setiap hari')} · Streak ${streak} hari</small></div><button class="btn btn-sm ${checked?'btn-success':'btn-outline-secondary'}" onclick="toggleRoutine('${escapeHtml(r.ID)}')"><i class="fa-solid ${checked?'fa-check':'fa-circle'}"></i></button></div><div class="d-flex gap-2 mt-3"><button class="btn btn-sm btn-outline-light" onclick="editRoutine('${escapeHtml(r.ID)}')">Edit</button><button class="btn btn-sm btn-outline-danger" onclick="deleteRoutine('${escapeHtml(r.ID)}')">Hapus</button></div></div></div></div>`;
  }).join(''):`<div class="col-12"><div class="empty-state py-5"><i class="fa-solid fa-repeat"></i>Belum ada rutinitas. Tambahkan kebiasaan pertama kamu.</div></div>`;
}
function prepareNewRoutine(){ editingRoutineId=null; $('routine-id').value=''; $('routine-name').value=''; $('routine-category').value='Pribadi'; $('routine-days').value='everyday'; const t=document.querySelector('#routineModal .modal-title'); if(t)t.textContent='Rutinitas Baru'; }
function editRoutine(id){ const r=(state.routines||[]).find(x=>String(x.ID)===String(id)); if(!r)return; editingRoutineId=id; $('routine-id').value=id; $('routine-name').value=r.Nama||''; $('routine-category').value=r.Kategori||'Pribadi'; $('routine-days').value=r.Hari||'everyday'; const t=document.querySelector('#routineModal .modal-title'); if(t)t.textContent='Edit Rutinitas'; bootstrap.Modal.getOrCreateInstance($('routineModal')).show(); }
async function saveRoutine(e){ e.preventDefault(); try{ const id=editingRoutineId||$('routine-id').value; const nama=$('routine-name').value.trim(); if(!nama){showToast('Nama rutinitas wajib diisi.','error');return;} const data={id:id||undefined,Nama:nama,Kategori:$('routine-category').value,Hari:$('routine-days').value,Status:'Aktif'}; await api(id?'updateRoutine':'saveRoutine',data); bootstrap.Modal.getOrCreateInstance($('routineModal')).hide(); await syncData(true); showToast('Rutinitas tersimpan.'); }catch(err){showToast(err.message,'error');} }
async function deleteRoutine(id){ if(!confirm('Hapus rutinitas ini? Riwayat checklist di perangkat juga akan dihapus.'))return; try{await api('deleteRoutine',{id}); delete routineHistory[String(id)]; localStorage.setItem('lifeRoutineHistory',JSON.stringify(routineHistory)); await syncData(true); showToast('Rutinitas dihapus.');}catch(err){showToast(err.message,'error');} }

function renderGoals(){const list=$('goal-list');if(!list)return;const rows=state.goals||[];list.innerHTML=rows.length?rows.map(g=>{const target=Number(g.Target||0),cur=Number(g.Progress||0),pct=target?Math.min(100,Math.round(cur/target*100)):0;return `<div class="col-md-6"><div class="card h-100"><div class="card-body"><div class="d-flex justify-content-between"><div><span class="badge text-bg-secondary mb-2">${escapeHtml(g.Kategori||'Pribadi')}</span><h5 class="fw-bold">${escapeHtml(g.Judul||'-')}</h5></div><span class="fw-bold">${pct}%</span></div><div class="progress mb-2" style="height:9px"><div class="progress-bar" style="width:${pct}%"></div></div><div class="small text-secondary">${cur.toLocaleString('id-ID')} / ${target.toLocaleString('id-ID')}${g.Deadline?' · '+escapeHtml(String(g.Deadline).slice(0,10)):''}</div><div class="d-flex gap-2 mt-3"><button class="btn btn-sm btn-outline-light" onclick="editGoal('${escapeHtml(g.ID)}')">Edit</button><button class="btn btn-sm btn-outline-danger" onclick="deleteGoal('${escapeHtml(g.ID)}')">Hapus</button></div></div></div></div>`}).join(''):`<div class="col-12"><div class="empty-state py-5"><i class="fa-solid fa-bullseye"></i>Belum ada target. Buat satu target yang ingin kamu capai.</div></div>`;}
function prepareNewGoal(){['goal-id','goal-title','goal-target','goal-current','goal-due'].forEach(id=>{if($(id))$(id).value=''});$('goal-current').value=0;$('goal-category').value='Pribadi';}
async function saveGoal(e){e.preventDefault();try{const id=$('goal-id').value;const data={id:id||undefined,Judul:$('goal-title').value.trim(),Target:Number($('goal-target').value),Progress:Number($('goal-current').value),Deadline:$('goal-due').value,Kategori:$('goal-category').value};await api(id?'updateGoal':'saveGoal',data);bootstrap.Modal.getOrCreateInstance($('goalModal')).hide();await syncData(true);showToast('Target tersimpan.');}catch(err){showToast(err.message,'error');}}
function editGoal(id){const g=(state.goals||[]).find(x=>String(x.ID)===String(id));if(!g)return;$('goal-id').value=g.ID;$('goal-title').value=g.Judul||'';$('goal-target').value=g.Target||0;$('goal-current').value=g.Progress||0;$('goal-due').value=String(g.Deadline||'').slice(0,10);$('goal-category').value=g.Kategori||'Pribadi';bootstrap.Modal.getOrCreateInstance($('goalModal')).show();}
async function deleteGoal(id){if(!confirm('Hapus target ini?'))return;try{await api('deleteGoal',{id});await syncData(true);showToast('Target dihapus.');}catch(err){showToast(err.message,'error');}}

function renderNotes(){const list=$('note-list');if(!list)return;const q=String($('note-search')?.value||'').toLowerCase();const rows=(state.notes||[]).filter(n=>[n.Judul,n.Kategori,n.Isi].join(' ').toLowerCase().includes(q));list.innerHTML=rows.length?rows.map(n=>`<div class="col-md-6 col-xl-4"><div class="card h-100"><div class="card-body"><span class="badge text-bg-secondary mb-2">${escapeHtml(n.Kategori||'Lainnya')}</span><h5 class="fw-bold">${escapeHtml(n.Judul||'-')}</h5><p class="text-secondary mb-3" style="white-space:pre-wrap">${escapeHtml(String(n.Isi||'').slice(0,500))}</p><div class="d-flex gap-2"><button class="btn btn-sm btn-outline-light" onclick="editNote('${escapeHtml(n.ID)}')">Edit</button><button class="btn btn-sm btn-outline-danger" onclick="deleteNote('${escapeHtml(n.ID)}')">Hapus</button></div></div></div></div>`).join(''):`<div class="col-12"><div class="empty-state py-5"><i class="fa-solid fa-note-sticky"></i>Belum ada catatan.</div></div>`;}
function prepareNewNote(){['note-id','note-title','note-content'].forEach(id=>{if($(id))$(id).value=''});if($('note-category'))$('note-category').value='Jurnal';const t=document.querySelector('#noteModal .modal-title');if(t)t.textContent='Catatan Baru';}
async function saveNote(e){e.preventDefault();try{const id=$('note-id').value;const title=$('note-title').value.trim();const isi=$('note-content').value.trim();if(!title){showToast('Judul catatan wajib diisi.','error');return;}if(!isi){showToast('Isi catatan wajib diisi.','error');return;}const data={id:id||undefined,Judul:title,Kategori:$('note-category').value,Isi:isi};await api(id?'updateNote':'saveNote',data);bootstrap.Modal.getOrCreateInstance($('noteModal')).hide();await syncData(true);showToast('Catatan tersimpan.');}catch(err){showToast(err.message,'error');}}
function editNote(id){const n=(state.notes||[]).find(x=>String(x.ID)===String(id));if(!n)return;$('note-id').value=n.ID;const t=document.querySelector('#noteModal .modal-title');if(t)t.textContent='Edit Catatan';$('note-title').value=n.Judul||'';$('note-category').value=n.Kategori||'Jurnal';$('note-content').value=n.Isi||'';bootstrap.Modal.getOrCreateInstance($('noteModal')).show();}
async function deleteNote(id){if(!confirm('Hapus catatan ini?'))return;try{await api('deleteNote',{id});await syncData(true);showToast('Catatan dihapus.');}catch(err){showToast(err.message,'error');}}

function goToTab(tabId) {
  const el = document.querySelector(`[data-bs-target="#${tabId}"]`);
  if (el && window.bootstrap) bootstrap.Tab.getOrCreateInstance(el).show();
}

function todayISO() { return new Date().toISOString().slice(0, 10); }
function dashboardTaskStatus(t) { return normalizeTaskStatus(t.Status); }
function dashboardTaskDone(t) { return ['done','selesai','completed'].includes(dashboardTaskStatus(t)); }
function dashboardTaskPriority(p) {
  const v = String(p || '').toLowerCase();
  if (v.includes('tinggi') || v.includes('high')) return {label:'Tinggi', cls:'text-bg-danger', rank:3};
  if (v.includes('rendah') || v.includes('low')) return {label:'Rendah', cls:'text-bg-secondary', rank:1};
  return {label:'Sedang', cls:'text-bg-warning', rank:2};
}
function dashboardDue(t) {
  const d = String(t['Batas Waktu'] || '').slice(0,10);
  return d;
}
function dashboardDueLabel(due) {
  if (!due) return 'Tanpa deadline';
  const today = todayISO();
  if (due < today) return 'Terlambat';
  if (due === today) return 'Hari ini';
  return new Date(due + 'T00:00:00').toLocaleDateString('id-ID',{day:'2-digit',month:'short'});
}

function renderLifeDashboard() {
  const tasks = state.tasks || [];
  const routines = (state.routines || []).filter(r => String(r.Status || 'Aktif') !== 'Nonaktif');
  const goals = state.goals || [];
  const activeTasks = tasks.filter(t => !dashboardTaskDone(t));
  const taskDone = tasks.filter(dashboardTaskDone).length;
  const taskPct = tasks.length ? Math.round(taskDone / tasks.length * 100) : 0;
  const routineDone = routines.filter(r => routineCompleted(r.ID)).length;
  const routinePct = routines.length ? Math.round(routineDone / routines.length * 100) : 0;
  const goalPcts = goals.map(g => { const target=Number(g.Target||0), cur=Number(g.Progress||0); return target ? Math.min(100, Math.round(cur/target*100)) : 0; });
  const goalPct = goalPcts.length ? Math.round(goalPcts.reduce((a,b)=>a+b,0)/goalPcts.length) : 0;
  const score = Math.round((taskPct + routinePct + goalPct) / 3);

  const focusStore = JSON.parse(localStorage.getItem(DAILY_FOCUS_KEY) || '{}');
  const explicitFocus = focusStore[todayKey()] || '';

  setText('life-score', score + '%');
  setText('life-task-progress', taskPct + '%');
  setText('life-routine-progress', routinePct + '%');
  setText('life-goal-progress', goalPct + '%');
  ['life-task-bar','life-routine-bar','life-goal-bar'].forEach((id,i) => { if ($(id)) $(id).style.width = [taskPct,routinePct,goalPct][i] + '%'; });

  const focus = [...activeTasks].sort((a,b) => {
    const pa=dashboardTaskPriority(a.Prioritas).rank, pb=dashboardTaskPriority(b.Prioritas).rank;
    const da=dashboardDue(a)||'9999-12-31', db=dashboardDue(b)||'9999-12-31';
    return pb-pa || da.localeCompare(db);
  })[0];
  const focusEl = $('life-focus-card');
  if (focusEl) {
    if (explicitFocus) {
      focusEl.innerHTML = `<div class="d-flex align-items-center gap-3"><div class="focus-icon"><i class="fa-solid fa-crosshairs"></i></div><div class="flex-grow-1"><div class="small text-secondary">Fokus yang kamu tentukan</div><div class="fw-bold">${escapeHtml(explicitFocus)}</div><div class="small text-secondary">Arah utama hari ini</div></div><button class="btn btn-sm btn-outline-light" onclick="goToTab('tab-tasks')">Buka Tugas</button></div>`;
    } else if (focus) {
      focusEl.innerHTML = `<div class="d-flex align-items-center gap-3"><div class="focus-icon"><i class="fa-solid fa-crosshairs"></i></div><div class="flex-grow-1"><div class="small text-secondary">Fokus dari tugas aktif</div><div class="fw-bold">${escapeHtml(focus.Judul || '-')}</div><div class="small text-secondary">${escapeHtml(focus.Kategori || 'Pribadi')} · ${escapeHtml(dashboardDueLabel(dashboardDue(focus)))}</div></div><button class="btn btn-sm btn-outline-light" onclick="editTask('${escapeHtml(focus.ID)}')">Kerjakan</button></div>`;
    } else {
      focusEl.innerHTML = `<div class="empty-state py-2"><i class="fa-solid fa-crosshairs"></i> Belum ada fokus. Atur satu hal penting untuk hari ini.</div>`;
    }
  }

  const routineList = $('dashboard-routine-list');
  if (routineList) {
    routineList.innerHTML = routines.length ? routines.slice(0,5).map(r => { const done=routineCompleted(r.ID); return `<button class="dashboard-check ${done?'done':''}" onclick="toggleRoutine('${escapeHtml(r.ID)}')"><span class="check-circle"><i class="fa-solid fa-check"></i></span><span class="flex-grow-1 text-start">${escapeHtml(r.Nama||'-')}</span><small>${calculateStreak(r.ID)}d</small></button>`; }).join('') : `<div class="empty-state py-3"><i class="fa-solid fa-repeat"></i>Belum ada rutinitas.</div>`;
  }

  const taskList = $('dashboard-task-list');
  if (taskList) {
    const dueTasks = activeTasks.filter(t => dashboardDue(t) <= todayISO() || !dashboardDue(t)).slice(0,5);
    const rows = (dueTasks.length ? dueTasks : activeTasks.slice(0,5));
    taskList.innerHTML = rows.length ? rows.map(t => { const p=dashboardTaskPriority(t.Prioritas); const due=dashboardDue(t); return `<div class="dashboard-task-row"><div class="task-dot ${p.cls.replace('text-bg-','')}"></div><div class="flex-grow-1"><div class="fw-semibold">${escapeHtml(t.Judul||'-')}</div><small class="text-secondary">${escapeHtml(t.Kategori||'Pribadi')} · ${escapeHtml(dashboardDueLabel(due))}</small></div><span class="badge ${p.cls}">${p.label}</span></div>`; }).join('') : `<div class="empty-state py-3"><i class="fa-solid fa-circle-check"></i>Semua tugas beres. Mantap!</div>`;
  }

  const goalList = $('dashboard-goal-list');
  if (goalList) {
    goalList.innerHTML = goals.length ? goals.slice().sort((a,b)=>Number(b.Progress||0)/Math.max(Number(b.Target||1),1)-Number(a.Progress||0)/Math.max(Number(a.Target||1),1)).slice(0,4).map(g => { const target=Number(g.Target||0),cur=Number(g.Progress||0),pct=target?Math.min(100,Math.round(cur/target*100)):0; return `<div class="dashboard-goal-row"><div class="d-flex justify-content-between mb-1"><span class="fw-semibold">${escapeHtml(g.Judul||'-')}</span><strong>${pct}%</strong></div><div class="progress mb-1"><div class="progress-bar" style="width:${pct}%"></div></div><small class="text-secondary">${cur.toLocaleString('id-ID')} / ${target.toLocaleString('id-ID')}</small></div>`; }).join('') : `<div class="empty-state py-3"><i class="fa-solid fa-bullseye"></i>Belum ada target.</div>`;
  }
}


function openFocusEditor(){ const store=JSON.parse(localStorage.getItem(DAILY_FOCUS_KEY)||'{}'); if($('daily-focus-input')) $('daily-focus-input').value=store[todayKey()]||''; }
function saveDailyFocus(e){ e.preventDefault(); const store=JSON.parse(localStorage.getItem(DAILY_FOCUS_KEY)||'{}'); const value=$('daily-focus-input')?.value.trim()||''; if(value) store[todayKey()]=value; else delete store[todayKey()]; localStorage.setItem(DAILY_FOCUS_KEY,JSON.stringify(store)); bootstrap.Modal.getOrCreateInstance($('focusModal')).hide(); renderLifeDashboard(); renderDailyMode(); showToast(value?'Fokus hari ini disimpan.':'Fokus hari ini dikosongkan.'); }

function renderDailyMode() {
  const now = new Date();
  const hour = now.getHours();
  const morning = hour < 12;
  const evening = hour >= 18;
  const tasks = state.tasks || [];
  const active = tasks.filter(t => !dashboardTaskDone(t));
  const done = tasks.filter(dashboardTaskDone).length;
  const routines = (state.routines || []).filter(r => String(r.Status || 'Aktif') !== 'Nonaktif');
  const rDone = routines.filter(r => routineCompleted(r.ID)).length;
  const goals = state.goals || [];
  const focusStore = JSON.parse(localStorage.getItem(DAILY_FOCUS_KEY) || '{}');
  const explicitFocus = focusStore[todayKey()] || '';
  const goalPcts = goals.map(g => { const target=Number(g.Target||0), cur=Number(g.Progress||0); return target ? Math.min(100, Math.round(cur/target*100)) : 0; });
  const goalPct = goalPcts.length ? Math.round(goalPcts.reduce((a,b)=>a+b,0)/goalPcts.length) : 0;

  setText('daily-task-summary', `${done}/${tasks.length}`);
  setText('daily-routine-summary', `${rDone}/${routines.length}`);
  setText('daily-goal-summary', `${goalPct}%`);

  const kicker=$('daily-mode-kicker'), title=$('daily-mode-title'), sub=$('daily-mode-subtitle'), icon=$('daily-mode-icon'), action=$('daily-primary-action');
  if (evening) {
    setText('daily-mode-kicker','Life OS · Penutup hari');
    setText('daily-mode-title','Waktunya menutup hari dengan tenang 🌙');
    setText('daily-mode-subtitle', `${done} tugas selesai dan ${rDone} rutinitas tercapai. Luangkan 1 menit untuk melihat kembali harimu.`);
    if(icon) icon.innerHTML='<i class="fa-solid fa-moon"></i>';
    if(action) { action.innerHTML='<i class="fa-solid fa-pen me-1"></i> Tulis refleksi'; action.onclick=openDailyReview; }
  } else if (morning) {
    setText('daily-mode-kicker','Life OS · Morning Mode');
    setText('daily-mode-title','Selamat pagi 👋 Fokus satu hal dulu.');
    setText('daily-mode-subtitle', active.length ? `Kamu punya ${active.length} tugas aktif. Pilih yang paling penting dan mulai dari sana.` : 'Belum ada tugas aktif. Gunakan waktu ini untuk menentukan arah harimu.');
    if(icon) icon.innerHTML='<i class="fa-solid fa-sun"></i>';
    if(action) { action.innerHTML='<i class="fa-solid fa-bolt me-1"></i> Mulai fokus'; action.onclick=()=>goToTab('tab-tasks'); }
  } else {
    setText('daily-mode-kicker','Life OS · Tengah hari');
    setText('daily-mode-title','Cek arahmu sebentar ⚡');
    setText('daily-mode-subtitle', `Progress rutinitas ${rDone}/${routines.length}. Jangan kejar semuanya—selesaikan yang paling berdampak.`);
    if(icon) icon.innerHTML='<i class="fa-solid fa-bolt"></i>';
    if(action) { action.innerHTML='<i class="fa-solid fa-list-check me-1"></i> Lanjutkan'; action.onclick=()=>goToTab('tab-tasks'); }
  }

  const things=$('daily-three-things');
  if(things){
    const focus=[...active].sort((a,b)=>dashboardTaskPriority(b.Prioritas).rank-dashboardTaskPriority(a.Prioritas).rank || (dashboardDue(a)||'9999').localeCompare(dashboardDue(b)||'9999'))[0];
    const routine=routines.find(r=>!routineCompleted(r.ID));
    const goal=goals.slice().sort((a,b)=>(Number(a.Progress||0)/Math.max(Number(a.Target||1),1))-(Number(b.Progress||0)/Math.max(Number(b.Target||1),1)))[0];
    const rows=[];
    if(explicitFocus) rows.push(`<div class="three-thing"><span class="thing-icon"><i class="fa-solid fa-crosshairs"></i></span><div><small class="text-secondary">Fokus</small><div class="fw-semibold">${escapeHtml(explicitFocus)}</div></div></div>`); else if(focus) rows.push(`<div class="three-thing"><span class="thing-icon"><i class="fa-solid fa-crosshairs"></i></span><div><small class="text-secondary">Fokus</small><div class="fw-semibold">${escapeHtml(focus.Judul||'-')}</div></div></div>`);
    if(routine) rows.push(`<div class="three-thing"><span class="thing-icon"><i class="fa-solid fa-repeat"></i></span><div><small class="text-secondary">Rutinitas</small><div class="fw-semibold">${escapeHtml(routine.Nama||'-')}</div></div></div>`);
    if(goal) rows.push(`<div class="three-thing"><span class="thing-icon"><i class="fa-solid fa-bullseye"></i></span><div><small class="text-secondary">Target</small><div class="fw-semibold">${escapeHtml(goal.Judul||'-')}</div></div></div>`);
    things.innerHTML=rows.length?rows.join(''):`<div class="empty-state py-3"><i class="fa-solid fa-face-smile"></i>Hari ini terlihat ringan. Nikmati.</div>`;
  }
}

function openDailyReview() {
  const tasks=state.tasks||[], routines=(state.routines||[]).filter(r=>String(r.Status||'Aktif')!=='Nonaktif');
  const done=tasks.filter(dashboardTaskDone).length, rDone=routines.filter(r=>routineCompleted(r.ID)).length;
  const summary=$('review-summary');
  if(summary) summary.innerHTML=`<div class="d-flex justify-content-between"><span>Tugas</span><strong>${done}/${tasks.length} selesai</strong></div><div class="d-flex justify-content-between mt-2"><span>Rutinitas</span><strong>${rDone}/${routines.length} selesai</strong></div>`;
  const saved=JSON.parse(localStorage.getItem('lifeDailyReviews')||'{}')[todayKey()]||{};
  if($('review-win')) $('review-win').value=saved.win||'';
  if($('review-improve')) $('review-improve').value=saved.improve||'';
  bootstrap.Modal.getOrCreateInstance($('dailyReviewModal')).show();
}

function saveDailyReview() {
  const all=JSON.parse(localStorage.getItem('lifeDailyReviews')||'{}');
  all[todayKey()]={win:$('review-win')?.value.trim()||'', improve:$('review-improve')?.value.trim()||'', savedAt:new Date().toISOString()};
  localStorage.setItem('lifeDailyReviews',JSON.stringify(all));
  bootstrap.Modal.getOrCreateInstance($('dailyReviewModal')).hide();
  showToast('Daily Review tersimpan di perangkat ini.');
}

function updateDashboard() {
  const items = state.inventory || [];
  const totalQty = items.reduce((s,x) => s + Number(x.Jumlah || 0), 0);
  const totalValue = items.reduce((s,x) => s + Number(x['Total Nilai'] || 0), 0);
  setText('stat-total-assets', items.length); setText('stat-total-qty', totalQty); setText('stat-asset-value', formatRupiah(totalValue));
  updateFinanceDashboard();
  renderDailyMode();
}

function setText(id, value) { if ($(id)) $(id).textContent = value; }

async function saveInventoryItem(event) {
  event.preventDefault();
  const data = {
    id: editingInventoryId || undefined,
    date: new Date().toISOString().slice(0,10),
    name: $('inv-name').value.trim(),
    category: $('inv-category').value,
    location: $('inv-location').value.trim(),
    qty: Number($('inv-qty').value || 0),
    value: Number($('inv-value').value || 0),
    condition: $('inv-condition')?.value || 'Baik',
    status: $('inv-status')?.value || 'Tersedia',
    notes: $('inv-notes').value.trim()
  };
  if (data.qty < 0 || data.value < 0) {
    showToast('Jumlah dan harga tidak boleh negatif.', 'error'); return;
  }
  try {
    await api(editingInventoryId ? 'updateInventory' : 'saveInventory', data);
    bootstrap.Modal.getOrCreateInstance($('inventoryModal')).hide();
    editingInventoryId = null;
    await syncData(true);
    showToast('Data aset berhasil disimpan ke Google Sheet.');
  } catch (err) { showToast(err.message, 'error'); }
}

function editInventory(id) {
  const item = state.inventory.find(x => String(x.ID) === String(id));
  if (!item) return;
  editingInventoryId = id;
  $('inv-name').value = item['Nama Barang'] || '';
  $('inv-category').value = item.Kategori || 'Lainnya';
  $('inv-location').value = item.Lokasi || '';
  $('inv-qty').value = item.Jumlah || 1;
  $('inv-value').value = item['Harga Satuan'] || 0;
  if ($('inv-condition')) $('inv-condition').value = item.Kondisi || 'Baik';
  if ($('inv-status')) $('inv-status').value = item.Status || 'Tersedia';
  $('inv-notes').value = item.Catatan || '';
  const title = document.querySelector('#inventoryModal .modal-title');
  if (title) title.textContent = 'Edit Aset';
  updateInventoryTotalPreview();
  bootstrap.Modal.getOrCreateInstance($('inventoryModal')).show();
}

async function deleteInventory(id) {
  if (!confirm('Hapus aset ini dari Google Sheet? Tindakan ini tidak dapat dibatalkan.')) return;
  try {
    await api('deleteInventory', { id });
    await syncData(true);
    showToast('Aset berhasil dihapus.');
  } catch (err) { showToast(err.message, 'error'); }
}

async function saveFinanceItem(event) {
  event.preventDefault();
  const amount=Number($('fin-amount')?.value||0); if(amount<=0){showToast('Jumlah transaksi harus lebih dari 0.','error');return;}
  try {
    await api(editingFinanceId ? 'updateFinance' : 'saveFinance', { id: editingFinanceId || undefined, Tanggal:$('fin-date').value, Keterangan:$('fin-description').value.trim(), Kategori:$('fin-category').value, Tipe:$('fin-type').value, Jumlah:amount, Catatan:$('fin-notes').value.trim() });
    bootstrap.Modal.getOrCreateInstance($('financeModal')).hide(); editingFinanceId=null; await syncData(true); showToast('Transaksi berhasil disimpan ke Google Sheet.');
  } catch(err){showToast(err.message,'error');}
}

function resetInventoryModal() {
  editingInventoryId = null;
  const title = document.querySelector('#inventoryModal .modal-title');
  if (title) title.textContent = 'Tambah Aset';
  $('inventory-form')?.reset();
  if ($('inv-qty')) $('inv-qty').value = 1;
  if ($('inv-category')) $('inv-category').value = 'Elektronik';
  if ($('inv-condition')) $('inv-condition').value = 'Baik';
  if ($('inv-status')) $('inv-status').value = 'Tersedia';
  updateInventoryTotalPreview();
}

async function runDataDiagnostic() {
  const out = $('data-diagnostic-output');
  if (out) out.textContent = 'Mengecek data...';
  try {
    // Tiap modul dicek langsung ke Web App masing-masing (action 'debug'),
    // bukan lewat satu endpoint gabungan lagi.
    const results = await Promise.all(MODULES.map(async (key) => {
      const url = getApiUrl(key);
      if (!url) return [key, null, 'URL belum diatur'];
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'debug' })
        });
        const json = JSON.parse(await response.text());
        return [key, json.data || null, json.ok ? null : json.error];
      } catch (err) {
        return [key, null, err.message];
      }
    }));
    const lines = ['HASIL DIAGNOSTIK PER MODUL', ''];
    results.forEach(([key, info, err]) => {
      lines.push(`[${key}]`);
      lines.push(err ? '  ERROR: ' + err : '  ' + JSON.stringify(info));
    });
    if (out) out.textContent = lines.join('\n');
  } catch (err) {
    if (out) out.textContent = 'ERROR\n' + err.message;
  }
  if (window.bootstrap && $('dataDiagnosticModal')) bootstrap.Modal.getOrCreateInstance($('dataDiagnosticModal')).show();
}

document.addEventListener('DOMContentLoaded', () => {
  // Fallback navigation: keeps every Life OS menu clickable even if Bootstrap tab state is stale.
  document.querySelectorAll('#pills-tab [data-bs-toggle=\"pill\"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-bs-target');
      if (!target) return;
      document.querySelectorAll('#pills-tab .nav-link').forEach(x => x.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('#pills-tabContent .tab-pane').forEach(p => p.classList.remove('show','active'));
      const pane = document.querySelector(target);
      if (pane) pane.classList.add('show','active');
    });
  });
});

window.addEventListener('DOMContentLoaded', () => {
  $('inventoryModal')?.addEventListener('hidden.bs.modal', resetInventoryModal);
  $('financeModal')?.addEventListener('hidden.bs.modal', prepareNewFinance);
  $('taskModal')?.addEventListener('hidden.bs.modal', prepareNewTask);
  $('routineModal')?.addEventListener('hidden.bs.modal', prepareNewRoutine);
  $('goalModal')?.addEventListener('hidden.bs.modal', prepareNewGoal);
  $('noteModal')?.addEventListener('hidden.bs.modal', prepareNewNote);
  loadCachedState();
  syncData(true);
});
