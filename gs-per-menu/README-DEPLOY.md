# Cara Deploy 6 Modul Terpisah

Setiap file `.gs` di folder ini adalah **project Apps Script berdiri sendiri**
(standalone), bukan bound-script. Semuanya tetap membaca/menulis ke SATU
Google Sheet yang sama (spreadsheet kamu yang sekarang), tapi masing-masing
dideploy sebagai Web App sendiri dengan URL sendiri.

## Langkah per modul (ulangi 6x, untuk tiap file)

1. Buka https://script.google.com/home → **New project**.
2. Beri nama project sesuai modul, misal `LifeOS - Inventory`.
3. Hapus kode default, lalu copy-paste isi salah satu file (misal `01-Inventory.gs`).
4. Ambil **Spreadsheet ID** dari URL Google Sheet kamu:
   `https://docs.google.com/spreadsheets/d/`**`INI_ID_NYA`**`/edit`
5. Ganti baris `const SPREADSHEET_ID = 'PASTE_SPREADSHEET_ID_DI_SINI';`
   dengan ID asli tadi.
6. Klik **Deploy → New deployment**.
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone** (atau sesuai kebutuhanmu)
7. Klik **Deploy**, izinkan akses (authorize) saat diminta.
8. Copy URL yang berakhiran `/exec` — itu URL untuk modul ini.
9. Ulangi untuk 5 file lainnya (`02-Finance.gs`, `03-Tasks.gs`, dst).

## Setelah 6 URL didapat

1. Buka website Life OS kamu → menu **Pengaturan API**.
2. Tempel masing-masing URL ke kolom modul yang sesuai (Inventaris, Keuangan,
   Tugas, Rutinitas, Target, Catatan).
3. Klik **Simpan Semua URL**.

## Kenapa dulu terasa delay (dan kenapa ini bisa membantu)

Kode lama (`Code.gs`) memanggil `setupSheets_(ss)` di **setiap** request —
walau cuma mau baca satu modul, Apps Script tetap mengecek header ke SEMUA
7 sheet (Inventaris, Keuangan, Tugas, Rutinitas, Target, Catatan, Log) plus
`autoResizeColumns`. Karena frontend memanggil 6 modul sekaligus secara
paralel saat sync, itu artinya "cek semua sheet" dijalankan 6x barengan —
boros dan lambat.

Di versi per-modul ini, tiap Web App **hanya mengurus sheet-nya sendiri**,
jadi tidak ada lagi overhead cek-semua-sheet di setiap request.

## Yang perlu diperhatikan

- 6 URL = 6 kemungkinan cold start berbeda. Karena `syncData()` di frontend
  sudah memanggil semuanya secara paralel (`Promise.all`), total waktu
  tunggu = modul paling lambat, bukan jumlah semuanya — jadi tetap lebih
  cepat dari model lama yang serial.
- Kalau nanti mau nambah field/kolom, edit HEADERS di file modul yang
  bersangkutan, lalu deploy ulang (**Deploy → Manage deployments → Edit → New version**).
- Sheet `Log` dibuat otomatis oleh modul manapun yang lebih dulu jalan —
  tidak masalah kalau beberapa modul menulis ke situ.
