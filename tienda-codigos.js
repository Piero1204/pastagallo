/* Pasta Gallo · generador de códigos para las etiquetas de la tienda (sin librerías externas ni internet).
   - QR: modo bytes (UTF-8), versiones 1 a 10, corrección L/M/Q/H (por defecto M). Alcanza para códigos internos y enlaces cortos.
   - Código de barras Code 128 (juegos B y C): se lee con cualquier lector USB y con la cámara (BarcodeDetector).
   Todo se devuelve como texto SVG listo para insertar en la hoja de etiquetas. Funciones puras: se prueban aparte.
   window.PG_CODIGOS = { qr(texto, ecc) → { n, mod }, qrSvg(texto, opc), code128(texto) → { ancho, barras }, code128Svg(texto, opc) } */
(function (root) {
  "use strict";

  /* ============================== QR ============================== */
  var ECC_POR_BLOQUE = [[-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18], [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26], [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24], [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28]];
  var N_BLOQUES = [[-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4], [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5], [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8], [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8]];
  var NIVEL = { L: 0, M: 1, Q: 2, H: 3 }, BITS_NIVEL = [1, 0, 3, 2];

  function utf8(s) {
    var o = [], i, c;
    s = String(s == null ? "" : s);
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c >= 0xD800 && c < 0xDC00 && i + 1 < s.length) { c = 0x10000 + ((c - 0xD800) << 10) + (s.charCodeAt(++i) - 0xDC00); }
      if (c < 0x80) o.push(c);
      else if (c < 0x800) o.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) o.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else o.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return o;
  }
  function modulosBrutos(v) {
    var r = (16 * v + 128) * v + 64;
    if (v >= 2) { var na = Math.floor(v / 7) + 2; r -= (25 * na - 10) * na - 55; if (v >= 7) r -= 36; }
    return r;
  }
  function palabrasDatos(v, e) { return Math.floor(modulosBrutos(v) / 8) - ECC_POR_BLOQUE[e][v] * N_BLOQUES[e][v]; }
  function gfMul(x, y) { var z = 0, i; for (i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z; }
  function rsDivisor(g) {
    var r = [], i, j, raiz = 1;
    for (i = 0; i < g; i++) r.push(0);
    r[g - 1] = 1;
    for (i = 0; i < g; i++) {
      for (j = 0; j < g; j++) { r[j] = gfMul(r[j], raiz); if (j + 1 < g) r[j] ^= r[j + 1]; }
      raiz = gfMul(raiz, 2);
    }
    return r;
  }
  function rsResto(datos, div) {
    var r = div.map(function () { return 0; });
    datos.forEach(function (b) {
      var f = b ^ r.shift(); r.push(0);
      div.forEach(function (c, i) { r[i] ^= gfMul(c, f); });
    });
    return r;
  }
  function bit(x, i) { return ((x >>> i) & 1) !== 0; }

  /** Devuelve { n: lado en módulos, mod: matriz de booleanos (true = oscuro), version } o lanza Error si no cabe (máx. ~213 bytes con nivel L). */
  function qr(texto, ecc) {
    var e = NIVEL[ecc || "M"]; if (e == null) e = 1;
    var datos = utf8(texto), v, usados = 0;
    for (v = 1; v <= 10; v++) {
      usados = 4 + (v < 10 ? 8 : 16) + 8 * datos.length;
      if (usados <= palabrasDatos(v, e) * 8) break;
    }
    if (v > 10) throw new Error("Texto demasiado largo para el QR.");
    var n = v * 4 + 17, mod = [], esFn = [], i, j;
    for (i = 0; i < n; i++) { mod.push([]); esFn.push([]); for (j = 0; j < n; j++) { mod[i].push(false); esFn[i].push(false); } }
    function fn(x, y, oscuro) { mod[y][x] = oscuro; esFn[y][x] = true; }

    // 1. bits de datos
    var bits = [];
    function poner(val, len) { for (var k = len - 1; k >= 0; k--) bits.push((val >>> k) & 1); }
    poner(4, 4); poner(datos.length, v < 10 ? 8 : 16);
    datos.forEach(function (b) { poner(b, 8); });
    var cap = palabrasDatos(v, e) * 8;
    poner(0, Math.min(4, cap - bits.length));
    poner(0, (8 - bits.length % 8) % 8);
    for (var pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) poner(pad, 8);
    var pal = [];
    for (i = 0; i < bits.length; i += 8) { var by = 0; for (j = 0; j < 8; j++) by = (by << 1) | bits[i + j]; pal.push(by); }

    // 2. corrección de errores e intercalado
    var nb = N_BLOQUES[e][v], lenEcc = ECC_POR_BLOQUE[e][v], brutas = Math.floor(modulosBrutos(v) / 8);
    var cortos = nb - brutas % nb, lenCorto = Math.floor(brutas / nb), bloques = [], div = rsDivisor(lenEcc), k = 0;
    for (i = 0; i < nb; i++) {
      var dat = pal.slice(k, k + lenCorto - lenEcc + (i < cortos ? 0 : 1)); k += dat.length;
      var ecr = rsResto(dat, div);
      if (i < cortos) dat.push(0);
      bloques.push(dat.concat(ecr));
    }
    var todo = [];
    for (i = 0; i < bloques[0].length; i++) for (j = 0; j < nb; j++) if (i !== lenCorto - lenEcc || j >= cortos) todo.push(bloques[j][i]);

    // 3. patrones de función
    for (i = 0; i < n; i++) { fn(6, i, i % 2 === 0); fn(i, 6, i % 2 === 0); }
    function buscador(x, y) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var d = Math.max(Math.abs(dx), Math.abs(dy)), xx = x + dx, yy = y + dy;
        if (xx >= 0 && xx < n && yy >= 0 && yy < n) fn(xx, yy, d !== 2 && d !== 4);
      }
    }
    buscador(3, 3); buscador(n - 4, 3); buscador(3, n - 4);
    var pos = [];
    if (v > 1) {
      var na = Math.floor(v / 7) + 2, paso = Math.ceil((v * 4 + 4) / (na * 2 - 2)) * 2;
      pos = [6]; for (var p = n - 7; pos.length < na; p -= paso) pos.splice(1, 0, p);
      for (i = 0; i < na; i++) for (j = 0; j < na; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
        for (var ay = -2; ay <= 2; ay++) for (var ax = -2; ax <= 2; ax++) fn(pos[i] + ax, pos[j] + ay, Math.max(Math.abs(ax), Math.abs(ay)) !== 1);
      }
    }
    function formato(mascara) {
      var d = (BITS_NIVEL[e] << 3) | mascara, r = d, q;
      for (q = 0; q < 10; q++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      var b = ((d << 10) | r) ^ 0x5412;
      for (q = 0; q <= 5; q++) fn(8, q, bit(b, q));
      fn(8, 7, bit(b, 6)); fn(8, 8, bit(b, 7)); fn(7, 8, bit(b, 8));
      for (q = 9; q < 15; q++) fn(14 - q, 8, bit(b, q));
      for (q = 0; q < 8; q++) fn(n - 1 - q, 8, bit(b, q));
      for (q = 8; q < 15; q++) fn(8, n - 15 + q, bit(b, q));
      fn(8, n - 8, true);
    }
    formato(0);
    if (v >= 7) {
      var r2 = v, q2;
      for (q2 = 0; q2 < 12; q2++) r2 = (r2 << 1) ^ ((r2 >>> 11) * 0x1F25);
      var vb = (v << 12) | r2;
      for (q2 = 0; q2 < 18; q2++) { var col = bit(vb, q2), a = n - 11 + q2 % 3, b2 = Math.floor(q2 / 3); fn(a, b2, col); fn(b2, a, col); }
    }

    // 4. colocar datos en zigzag
    var idx = 0;
    for (var der = n - 1; der >= 1; der -= 2) {
      if (der === 6) der = 5;
      for (var vert = 0; vert < n; vert++) for (j = 0; j < 2; j++) {
        var x = der - j, arriba = ((der + 1) & 2) === 0, y = arriba ? n - 1 - vert : vert;
        if (!esFn[y][x] && idx < todo.length * 8) { mod[y][x] = bit(todo[idx >>> 3], 7 - (idx & 7)); idx++; }
      }
    }

    // 5. máscara con menor penalización
    function mascara(m) {
      for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
        var inv;
        switch (m) {
          case 0: inv = (x + y) % 2 === 0; break;
          case 1: inv = y % 2 === 0; break;
          case 2: inv = x % 3 === 0; break;
          case 3: inv = (x + y) % 3 === 0; break;
          case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: inv = x * y % 2 + x * y % 3 === 0; break;
          case 6: inv = (x * y % 2 + x * y % 3) % 2 === 0; break;
          default: inv = ((x + y) % 2 + x * y % 3) % 2 === 0;
        }
        if (!esFn[y][x] && inv) mod[y][x] = !mod[y][x];
      }
    }
    function penal() {
      var t = 0, y, x, c, run, patron;
      function linea(get) {
        var s = 0, a, i2, r, hist = [];
        for (a = 0; a < n; a++) {
          r = 1;
          for (i2 = 1; i2 < n; i2++) { if (get(a, i2) === get(a, i2 - 1)) r++; else { if (r >= 5) s += 3 + r - 5; r = 1; } }
          if (r >= 5) s += 3 + r - 5;
          hist = []; for (i2 = 0; i2 < n; i2++) hist.push(get(a, i2) ? 1 : 0);
          var str = hist.join("");
          var re1 = /10111010000/g, re2 = /00001011101/g;
          while (re1.exec(str)) { s += 40; re1.lastIndex -= 10; }
          while (re2.exec(str)) { s += 40; re2.lastIndex -= 10; }
        }
        return s;
      }
      t += linea(function (a, i2) { return mod[a][i2]; });
      t += linea(function (a, i2) { return mod[i2][a]; });
      var oscuros = 0;
      for (y = 0; y < n; y++) for (x = 0; x < n; x++) {
        c = mod[y][x]; if (c) oscuros++;
        if (x + 1 < n && y + 1 < n && c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) t += 3;
      }
      var tot = n * n, kk = Math.ceil(Math.abs(oscuros * 20 - tot * 10) / tot) - 1;
      return t + Math.max(0, kk) * 10;
    }
    var mejor = 0, minimo = Infinity;
    for (i = 0; i < 8; i++) {
      mascara(i); formato(i);
      var pn = penal();
      if (pn < minimo) { minimo = pn; mejor = i; }
      mascara(i);
    }
    mascara(mejor); formato(mejor);
    return { n: n, mod: mod, version: v };
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); }
  /** SVG del QR. opc = { px (lado en píxeles, 160), margen (módulos de margen blanco, 4), ecc ("M") }. */
  function qrSvg(texto, opc) {
    opc = opc || {};
    var q = qr(texto, opc.ecc), m = opc.margen == null ? 4 : opc.margen, tot = q.n + 2 * m, px = opc.px || 160, d = [], x, y;
    for (y = 0; y < q.n; y++) for (x = 0; x < q.n; x++) if (q.mod[y][x]) d.push("M" + (x + m) + "," + (y + m) + "h1v1h-1z");
    return "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 " + tot + " " + tot + "\" width=\"" + px + "\" height=\"" + px + "\" shape-rendering=\"crispEdges\" role=\"img\" aria-label=\"" + esc("QR " + texto) + "\">" +
      "<rect width=\"100%\" height=\"100%\" fill=\"#fff\"/><path d=\"" + d.join("") + "\" fill=\"#000\"/></svg>";
  }

  /* ============================== CODE 128 ============================== */
  var PAT128 = ["212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
    "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
    "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
    "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
    "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
    "114131", "311141", "411131", "211412", "211214", "211232", "2331112"];

  /** Valores del código (inicio + datos + control + fin). Todo dígitos y largo par (≥4) → juego C; si no, juego B (ASCII 32-126; lo demás se cambia por "?"). */
  function valores128(texto) {
    var s = String(texto == null ? "" : texto), i, v = [];
    if (/^\d{4,}$/.test(s) && s.length % 2 === 0) {
      v.push(105);
      for (i = 0; i < s.length; i += 2) v.push(parseInt(s.substr(i, 2), 10));
    } else {
      v.push(104);
      for (i = 0; i < s.length; i++) { var c = s.charCodeAt(i); v.push(c >= 32 && c <= 126 ? c - 32 : 31); }
    }
    var suma = v[0];
    for (i = 1; i < v.length; i++) suma += i * v[i];
    v.push(suma % 103); v.push(106);
    return v;
  }
  /** { ancho: módulos totales, barras: [{ x, w }] } (sin margen). */
  function code128(texto) {
    var v = valores128(texto), x = 0, barras = [];
    v.forEach(function (val) {
      var p = PAT128[val], oscuro = true;
      for (var i = 0; i < p.length; i++) {
        var w = +p.charAt(i);
        if (oscuro) barras.push({ x: x, w: w });
        x += w; oscuro = !oscuro;
      }
    });
    return { ancho: x, barras: barras };
  }
  /** SVG del código de barras. opc = { ancho (px, 220), alto (px, 60), margen (módulos, 10) }. */
  function code128Svg(texto, opc) {
    opc = opc || {};
    var c = code128(texto), m = opc.margen == null ? 10 : opc.margen, tot = c.ancho + 2 * m, alto = opc.alto || 60, anchoPx = opc.ancho || 220;
    return "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 " + tot + " " + alto + "\" width=\"" + anchoPx + "\" height=\"" + alto + "\" preserveAspectRatio=\"none\" shape-rendering=\"crispEdges\" role=\"img\" aria-label=\"" + esc("Código " + texto) + "\">" +
      "<rect width=\"100%\" height=\"100%\" fill=\"#fff\"/>" + c.barras.map(function (b) { return "<rect x=\"" + (b.x + m) + "\" y=\"0\" width=\"" + b.w + "\" height=\"" + alto + "\" fill=\"#000\"/>"; }).join("") + "</svg>";
  }

  root.PG_CODIGOS = { qr: qr, qrSvg: qrSvg, code128: code128, code128Svg: code128Svg, _valores128: valores128, _palabrasDatos: palabrasDatos, _pat128: PAT128 };
})(typeof window !== "undefined" ? window : this);
