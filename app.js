(function () {
  "use strict";

  var MAX_FILES = 5;
  var ACCEPTED_TYPES = ["image/png", "image/jpeg"];
  var ACCEPTED_EXT = [".png", ".jpg", ".jpeg"];

  // Images larger than this (longest side, px) are downscaled proportionally
  // before any processing. Tracing a huge raster follows every pixel of
  // sensor/JPEG noise -> thousands of tiny jagged nodes. The browser's own
  // high-quality downscale acts as a first, natural noise-reduction pass.
  var MAX_TRACE_DIMENSION = 1400;

  /** @type {Array<{id:string, file:File, previewUrl:string, status:'idle'|'converting'|'done'|'error', svg:string|null, errorMsg:string|null}>} */
  var items = [];

  var dropzone = document.getElementById("dropzone");
  var fileInput = document.getElementById("fileInput");
  var fileCountEl = document.getElementById("fileCount");
  var grid = document.getElementById("grid");
  var cardTemplate = document.getElementById("cardTemplate");
  var emptyState = document.getElementById("emptyState");
  var errorBanner = document.getElementById("errorBanner");
  var convertAllBtn = document.getElementById("convertAllBtn");
  var clearAllBtn = document.getElementById("clearAllBtn");

  var tracerAvailable =
    typeof window.ImageTracer !== "undefined" &&
    typeof window.ImageTracer.imagedataToSVG === "function";

  // ===================================================================
  // Small generic helpers
  // ===================================================================

  function uid() {
    return "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function clamp255(v) {
    return v < 0 ? 0 : (v > 255 ? 255 : v);
  }

  function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.hidden = false;
  }

  function clearError() {
    errorBanner.hidden = true;
    errorBanner.textContent = "";
  }

  function getExt(name) {
    var m = /\.[^./\\]+$/.exec(name || "");
    return m ? m[0].toLowerCase() : "";
  }

  function baseName(name) {
    var ext = getExt(name);
    return ext ? name.slice(0, -ext.length) : name;
  }

  function isAcceptedFile(file) {
    if (ACCEPTED_TYPES.indexOf(file.type) !== -1) return true;
    // Some browsers/OSes report an empty or generic MIME type for images;
    // fall back to checking the file extension.
    var ext = getExt(file.name);
    return ACCEPTED_EXT.indexOf(ext) !== -1;
  }

  function updateCounterAndButtons() {
    fileCountEl.textContent = String(items.length);
    var hasFiles = items.length > 0;
    clearAllBtn.disabled = !hasFiles;
    convertAllBtn.disabled = !hasFiles || !tracerAvailable;
    emptyState.hidden = hasFiles;
    emptyState.style.display = hasFiles ? "none" : "block";
  }

  // ===================================================================
  // File intake (upload, drag & drop, validation) — unchanged workflow
  // ===================================================================

  function addFiles(fileList) {
    clearError();
    var incoming = Array.prototype.slice.call(fileList || []);
    if (incoming.length === 0) return;

    var rejectedType = [];
    var rejectedLimit = [];

    for (var i = 0; i < incoming.length; i++) {
      var file = incoming[i];

      if (items.length >= MAX_FILES) {
        rejectedLimit.push(file.name);
        continue;
      }
      if (!isAcceptedFile(file)) {
        rejectedType.push(file.name);
        continue;
      }

      var item = {
        id: uid(),
        file: file,
        previewUrl: URL.createObjectURL(file),
        status: "idle",
        svg: null,
        errorMsg: null
      };
      items.push(item);
      renderCard(item);
    }

    var messages = [];
    if (rejectedType.length) {
      messages.push(
        "Format tidak didukung (hanya PNG/JPG/JPEG): " + rejectedType.join(", ")
      );
    }
    if (rejectedLimit.length) {
      messages.push(
        "Maksimal " + MAX_FILES + " gambar. File berikut tidak ditambahkan: " +
        rejectedLimit.join(", ")
      );
    }
    if (messages.length) showError(messages.join(" "));

    updateCounterAndButtons();
  }

  function findItem(id) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === id) return items[i];
    }
    return null;
  }

  function removeItem(id) {
    var idx = -1;
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === id) { idx = i; break; }
    }
    if (idx === -1) return;
    var item = items[idx];
    try { URL.revokeObjectURL(item.previewUrl); } catch (e) {}
    items.splice(idx, 1);
    var cardEl = grid.querySelector('.card[data-id="' + id + '"]');
    if (cardEl) cardEl.remove();
    updateCounterAndButtons();
  }

  function clearAll() {
    items.slice().forEach(function (item) {
      try { URL.revokeObjectURL(item.previewUrl); } catch (e) {}
    });
    items = [];
    grid.innerHTML = "";
    clearError();
    updateCounterAndButtons();
  }

  // ===================================================================
  // Card rendering / status UI
  // ===================================================================

  function renderCard(item) {
    var node = cardTemplate.content.firstElementChild.cloneNode(true);
    node.setAttribute("data-id", item.id);

    var img = node.querySelector(".original-img");
    img.src = item.previewUrl;
    img.alt = item.file.name;

    var nameEl = node.querySelector(".card-filename");
    nameEl.textContent = item.file.name;
    nameEl.title = item.file.name;

    node.querySelector(".btn-remove").addEventListener("click", function () {
      removeItem(item.id);
    });

    var downloadBtn = node.querySelector(".btn-download");
    downloadBtn.addEventListener("click", function () {
      downloadSVG(item);
    });

    grid.appendChild(node);
    setCardStatus(item.id, "idle");
  }

  // `stageText` lets the "converting" state show which pipeline stage is
  // currently running (Enhancing / Cleaning / Tracing / Smoothing /
  // Optimizing), per the required processing feedback — without adding any
  // new UI controls.
  function setCardStatus(id, status, message, stageText) {
    var item = findItem(id);
    if (item) item.status = status;

    var card = grid.querySelector('.card[data-id="' + id + '"]');
    if (!card) return;
    var statusEl = card.querySelector(".status");
    var statusText = card.querySelector(".status-text");
    var downloadBtn = card.querySelector(".btn-download");

    statusEl.classList.remove(
      "status-idle", "status-converting", "status-done", "status-error"
    );

    if (status === "idle") {
      statusEl.classList.add("status-idle");
      statusText.textContent = "Siap";
      downloadBtn.hidden = true;
    } else if (status === "converting") {
      statusEl.classList.add("status-converting");
      statusText.textContent = stageText || "Converting...";
      downloadBtn.hidden = true;
    } else if (status === "done") {
      statusEl.classList.add("status-done");
      statusText.textContent = "✓ Vector selesai";
      downloadBtn.hidden = false;
    } else if (status === "error") {
      statusEl.classList.add("status-error");
      statusText.textContent = "✕ Gagal" + (message ? ": " + message : "");
      downloadBtn.hidden = true;
    }
  }

  function renderSVGPreview(id, svgString) {
    var card = grid.querySelector('.card[data-id="' + id + '"]');
    if (!card) return;
    var holder = card.querySelector(".svg-holder");
    holder.innerHTML = svgString || "";
  }

  // ===================================================================
  // STAGE 0 — decode file to a (downscaled) canvas ImageData
  // ===================================================================

  function preprocessToImageData(item) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth;
        var h = img.naturalHeight;
        if (!w || !h) {
          reject(new Error("Gambar tidak dapat dibaca (dimensi tidak valid)."));
          return;
        }

        var longest = Math.max(w, h);
        var scaleFactor = longest > MAX_TRACE_DIMENSION ? (MAX_TRACE_DIMENSION / longest) : 1;
        var targetW = Math.max(1, Math.round(w * scaleFactor));
        var targetH = Math.max(1, Math.round(h * scaleFactor));

        var canvas = document.createElement("canvas");
        canvas.width = targetW;
        canvas.height = targetH;
        var ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas 2D tidak didukung di browser ini."));
          return;
        }

        ctx.imageSmoothingEnabled = true;
        if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
        ctx.clearRect(0, 0, targetW, targetH);
        ctx.drawImage(img, 0, 0, targetW, targetH);

        try {
          var imgd = ctx.getImageData(0, 0, targetW, targetH);
          resolve(imgd);
        } catch (err) {
          reject(new Error("Gagal membaca data piksel gambar."));
        }
      };
      img.onerror = function () {
        reject(new Error("Gagal memuat gambar. File mungkin rusak atau bukan gambar yang valid."));
      };
      img.src = item.previewUrl;
    });
  }

  // ===================================================================
  // STAGE 1 — smart image-type detection (logo / lineart / illustration /
  // photo) + simple-background detection. Both are cheap, sampled passes
  // (never touch every pixel) so they stay fast even at 1400px.
  // ===================================================================

  function analyzeProfile(imageData) {
    var w = imageData.width, h = imageData.height, data = imageData.data;

    // --- sampled interior pass: distinct-color estimate + saturation ---
    var stepX = Math.max(1, Math.round(w / 140));
    var stepY = Math.max(1, Math.round(h / 140));
    var seenColors = Object.create(null);
    var distinctCount = 0;
    var satSum = 0, satN = 0;

    for (var y = 0; y < h; y += stepY) {
      for (var x = 0; x < w; x += stepX) {
        var idx = (y * w + x) * 4;
        var r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
        if (a < 8) continue; // ignore fully transparent samples
        // Bucket to 5 bits/channel so near-identical colors count as one —
        // this is only for *counting* distinct colors, not for output.
        var key = (r >> 3) + "-" + (g >> 3) + "-" + (b >> 3);
        if (!seenColors[key]) { seenColors[key] = true; distinctCount++; }
        var maxc = Math.max(r, g, b), minc = Math.min(r, g, b);
        satSum += maxc === 0 ? 0 : (maxc - minc) / maxc;
        satN++;
      }
    }
    var avgSaturation = satN ? (satSum / satN) : 0;

    // --- thin border ring pass: is there a simple, near-uniform background? ---
    var ring = Math.max(1, Math.round(Math.min(w, h) * 0.02));
    var bStepX = Math.max(1, Math.round(w / 120));
    var bStepY = Math.max(1, Math.round(h / 120));
    var sumR = 0, sumG = 0, sumB = 0, sumA = 0, n = 0;
    var samples = [];

    for (var by = 0; by < h; by += bStepY) {
      for (var bx = 0; bx < w; bx += bStepX) {
        var isBorder = bx < ring || bx >= w - ring || by < ring || by >= h - ring;
        if (!isBorder) continue;
        var bIdx = (by * w + bx) * 4;
        var pr = data[bIdx], pg = data[bIdx + 1], pb = data[bIdx + 2], pa = data[bIdx + 3];
        sumR += pr; sumG += pg; sumB += pb; sumA += pa; n++;
        samples.push([pr, pg, pb, pa]);
      }
    }

    var hasSimpleBackground = false;
    var bgColor = { r: 255, g: 255, b: 255, a: 255 };

    if (n > 0) {
      var meanR = sumR / n, meanG = sumG / n, meanB = sumB / n, meanA = sumA / n;
      var variance = 0;
      for (var s = 0; s < samples.length; s++) {
        var dr = samples[s][0] - meanR, dg = samples[s][1] - meanG, db = samples[s][2] - meanB;
        variance += (dr * dr + dg * dg + db * db);
      }
      variance = variance / samples.length;
      // Low variance along the border => background looks flat/simple.
      // Mostly-transparent border (alpha ~0) is already "clean" — nothing
      // to flatten, tracer handles transparency natively.
      hasSimpleBackground = variance < 900 && meanA > 40;
      bgColor = { r: Math.round(meanR), g: Math.round(meanG), b: Math.round(meanB), a: Math.round(meanA) };
    }

    // --- classify ---
    var type;
    if (avgSaturation < 0.12 && distinctCount <= 6) {
      type = "lineart";
    } else if (hasSimpleBackground && distinctCount <= 10) {
      type = "logo";
    } else if (distinctCount <= 40) {
      type = "illustration";
    } else {
      type = "photo";
    }

    return {
      type: type,
      distinctCount: distinctCount,
      avgSaturation: avgSaturation,
      hasSimpleBackground: hasSimpleBackground,
      bgColor: bgColor
    };
  }

  // ===================================================================
  // STAGE 2 — AUTO IMAGE ENHANCEMENT (contrast, denoise, conditional sharpen)
  // ===================================================================

  // Estimates local pixel noise via a sparse grid of adjacent-pixel deltas.
  // Cheap (sampled), used only to decide whether denoising is worth it —
  // clean logos/illustrations are left untouched.
  function estimateNoise(imageData) {
    var w = imageData.width, h = imageData.height, data = imageData.data;
    var stepX = Math.max(2, Math.round(w / 80));
    var stepY = Math.max(2, Math.round(h / 80));
    var total = 0, n = 0;
    for (var y = 1; y < h - 1; y += stepY) {
      for (var x = 1; x < w - 1; x += stepX) {
        var i0 = (y * w + x) * 4;
        var i1 = (y * w + x + 1) * 4;
        var i2 = ((y + 1) * w + x) * 4;
        total += Math.abs(data[i0] - data[i1]) + Math.abs(data[i0] - data[i2]);
        n++;
      }
    }
    return n ? (total / n) : 0;
  }

  // Single-pass 3x3 box blur — mild, edge-agnostic noise reduction. Only
  // invoked when estimateNoise() says the source is actually noisy.
  function boxBlur3(imageData) {
    var w = imageData.width, h = imageData.height;
    var src = imageData.data;
    var out = new Uint8ClampedArray(src.length);

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var rs = 0, gs = 0, bs = 0, as = 0, cnt = 0;
        for (var dy = -1; dy <= 1; dy++) {
          var yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (var dx = -1; dx <= 1; dx++) {
            var xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            var idx = (yy * w + xx) * 4;
            rs += src[idx]; gs += src[idx + 1]; bs += src[idx + 2]; as += src[idx + 3];
            cnt++;
          }
        }
        var o = (y * w + x) * 4;
        out[o] = rs / cnt; out[o + 1] = gs / cnt; out[o + 2] = bs / cnt; out[o + 3] = as / cnt;
      }
    }
    imageData.data.set(out);
  }

  // Mild unsharp mask: out = original + amount * (original - blurred).
  // Only used on 'photo' type images, where real edge detail benefits from
  // it; skipped on logos/lineart/illustration where hard edges are already
  // crisp and sharpening would just add ringing artifacts.
  function unsharpMask(imageData, amount) {
    var w = imageData.width, h = imageData.height;
    var original = new Uint8ClampedArray(imageData.data);
    boxBlur3(imageData); // imageData.data now holds the blurred version
    var blurred = imageData.data;

    for (var i = 0; i < original.length; i += 4) {
      blurred[i] = clamp255(original[i] + amount * (original[i] - blurred[i]));
      blurred[i + 1] = clamp255(original[i + 1] + amount * (original[i + 1] - blurred[i + 1]));
      blurred[i + 2] = clamp255(original[i + 2] + amount * (original[i + 2] - blurred[i + 2]));
      blurred[i + 3] = original[i + 3];
    }
  }

  // Auto-levels: stretches each RGB channel between its ~0.5th and 99.5th
  // percentile (sampled histogram), so washed-out/low-contrast scans and
  // photos get a mild, automatic contrast boost. Skipped when the image
  // already uses close to the full range (nothing meaningful to stretch).
  function autoContrast(imageData) {
    var data = imageData.data;
    var histR = new Uint32Array(256), histG = new Uint32Array(256), histB = new Uint32Array(256);
    var step = Math.max(4, Math.floor(data.length / 4 / 40000) * 4);

    for (var i = 0; i < data.length; i += step) {
      histR[data[i]]++; histG[data[i + 1]]++; histB[data[i + 2]]++;
    }

    function percentileBounds(hist) {
      var total = 0;
      for (var v = 0; v < 256; v++) total += hist[v];
      if (!total) return { lo: 0, hi: 255 };
      var loCount = total * 0.005, hiCount = total * 0.995;
      var acc = 0, lo = 0, hi = 255;
      for (var a = 0; a < 256; a++) { acc += hist[a]; if (acc >= loCount) { lo = a; break; } }
      acc = 0;
      for (var b2 = 255; b2 >= 0; b2--) { acc += hist[b2]; if (acc >= (total - hiCount)) { hi = b2; break; } }
      if (hi <= lo) { lo = 0; hi = 255; }
      return { lo: lo, hi: hi };
    }

    var rb = percentileBounds(histR), gb = percentileBounds(histG), bb = percentileBounds(histB);
    var span = Math.min(rb.hi - rb.lo, gb.hi - gb.lo, bb.hi - bb.lo);
    if (span > 235) return; // already uses close to full range — leave it alone

    function stretch(v, lo, hi) {
      if (hi <= lo) return v;
      return clamp255(Math.round((v - lo) * 255 / (hi - lo)));
    }

    for (var p = 0; p < data.length; p += 4) {
      data[p] = stretch(data[p], rb.lo, rb.hi);
      data[p + 1] = stretch(data[p + 1], gb.lo, gb.hi);
      data[p + 2] = stretch(data[p + 2], bb.lo, bb.hi);
    }
  }

  function enhanceImageData(imageData, profile) {
    // 1) contrast — safe & mild for every type
    autoContrast(imageData);

    // 2) denoise — only if the source actually looks noisy (compression
    //    artifacts, sensor grain). Logos/flat art rarely trigger this.
    var noiseScore = estimateNoise(imageData);
    if (noiseScore > 9) {
      boxBlur3(imageData);
    }

    // 3) sharpen — only for photo/complex images. Never applied to
    //    logo/lineart/illustration, so flat edges are never touched.
    if (profile.type === "photo") {
      unsharpMask(imageData, 0.25);
    }
  }

  // ===================================================================
  // STAGE 3 — AUTO COLOR CLEANUP + AUTO BACKGROUND CLEANUP
  // ===================================================================

  // Posterize: rounds each channel to N evenly spaced levels. This merges
  // near-duplicate colors (JPEG ringing, gradient banding, sensor noise)
  // into flat, clean bands *before* the tracer's own palette selection —
  // so imagetracer starts from far fewer, cleaner colors instead of
  // fighting per-pixel speckle.
  function posterize(imageData, levels) {
    var data = imageData.data;
    var step = 255 / (levels - 1);
    for (var i = 0; i < data.length; i += 4) {
      data[i] = clamp255(Math.round(Math.round(data[i] / step) * step));
      data[i + 1] = clamp255(Math.round(Math.round(data[i + 1] / step) * step));
      data[i + 2] = clamp255(Math.round(Math.round(data[i + 2] / step) * step));
    }
  }

  function colorLevelsForType(type) {
    switch (type) {
      case "logo": return 6;          // flat, few colors — aggressive cleanup
      case "lineart": return 4;       // near black/white
      case "illustration": return 9;
      default: return 14;             // photo — gentler, keep gradients usable
    }
  }

  // Snaps any pixel close to the detected border color exactly onto that
  // color, so a "simple" background collapses into one flat region instead
  // of fragmenting into hundreds of near-identical tiny background paths.
  // Only runs when analyzeProfile() found a genuinely simple, low-variance
  // border — a busy/detailed background is left completely untouched.
  function flattenSimpleBackground(imageData, bgColor) {
    var data = imageData.data;
    var tolerance = 34; // Euclidean-ish per-channel tolerance
    for (var i = 0; i < data.length; i += 4) {
      var dr = data[i] - bgColor.r;
      var dg = data[i + 1] - bgColor.g;
      var db = data[i + 2] - bgColor.b;
      if (Math.abs(dr) <= tolerance && Math.abs(dg) <= tolerance && Math.abs(db) <= tolerance) {
        data[i] = bgColor.r; data[i + 1] = bgColor.g; data[i + 2] = bgColor.b;
      }
    }
  }

  function colorAndBackgroundCleanup(imageData, profile) {
    posterize(imageData, colorLevelsForType(profile.type));
    if (profile.hasSimpleBackground) {
      flattenSimpleBackground(imageData, profile.bgColor);
    }
  }

  // ===================================================================
  // STAGE 4 — tracing options per detected type ("high quality" preset,
  // internally adapted — the user never sees these knobs)
  // ===================================================================

  function buildTraceOptions(profile) {
    var base = {
      rightangleenhance: true,
      colorsampling: 2,      // deterministic — avoids jittery, inconsistent edges
      colorquantcycles: 3,
      layering: 0,
      strokewidth: 0,
      linefilter: true,
      scale: 1,
      roundcoords: 1,        // trims float noise from path data
      viewbox: true,
      desc: false,
      blurradius: 3,         // edge-preserving pre-blur inside the tracer
      blurdelta: 20
    };

    switch (profile.type) {
      case "logo":
        return Object.assign({}, base, {
          ltres: 1, qtres: 1.3, pathomit: 16,
          numberofcolors: Math.max(4, Math.min(10, profile.distinctCount + 2)),
          mincolorratio: 0.02
        });
      case "lineart":
        return Object.assign({}, base, {
          ltres: 0.6, qtres: 0.8, pathomit: 10,
          numberofcolors: 4, mincolorratio: 0.01
        });
      case "illustration":
        return Object.assign({}, base, {
          ltres: 1, qtres: 1.1, pathomit: 12,
          numberofcolors: 14, mincolorratio: 0.015
        });
      default: // photo / complex
        return Object.assign({}, base, {
          ltres: 1, qtres: 1, pathomit: 8,
          numberofcolors: 20, mincolorratio: 0.01
        });
    }
  }

  // ===================================================================
  // STAGE 5 — validation (real SVG, real vector content, no NaN/undefined)
  // ===================================================================

  function validateVectorSVG(svgstr) {
    if (!svgstr || typeof svgstr !== "string") {
      return { valid: false, reason: "Hasil konversi kosong." };
    }
    var trimmed = svgstr.trim();
    if (!/^<svg[\s>]/i.test(trimmed) || !/<\/svg>\s*$/i.test(trimmed)) {
      return { valid: false, reason: "Output bukan SVG yang valid." };
    }
    if (/<image[\s>]/i.test(trimmed)) {
      return { valid: false, reason: "Hasil berisi gambar raster yang dibungkus, bukan vector." };
    }
    if (/\bNaN\b/.test(trimmed) || /\bundefined\b/.test(trimmed)) {
      return { valid: false, reason: "Data path rusak (nilai tidak valid)." };
    }
    var hasVectorElement = /<(path|polygon|polyline|circle|ellipse|rect|line)[\s>]/i.test(trimmed);
    if (!hasVectorElement) {
      return { valid: false, reason: "Hasil tidak mengandung elemen vector (path/shape)." };
    }
    return { valid: true, reason: null };
  }

  // ===================================================================
  // STAGE 6 — AUTO BEAUTIFY: removes tiny/near-invisible noise shapes and
  // exact duplicate paths from the *finished* SVG. Operates only by
  // deleting whole, self-contained shape elements (never edits points
  // inside a path), so it can never corrupt a curve or a hole. If anything
  // goes wrong, or a change would remove everything, it silently falls
  // back to the untouched SVG — beautify can only make things smaller,
  // never break them (see FALLBACK requirement).
  // ===================================================================

  function beautifySVG(svgstr) {
    try {
      var parser = new DOMParser();
      var doc = parser.parseFromString(svgstr, "image/svg+xml");
      var svgEl = doc.documentElement;
      if (!svgEl || svgEl.nodeName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) {
        return svgstr;
      }

      var host = document.createElement("div");
      host.style.position = "fixed";
      host.style.left = "-99999px";
      host.style.top = "0";
      host.style.width = "0";
      host.style.height = "0";
      host.style.overflow = "hidden";
      document.body.appendChild(host);

      var imported = document.importNode(svgEl, true);
      host.appendChild(imported);

      var shapes = Array.prototype.slice.call(
        imported.querySelectorAll("path, polygon, polyline, circle, ellipse, rect, line")
      );

      var totalArea = 0;
      var vb = imported.getAttribute("viewBox");
      if (vb) {
        var parts = vb.trim().split(/\s+/).map(Number);
        if (parts.length === 4 && isFinite(parts[2]) && isFinite(parts[3])) {
          totalArea = Math.abs(parts[2] * parts[3]);
        }
      }
      if (!totalArea) {
        var ww = parseFloat(imported.getAttribute("width")) || 0;
        var hh = parseFloat(imported.getAttribute("height")) || 0;
        totalArea = ww * hh;
      }
      var minArea = totalArea > 0 ? Math.max(totalArea * 0.00004, 0.6) : 0.6;

      var seen = Object.create(null);
      var toRemove = [];

      shapes.forEach(function (el) {
        var bbox = null;
        try { bbox = el.getBBox(); } catch (e) {}
        var area = bbox ? Math.abs(bbox.width * bbox.height) : null;

        var sig = el.nodeName.toLowerCase() + "|" +
          (el.getAttribute("d") || el.getAttribute("points") || "") + "|" +
          (el.getAttribute("fill") || "");

        if (seen[sig]) {
          toRemove.push(el); // exact duplicate path
        } else if (area !== null && area < minArea) {
          toRemove.push(el); // noise-sized fragment
        } else {
          seen[sig] = true;
        }
      });

      // Never let cleanup remove every shape — that would be worse than
      // leaving noise in. Only apply if something real remains.
      if (toRemove.length > 0 && toRemove.length < shapes.length) {
        toRemove.forEach(function (el) {
          if (el.parentNode) el.parentNode.removeChild(el);
        });
      }

      var cleaned = new XMLSerializer().serializeToString(imported);
      document.body.removeChild(host);

      if (!cleaned || cleaned.indexOf("<svg") === -1) return svgstr;
      return cleaned;
    } catch (err) {
      return svgstr; // beautify must never turn a valid SVG into a broken one
    }
  }

  // ===================================================================
  // Full pipeline for one image, with per-stage status text.
  // ===================================================================

  function traceOneImage(item) {
    if (!tracerAvailable) {
      return Promise.resolve({ ok: false, error: "Library vectorizer tidak termuat." });
    }

    setCardStatus(item.id, "converting", null, "Enhancing image...");

    return preprocessToImageData(item)
      .then(function (imgd) {
        var profile = analyzeProfile(imgd);
        enhanceImageData(imgd, profile);

        setCardStatus(item.id, "converting", null, "Cleaning image...");
        colorAndBackgroundCleanup(imgd, profile);

        setCardStatus(item.id, "converting", null, "Tracing vector...");
        var traceOptions = buildTraceOptions(profile);
        var svgstr;
        try {
          svgstr = window.ImageTracer.imagedataToSVG(imgd, traceOptions);
        } catch (err) {
          throw new Error((err && err.message) ? err.message : "Terjadi kesalahan saat melakukan tracing.");
        }

        var earlyCheck = validateVectorSVG(svgstr);
        if (!earlyCheck.valid) throw new Error(earlyCheck.reason);

        setCardStatus(item.id, "converting", null, "Smoothing paths...");
        svgstr = beautifySVG(svgstr);

        setCardStatus(item.id, "converting", null, "Optimizing SVG...");
        var finalCheck = validateVectorSVG(svgstr);
        if (!finalCheck.valid) throw new Error(finalCheck.reason);

        return { ok: true, svg: svgstr };
      })
      .catch(function (err) {
        return {
          ok: false,
          error: (err && err.message) ? err.message : "Terjadi kesalahan saat memproses gambar."
        };
      });
  }

  function convertOne(item) {
    return traceOneImage(item).then(function (result) {
      // Item may have been removed while converting.
      if (!findItem(item.id)) return;

      if (result.ok) {
        item.svg = result.svg;
        item.errorMsg = null;
        renderSVGPreview(item.id, result.svg);
        setCardStatus(item.id, "done");
      } else {
        item.svg = null;
        item.errorMsg = result.error || "Konversi gagal.";
        setCardStatus(item.id, "error", item.errorMsg);
      }
    });
  }

  // Images are processed ONE AT A TIME (not in parallel) so the browser
  // stays responsive — each is a non-trivial amount of pixel work, and with
  // up to 5 images running them concurrently risks freezing the tab.
  function convertAll() {
    clearError();

    if (!tracerAvailable) {
      showError(
        "Gagal memuat library vectorizer (imagetracerjs). Periksa koneksi internet Anda, lalu muat ulang halaman."
      );
      return;
    }
    if (items.length === 0) return;

    convertAllBtn.disabled = true;
    convertAllBtn.textContent = "Converting...";

    var pending = items.filter(function (it) { return it.status !== "done"; });

    var chain = Promise.resolve();
    pending.forEach(function (it) {
      chain = chain.then(function () { return convertOne(it); });
    });

    chain.then(function () {
      convertAllBtn.disabled = items.length === 0;
      convertAllBtn.textContent = "Convert ke Vector";
    });
  }

  function downloadSVG(item) {
    if (!item.svg) return;
    var blob = new Blob([item.svg], { type: "image/svg+xml" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = baseName(item.file.name) + ".svg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // --- Event wiring -------------------------------------------------

  dropzone.addEventListener("click", function () {
    fileInput.click();
  });

  dropzone.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });

  fileInput.addEventListener("change", function (e) {
    addFiles(e.target.files);
    fileInput.value = ""; // allow re-selecting the same file later
  });

  ["dragenter", "dragover"].forEach(function (evt) {
    dropzone.addEventListener(evt, function (e) {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add("dragover");
    });
  });

  ["dragleave", "dragend"].forEach(function (evt) {
    dropzone.addEventListener(evt, function (e) {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove("dragover");
    });
  });

  dropzone.addEventListener("drop", function (e) {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove("dragover");
    var dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length) {
      addFiles(dt.files);
    }
  });

  convertAllBtn.addEventListener("click", convertAll);
  clearAllBtn.addEventListener("click", clearAll);

  if (!tracerAvailable) {
    showError(
      "Gagal memuat library vectorizer (imagetracerjs). Periksa koneksi internet Anda, lalu muat ulang halaman."
    );
  }

  updateCounterAndButtons();
})();
