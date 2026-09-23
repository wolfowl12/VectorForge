(function () {
  "use strict";

  var MAX_FILES = 5;
  var ACCEPTED_TYPES = ["image/png", "image/jpeg"];
  var ACCEPTED_EXT = [".png", ".jpg", ".jpeg"];

  // Tracing options tuned for logos / icons / text / solid-color art.
  // Deliberately not exposed to the user (per product spec).
  //
  // Notes on why these values were chosen (jagged/noisy output fix):
  // - colorsampling: 2 (deterministic) instead of 1 (random) — random sampling
  //   is what produces jittery, inconsistent region edges from run to run.
  // - blurradius/blurdelta: an edge-preserving pre-blur run by the tracer
  //   itself before color quantization, which removes JPEG/compression noise
  //   without softening real edges (it only blurs where neighboring pixels
  //   are already close in color).
  // - pathomit raised: discards tiny stray shapes (a few px) that come from
  //   pixel-level noise, without touching the main shapes.
  // - ltres / qtres: fitting-error tolerance for straight lines / curves.
  //   Kept moderate (not pushed too high) so real detail in logos/text isn't
  //   flattened away — most of the "jagged" complaint is actually fixed by
  //   the preprocessing (downscale + blur + fewer colors) below, not by
  //   loosening these further.
  // - roundcoords: rounds path coordinates to 1 decimal — trims float noise
  //   from the SVG without visibly changing shapes, keeps file size sane.
  var TRACE_OPTIONS = {
    ltres: 1,
    qtres: 1.2,
    pathomit: 14,
    rightangleenhance: true,
    colorsampling: 2,
    numberofcolors: 16,
    mincolorratio: 0.02,
    colorquantcycles: 3,
    layering: 0,
    strokewidth: 0,
    linefilter: true,
    scale: 1,
    roundcoords: 1,
    viewbox: true,
    desc: false,
    blurradius: 3,
    blurdelta: 20
  };

  // Preprocessing: images larger than this (longest side, px) are downscaled
  // proportionally before tracing. This is the single biggest fix for
  // jagged/gerigi output — tracing a huge raster follows every pixel of
  // sensor/JPEG noise and produces thousands of tiny nodes; the browser's
  // own high-quality downscale acts as a natural anti-alias/smoothing pass
  // and collapses that noise before the tracer ever sees it.
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

  function uid() {
    return "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
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

  function setCardStatus(id, status, message) {
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
      statusText.textContent = "Converting...";
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

  // Decodes the file into an <img>, downscales it onto a canvas if it's
  // larger than MAX_TRACE_DIMENSION (proportional, longest side), and
  // returns the resulting ImageData. This is the "preprocessing" step:
  // proportional resize + the browser's own smoothing = noise reduction
  // before a single trace path is computed.
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

  // Validates that the tracer actually produced a real vector SVG:
  // - is a well-formed <svg>...</svg> string
  // - contains at least one vector drawing element (path/polygon/etc.)
  // - is not just a raster image smuggled inside an <svg> wrapper
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
    var hasVectorElement = /<(path|polygon|polyline|circle|ellipse|rect|line)[\s>]/i.test(trimmed);
    if (!hasVectorElement) {
      return { valid: false, reason: "Hasil tidak mengandung elemen vector (path/shape)." };
    }
    return { valid: true, reason: null };
  }

  function traceOneImage(item) {
    if (!tracerAvailable) {
      return Promise.resolve({ ok: false, error: "Library vectorizer tidak termuat." });
    }

    return preprocessToImageData(item)
      .then(function (imgd) {
        var svgstr;
        try {
          svgstr = window.ImageTracer.imagedataToSVG(imgd, TRACE_OPTIONS);
        } catch (err) {
          throw new Error((err && err.message) ? err.message : "Terjadi kesalahan saat melakukan tracing.");
        }

        var check = validateVectorSVG(svgstr);
        if (!check.valid) {
          throw new Error(check.reason);
        }

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
    setCardStatus(item.id, "converting");
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

    Promise.all(pending.map(convertOne)).then(function () {
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
