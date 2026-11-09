/* =========================================================
   LIFE OS — MODUL ROUTINES (Google Apps Script terpisah)
   Deploy file ini sebagai Web App TERSENDIRI (URL sendiri).
   Sheet target: "Rutinitas" (alias lama yang tetap dikenali: Routine, Routines, Kebiasaan)
   ========================================================= */

const SPREADSHEET_ID = 'PASTE_SPREADSHEET_ID_DI_SINI'; // ambil dari URL Google Sheet kamu, antara /d/ dan /edit
const SHEET_NAME = 'Rutinitas';
const SHEET_ALIASES = ['Rutinitas', 'Routine', 'Routines', 'Kebiasaan'];
const HEADERS = ['ID', 'Timestamp', 'Nama', 'Kategori', 'Hari', 'Status'];
const PREFIX = 'RTN';

function doGet(e) {
  return jsonResponse_({ ok: true, message: 'Modul Routines aktif', action: 'GET' });
}

function doPost(e) {
  try {
    const body = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    const action = body.action || 'getRoutines';
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sh = ensureSheet_(ss);

    switch (action) {
      case 'setup': return jsonResponse_({ ok: true, message: 'Sheet Rutinitas siap.' });
      case 'getRoutines': return jsonResponse_({ ok: true, data: { routines: readObjects_(sh) } });
      case 'debug': return jsonResponse_({ ok: true, data: debugInfo_(ss, sh) });
      case 'saveRoutine': return jsonResponse_({ ok: true, data: saveGeneric_(sh, body.data || {}) });
      case 'updateRoutine': return jsonResponse_({ ok: true, data: updateGeneric_(sh, body.data || {}) });
      case 'deleteRoutine': return jsonResponse_({ ok: true, data: deleteRow_(sh, body.id || (body.data || {}).id) });
      default: throw new Error('Action tidak dikenal di modul Routines: ' + action);
    }
  } catch (err) {
    return jsonResponse_({ ok: false, error: err.message });
  }
}

function debugInfo_(ss, sh) {
  return {
    matchedSheetName: sh ? sh.getName() : null,
    rows: sh ? Math.max(0, sh.getLastRow() - 1) : 0,
    columns: sh ? sh.getLastColumn() : 0,
    headers: sh && sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [],
    expectedAliases: SHEET_ALIASES,
    allSheetNamesInSpreadsheet: ss.getSheets().map(s => s.getName())
  };
}

function saveGeneric_(sh, data) {
  const id = data.id || makeId_(PREFIX);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const row = headers.map(h => {
    if (h === 'ID') return id;
    if (h === 'Timestamp') return new Date();
    return data[h] !== undefined ? data[h] : '';
  });
  sh.appendRow(row);
  log_(sh.getParent(), id);
  return { id: id };
}

function updateGeneric_(sh, data) {
  if (!data.id) throw new Error('ID diperlukan untuk update.');
  const values = sh.getDataRange().getValues();
  const headers = values[0];
  const idCol = headers.indexOf('ID');
  const rowIndex = values.findIndex((r, i) => i > 0 && String(r[idCol]) === String(data.id));
  if (rowIndex < 1) throw new Error('Data dengan ID tersebut tidak ditemukan.');
  const old = values[rowIndex];
  const row = headers.map((h, i) => {
    if (h === 'ID') return data.id;
    if (h === 'Timestamp') return old[i];
    return data[h] !== undefined ? data[h] : old[i];
  });
  sh.getRange(rowIndex + 1, 1, 1, row.length).setValues([row]);
  log_(sh.getParent(), data.id);
  return { id: data.id };
}

function ensureSheet_(ss) {
  let sh = findSheet_(ss);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.getRange(1,1,1,HEADERS.length).setValues([HEADERS]);
  }
  sh.setFrozenRows(1);
  sh.getRange(1,1,1,HEADERS.length).setFontWeight('bold');
  return sh;
}

function normalizeSheetName_(s) {
  // Buang semua karakter selain huruf/angka, jadi "Tugas & Proyek" == "tugasproyek".
  return String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function findSheet_(ss) {
  const wanted = SHEET_ALIASES.map(normalizeSheetName_);
  const sheets = ss.getSheets();
  // 1) Cocok persis (setelah dinormalisasi) dengan salah satu alias.
  let found = sheets.find(sh => wanted.includes(normalizeSheetName_(sh.getName())));
  if (found) return found;
  // 2) Fallback: nama tab mengandung salah satu alias, atau sebaliknya.
  //    Ini mencegah Apps Script membuat sheet baru yang kosong padahal
  //    sheet aslinya sudah ada tapi namanya sedikit beda dari alias terdaftar.
  found = sheets.find(sh => {
    const name = normalizeSheetName_(sh.getName());
    return wanted.some(w => w && (name.includes(w) || w.includes(name)));
  });
  return found || null;
}

function readObjects_(sh) {
  if (!sh || sh.getLastRow() < 2) return [];
  const values = sh.getDataRange().getValues();
  const headers = values.shift();
  return values.filter(row => row.some(v => v !== '')).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = serializeValue_(row[i]));
    return obj;
  });
}

function deleteRow_(sh, id) {
  if (!id) throw new Error('ID diperlukan untuk hapus.');
  const values = sh.getDataRange().getValues();
  const idCol = values[0].indexOf('ID');
  const rowIndex = values.findIndex((r, i) => i > 0 && String(r[idCol]) === String(id));
  if (rowIndex < 1) throw new Error('Data tidak ditemukan.');
  sh.deleteRow(rowIndex + 1);
  log_(sh.getParent(), id);
  return { id: id };
}

function log_(ss, id) {
  try {
    let logSh = ss.getSheetByName('Log');
    if (!logSh) {
      logSh = ss.insertSheet('Log');
      logSh.getRange(1,1,1,5).setValues([['Timestamp','Action','Sheet','ID','Detail']]);
    }
    logSh.appendRow([new Date(), 'ACTION', SHEET_NAME, id, '']);
  } catch (e) { /* logging tidak boleh menggagalkan request utama */ }
}

function makeId_(prefix) {
  return prefix + '-' + Utilities.getUuid().slice(0, 8).toUpperCase();
}

function formatDate_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function serializeValue_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  return v;
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
