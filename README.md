# VectorForge

Ubah gambar PNG/JPG/JPEG menjadi vector SVG (berbasis path, bukan gambar yang dibungkus), langsung di browser — tanpa backend, tanpa database, dan gambar Anda tidak pernah diunggah ke server mana pun.

## Struktur project

```
/index.html
/style.css
/app.js
/vercel.json
```

## Cara pakai (lokal)

Cukup buka `index.html` langsung di browser, atau jalankan server statis sederhana, misalnya:

```bash
npx serve .
```

lalu buka `http://localhost:3000`.

## Deploy ke Vercel

1. Push folder ini ke repo GitHub baru.
2. Buka [vercel.com](https://vercel.com) → **Add New Project** → import repo tersebut.
3. Framework preset: **Other** (static site). Tidak perlu build command atau output directory khusus — Vercel akan menyajikan `index.html`, `style.css`, dan `app.js` apa adanya.
4. Klik **Deploy**.

Tidak ada environment variable, backend, atau database yang dibutuhkan.

## Cara kerja (pipeline V3 — Auto Enhance + Auto Clean + True Vectorization)

Saat "Convert ke Vector" ditekan, tiap gambar diproses lewat tahapan otomatis berikut, satu per satu (bukan paralel, supaya browser tidak freeze) — semuanya 100% di canvas browser, tidak ada gambar yang dikirim ke server mana pun:

1. **Decode + resize** — gambar diskalakan proporsional ke maksimal 1400px sisi terpanjang (high-quality smoothing browser). Ini yang paling berpengaruh menghilangkan noise pixel/JPEG penyebab hasil vector bergerigi.
2. **Deteksi jenis gambar otomatis** — sampling warna & border untuk mengklasifikasikan gambar sebagai `logo`, `lineart`, `illustration`, atau `photo`, lalu memilih parameter enhancement/tracing yang sesuai untuk masing-masing (status: *"Enhancing image..."*).
3. **Auto enhancement** — auto-contrast (histogram stretch, hanya jika gambar memang low-contrast), noise reduction kondisional (box blur, hanya dijalankan kalau noise terdeteksi), dan unsharp mask ringan (hanya untuk tipe `photo`, supaya logo/ikon dengan tepi tajam tidak jadi ringing).
4. **Auto color cleanup** — posterize (pengelompokan warna berjenjang) dengan jumlah level warna yang disesuaikan per tipe gambar, supaya warna mirip digabung sebelum tracer bekerja (status: *"Cleaning image..."*).
5. **Auto background cleanup** — border gambar dianalisis; kalau terdeteksi background sederhana & seragam, piksel-piksel dekat warna background di-snap ke satu warna solid (mencegah background pecah jadi ratusan path kecil). Kalau background kompleks, tahap ini dilewati sepenuhnya — tidak dipaksakan.
6. **Vector tracing** — [imagetracerjs](https://github.com/jankovicsandras/imagetracerjs) (CDN jsDelivr) men-trace `ImageData` menjadi path/kurva asli (status: *"Tracing vector..."*), dengan opsi berbeda per tipe gambar (jumlah warna, toleransi smoothing kurva, noise-path filtering).
7. **Auto beautify** — SVG hasil di-parse ulang dan dibersihkan dari shape duplikat persis serta fragmen "noise" yang nyaris tak terlihat (area sangat kecil relatif ke total gambar), tanpa pernah mengubah titik/kurva di dalam sebuah path (status: *"Smoothing paths..."*). Kalau proses ini gagal karena alasan apa pun, sistem otomatis fallback ke SVG asli hasil tracing — tidak pernah membuat hasil jadi rusak.
8. **Validasi & optimisasi akhir** (status: *"Optimizing SVG..."*) — memastikan output benar `<svg>...</svg>` yang valid, mengandung elemen vector (`path`/`polygon`/dll), bukan `<image>` raster yang dibungkus, dan tidak ada `NaN`/`undefined` di datanya. Kalau gagal di titik manapun, kartu menampilkan pesan error yang jelas — tidak pernah `undefined`.
- Maksimal 5 gambar per sesi upload, format PNG/JPG/JPEG.
- Hasil SVG dinamai mengikuti nama file asli (`logo.png` → `logo.svg`).
- Hasil bisa dibuka dan diedit node/path/warna-nya di Adobe Illustrator — tidak pernah berupa raster yang di-flatten.

## Catatan

Jika koneksi internet gagal memuat library imagetracerjs dari CDN, website akan menampilkan pesan error yang jelas dan tombol convert dinonaktifkan — bukan menampilkan hasil kosong atau `undefined`.
