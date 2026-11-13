/* =========================================================================
   Generador de código QR (modo byte, corrección M, versiones 1-20). ES5.
   Uso: var m = qrMatriz_('texto'); -> matriz de booleanos (true = negro)
        qrSvg_('texto', 3)  -> <svg>…</svg>
   Se usa en la representación impresa de boletas y facturas (código QR de SUNAT).
   ========================================================================= */
var QR_ECC_M_ = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26];
var QR_BLOQUES_M_ = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16];

function qrBytesUtf8_(s) {
  var out = [];
  s = String(s);
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) { c = 0x10000 + ((c - 0xD800) << 10) + (s.charCodeAt(++i) - 0xDC00); }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}
function qrModulosDatos_(ver) {
  var r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) { var na = Math.floor(ver / 7) + 2; r -= (25 * na - 10) * na - 55; if (ver >= 7) r -= 36; }
  return r;
}
function qrCapacidad_(ver) { return Math.floor(qrModulosDatos_(ver) / 8) - QR_ECC_M_[ver] * QR_BLOQUES_M_[ver]; }
function qrMult_(x, y) {
  var z = 0;
  for (var i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; }
  return z & 0xFF;
}
function qrDivisor_(grado) {
  var r = []; for (var i = 0; i < grado; i++) r.push(0); r[grado - 1] = 1;
  var raiz = 1;
  for (i = 0; i < grado; i++) {
    for (var j = 0; j < grado; j++) { r[j] = qrMult_(r[j], raiz); if (j + 1 < grado) r[j] ^= r[j + 1]; }
    raiz = qrMult_(raiz, 0x02);
  }
  return r;
}
function qrResto_(datos, divisor) {
  var r = divisor.map(function () { return 0; });
  datos.forEach(function (b) {
    var f = b ^ r.shift(); r.push(0);
    for (var i = 0; i < divisor.length; i++) r[i] ^= qrMult_(divisor[i], f);
  });
  return r;
}
function qrPosAlineacion_(ver) {
  if (ver === 1) return [];
  var n = Math.floor(ver / 7) + 2, paso = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2, r = [6];
  for (var pos = ver * 4 + 10; r.length < n; pos -= paso) r.splice(1, 0, pos);
  return r;
}

function qrMatriz_(texto) {
  var datos = qrBytesUtf8_(texto), ver;
  for (ver = 1; ver <= 20; ver++) {
    var bitsCuenta = ver <= 9 ? 8 : 16;
    if (4 + bitsCuenta + datos.length * 8 <= qrCapacidad_(ver) * 8) break;
  }
  if (ver > 20) throw new Error('Texto demasiado largo para el QR.');
  var cap = qrCapacidad_(ver), bits = [];
  function poner(v, n) { for (var i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); }
  poner(4, 4); poner(datos.length, ver <= 9 ? 8 : 16);
  datos.forEach(function (b) { poner(b, 8); });
  poner(0, Math.min(4, cap * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  var cw = [];
  for (var i = 0; i < bits.length; i += 8) { var v = 0; for (var k = 0; k < 8; k++) v = (v << 1) | bits[i + k]; cw.push(v); }
  for (var pad = 0xEC; cw.length < cap; pad ^= 0xEC ^ 0x11) cw.push(pad);

  /* bloques + corrección de errores, intercalados */
  var nb = QR_BLOQUES_M_[ver], ecl = QR_ECC_M_[ver], crudos = Math.floor(qrModulosDatos_(ver) / 8);
  var cortos = nb - crudos % nb, largoCorto = Math.floor(crudos / nb), div = qrDivisor_(ecl), bloques = [], p = 0;
  for (i = 0; i < nb; i++) {
    var dat = cw.slice(p, p + largoCorto - ecl + (i < cortos ? 0 : 1)); p += dat.length;
    var ecc = qrResto_(dat, div);
    if (i < cortos) dat.push(0);
    bloques.push(dat.concat(ecc));
  }
  var fin = [];
  for (i = 0; i < bloques[0].length; i++) for (var j = 0; j < bloques.length; j++)
    if (i !== largoCorto - ecl || j >= cortos) fin.push(bloques[j][i]);

  /* dibujo */
  var n = ver * 4 + 17, m = [], fn = [];
  for (i = 0; i < n; i++) { m.push([]); fn.push([]); for (j = 0; j < n; j++) { m[i].push(false); fn[i].push(false); } }
  function setF(x, y, d) { m[y][x] = d; fn[y][x] = true; }
  for (i = 0; i < n; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
  [[3, 3], [n - 4, 3], [3, n - 4]].forEach(function (c) {
    for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
      var d = Math.max(Math.abs(dx), Math.abs(dy)), xx = c[0] + dx, yy = c[1] + dy;
      if (xx >= 0 && xx < n && yy >= 0 && yy < n) setF(xx, yy, d !== 2 && d !== 4);
    }
  });
  var al = qrPosAlineacion_(ver), na = al.length;
  for (i = 0; i < na; i++) for (j = 0; j < na; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
    for (var ay = -2; ay <= 2; ay++) for (var ax = -2; ax <= 2; ax++) setF(al[i] + ax, al[j] + ay, Math.max(Math.abs(ax), Math.abs(ay)) !== 1);
  }
  function formato(mask) {
    var d = (0 << 3) | mask, r = d; // nivel M = 0
    for (var t = 0; t < 10; t++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    var b = ((d << 10) | r) ^ 0x5412;
    function bit(k) { return ((b >>> k) & 1) !== 0; }
    for (var q = 0; q <= 5; q++) setF(8, q, bit(q));
    setF(8, 7, bit(6)); setF(8, 8, bit(7)); setF(7, 8, bit(8));
    for (q = 9; q < 15; q++) setF(14 - q, 8, bit(q));
    for (q = 0; q < 8; q++) setF(n - 1 - q, 8, bit(q));
    for (q = 8; q < 15; q++) setF(8, n - 15 + q, bit(q));
    setF(8, n - 8, true);
  }
  formato(0);
  if (ver >= 7) {
    var rv = ver;
    for (i = 0; i < 12; i++) rv = (rv << 1) ^ ((rv >>> 11) * 0x1F25);
    var vb = (ver << 12) | rv;
    for (i = 0; i < 18; i++) { var bt = ((vb >>> i) & 1) !== 0, a = n - 11 + i % 3, b2 = Math.floor(i / 3); setF(a, b2, bt); setF(b2, a, bt); }
  }
  /* datos en zigzag */
  var idx = 0;
  for (var der = n - 1; der >= 1; der -= 2) {
    if (der === 6) der = 5;
    for (var vert = 0; vert < n; vert++) for (j = 0; j < 2; j++) {
      var x = der - j, arriba = ((der + 1) & 2) === 0, y = arriba ? n - 1 - vert : vert;
      if (!fn[y][x] && idx < fin.length * 8) { m[y][x] = ((fin[idx >>> 3] >>> (7 - (idx & 7))) & 1) !== 0; idx++; }
    }
  }
  /* máscara con menor penalización */
  function aplicar(mask) {
    for (var yy = 0; yy < n; yy++) for (var xx = 0; xx < n; xx++) {
      if (fn[yy][xx]) continue;
      var inv;
      switch (mask) {
        case 0: inv = (xx + yy) % 2 === 0; break;
        case 1: inv = yy % 2 === 0; break;
        case 2: inv = xx % 3 === 0; break;
        case 3: inv = (xx + yy) % 3 === 0; break;
        case 4: inv = (Math.floor(xx / 3) + Math.floor(yy / 2)) % 2 === 0; break;
        case 5: inv = xx * yy % 2 + xx * yy % 3 === 0; break;
        case 6: inv = (xx * yy % 2 + xx * yy % 3) % 2 === 0; break;
        default: inv = ((xx + yy) % 2 + xx * yy % 3) % 2 === 0;
      }
      if (inv) m[yy][xx] = !m[yy][xx];
    }
  }
  function penal() {
    var s = 0, oscuros = 0, yy, xx, run, c;
    for (yy = 0; yy < n; yy++) { run = 1; for (xx = 1; xx < n; xx++) { if (m[yy][xx] === m[yy][xx - 1]) { run++; if (run === 5) s += 3; else if (run > 5) s++; } else run = 1; } }
    for (xx = 0; xx < n; xx++) { run = 1; for (yy = 1; yy < n; yy++) { if (m[yy][xx] === m[yy - 1][xx]) { run++; if (run === 5) s += 3; else if (run > 5) s++; } else run = 1; } }
    for (yy = 0; yy < n - 1; yy++) for (xx = 0; xx < n - 1; xx++) { c = m[yy][xx]; if (c === m[yy][xx + 1] && c === m[yy + 1][xx] && c === m[yy + 1][xx + 1]) s += 3; }
    for (yy = 0; yy < n; yy++) for (xx = 0; xx < n; xx++) if (m[yy][xx]) oscuros++;
    s += Math.floor(Math.abs(oscuros * 20 - n * n * 10) / (n * n)) * 10;
    return s;
  }
  var mejor = 0, mejorP = Infinity;
  for (var mk = 0; mk < 8; mk++) { aplicar(mk); formato(mk); var pp = penal(); if (pp < mejorP) { mejorP = pp; mejor = mk; } aplicar(mk); }
  aplicar(mejor); formato(mejor);
  return m;
}

function qrSvg_(texto, tam) {
  var m = qrMatriz_(texto), n = m.length, borde = 4, t = tam || 3, d = '';
  for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (m[y][x]) d += 'M' + (x + borde) + ' ' + (y + borde) + 'h1v1h-1z';
  var lado = (n + borde * 2);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + lado * t + '" height="' + lado * t + '" viewBox="0 0 ' + lado + ' ' + lado +
    '" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
}

/* QR como tabla HTML (para convertir a PDF, donde el SVG no siempre se dibuja) */
function qrTabla_(texto, px) {
  var m = qrMatriz_(texto), n = m.length, b = 4, t = px || 3, h = [];
  h.push('<table style="border-collapse:collapse;margin:0 auto;background:#fff" cellpadding="0" cellspacing="0">');
  for (var y = -b; y < n + b; y++) {
    h.push('<tr>');
    for (var x = -b; x < n + b; x++) {
      var negro = y >= 0 && y < n && x >= 0 && x < n && m[y][x];
      h.push('<td style="width:' + t + 'px;height:' + t + 'px;padding:0;background:' + (negro ? '#000' : '#fff') + '"></td>');
    }
    h.push('</tr>');
  }
  h.push('</table>');
  return h.join('');
}
