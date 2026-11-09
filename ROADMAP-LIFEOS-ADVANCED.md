# Life OS Advanced — Roadmap

## Arah produk
Personal Command Center untuk pekerjaan/proyek, keuangan, aset, rutinitas, target, dan pengetahuan pribadi.

## Prinsip teknis
- Pertahankan Google Sheets + Google Apps Script dan URL API yang sudah ada.
- Perubahan skema additive: kolom baru ditambahkan di kanan; kolom/data lama tidak ditimpa.
- Tetap nyaman di desktop dan ponsel.

## Rilis Advanced Foundation (paket ini)
- Redesign visual dark premium dan responsif.
- Workspace Tugas & Proyek: Kanban dan kartu proyek.
- CRUD proyek; tugas dapat ditautkan ke proyek melalui ProjectID.
- Progress proyek dihitung dari proporsi tugas selesai.
- Prioritas, kategori, deadline, status, pencarian, dan filter tugas.
- Subtask/checklist sederhana (satu item per baris).
- Kolom `Jenis`, `ProjectID`, dan `Subtasks` ditambahkan secara additive.
- Tugas lama tanpa `Jenis` tetap dianggap tugas biasa.

## Tahap berikutnya
### V2.1 — Daily Command
Daily Focus (3 prioritas), kalender tugas, agenda mingguan, dan pengingat deadline.
### V2.2 — Project Intelligence
Milestone, timeline/Gantt sederhana, health status proyek, dan riwayat aktivitas.
### V2.3 — Personal Analytics
Weekly/Monthly Review dan statistik lintas modul.
### V2.4 — Focus & Automation
Pomodoro, pencatatan sesi fokus, pengingat terjadwal, dan Quick Add.
### V2.5 — Data & Reliability
Backup/restore, Recycle Bin, export PDF/CSV/XLSX, pemeriksaan API, dan audit log.

## Kriteria penerimaan
- Modul lama tetap berjalan dan tugas lama tetap tampil.
- CRUD proyek berjalan; progress proyek otomatis.
- Menghapus proyek melepas relasi, bukan menghapus tugas terkait.
- Tampilan dapat digunakan di layar ponsel.
