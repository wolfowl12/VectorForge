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
- Maksimal 5 gambar per sesi upload, format PNG/JPG/JPEG.
- Hasil SVG dinamai mengikuti nama file asli (`logo.png` → `logo.svg`).
- Cocok untuk logo, ikon, teks, dan gambar dengan warna solid; hasil bisa dibuka dan diedit di Adobe Illustrator.

## Catatan

Jika koneksi internet gagal memuat library imagetracerjs dari CDN, website akan menampilkan pesan error yang jelas dan tombol convert dinonaktifkan — bukan menampilkan hasil kosong atau `undefined`.
