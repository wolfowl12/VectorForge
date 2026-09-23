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

## Cara kerja

- Vectorization dilakukan sepenuhnya di client menggunakan library [imagetracerjs](https://github.com/jankovicsandras/imagetracerjs) (dimuat via CDN jsDelivr) yang menghasilkan `<path>` SVG asli dari hasil color-quantization + contour tracing — bukan gambar raster yang dibungkus tag `<svg>`.
- Sebelum tracing, setiap gambar melewati preprocessing otomatis di canvas:
  1. **Downscale proporsional** ke maksimal 1400px pada sisi terpanjang (memakai high-quality image smoothing browser) — ini yang paling berpengaruh menghilangkan noise pixel/JPEG yang bikin hasil vector bergerigi.
  2. **Edge-preserving blur** (`blurradius`/`blurdelta` pada tracer) untuk meredam noise kompresi tanpa melunakkan tepi bentuk asli.
  3. **Color quantization** yang wajar (deterministic sampling, ±16 warna, `mincolorratio` untuk menggabungkan warna nyaris sama) supaya area warna solid jadi shape bersih, bukan pecahan kecil-kecil.
  4. **Path simplification** lewat `pathomit` (buang shape noise super kecil) dan `ltres`/`qtres` (toleransi fitting garis lurus & kurva) sehingga jumlah node tetap wajar dan kurva tetap halus.
- Setelah tracing, hasil divalidasi otomatis: harus berupa `<svg>...</svg>` yang valid, mengandung elemen vector (`path`/`polygon`/dll), dan bukan sekadar `<image>` raster yang dibungkus — kalau gagal, status kartu menampilkan pesan error yang jelas, bukan `undefined`.
- Maksimal 5 gambar per sesi upload, format PNG/JPG/JPEG.
- Hasil SVG dinamai mengikuti nama file asli (`logo.png` → `logo.svg`).
- Cocok untuk logo, ikon, teks, dan gambar dengan warna solid; hasil bisa dibuka dan diedit node/path-nya di Adobe Illustrator.

## Catatan

Jika koneksi internet gagal memuat library imagetracerjs dari CDN, website akan menampilkan pesan error yang jelas dan tombol convert dinonaktifkan — bukan menampilkan hasil kosong atau `undefined`.
