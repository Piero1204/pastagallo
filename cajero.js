/* Pasta Gallo · caja / mostrador (rol "cajero" del personal). La carga mozo.js cuando el equipo vinculado tiene rol cajero.
   Expone window.PG_APP_CAJERO.iniciar(ctx), con ctx = { api, token, mozo, contenedor, h, toast, salir, cfg }.
   - Misma interfaz que el mozo: categorías, buscador por nombre, grilla de productos con foto y carrito. Solo productos de tienda que no pasan por cocina
     (secciones tienda, italia, dolci, caffetteria, caffe, vini, aperitivi). Sin QR, SKU ni código de barras en pantalla (la lógica de L.* se conserva, sin uso en la interfaz).
   - Productos por peso (kg, g, lt): se escribe el peso y se calcula. Carrito, descuento con motivo, pago mixto con vuelto.
   - Recibo para imprimir o compartir, historial del día (con anulación), entregas por recoger y cierre simple del día.
   El servidor recalcula TODO (precios, descuentos, pagos); lo que se ve aquí es solo una vista previa.
   Las funciones puras viven en PG_CAJERO_LIB (se prueban aparte). */
(function (root) {
  "use strict";

  /* =========================== LÓGICA PURA =========================== */
  var L = {};
  L.r2 = function (n) { return Math.round(Number(n) * 100) / 100; };
  L.soles = function (n) { return "S/ " + L.r2(n || 0).toFixed(2); };
  L.norm = function (s) { return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim(); };
  L.sinCeros = function (s) { return String(s || "").replace(/^0+(?=.)/, ""); };

  /** Busca por nombre (todas las palabras), SKU o código de barras (exacto o por prefijo). Los exactos van primero. */
  L.buscar = function (lista, q, max) {
    var n = L.norm(q);
    if (!n) return (lista || []).slice(0, max || 80);
    var palabras = n.split(" "), digitos = /^\d+$/.test(n) ? L.sinCeros(n) : "", exactos = [], resto = [];
    (lista || []).forEach(function (p) {
      var sku = L.norm(p.sku), bar = L.sinCeros(p.barras || "");
      if ((sku && sku === n) || (digitos && bar && bar === digitos)) { exactos.push(p); return; }
      var txt = L.norm(p.nombre) + " " + sku + " " + (p.barras || "");
      if (palabras.every(function (w) { return txt.indexOf(w) >= 0; })) resto.push(p);
    });
    return exactos.concat(resto).slice(0, max || 80);
  };
  /** Producto cuyo SKU o código de barras es EXACTAMENTE lo escaneado (sin importar ceros a la izquierda en los códigos numéricos). */
  L.porCodigo = function (lista, codigo) {
    var c = String(codigo || "").replace(/\s+/g, ""), n = L.norm(c);
    if (!n) return null;
    var num = /^\d+$/.test(c) ? L.sinCeros(c) : "";
    for (var i = 0; i < (lista || []).length; i++) {
      var p = lista[i];
      if (p.sku && L.norm(p.sku) === n) return p;
      if (p.id && L.norm(p.id) === n) return p;   // código interno de etiqueta cuando el producto no tiene SKU ni barras
      if (num && p.barras && L.sinCeros(p.barras) === num) return p;
      if (!num && p.barras && L.norm(p.barras) === n) return p;
    }
    return null;
  };

  /** Texto de cantidad → cantidad en la unidad del producto. "350 g" en un producto en kg da 0.35. Devuelve null si no es válido.
      entrada = unidad elegida en pantalla (si el texto no trae su propia unidad). */
  L.parsearCantidad = function (txt, unidad, entrada) {
    var m = String(txt == null ? "" : txt).trim().toLowerCase().replace(",", ".").match(/^(\d*\.?\d+)\s*(kg|kilos?|g|gr|gramos?|lt|l|litros?|ml)?$/);
    if (!m) return null;
    var v = parseFloat(m[1]), u = m[2] || entrada || unidad;
    if (/^(kilos?)$/.test(u)) u = "kg";
    if (/^(gr|gramos?)$/.test(u)) u = "g";
    if (/^(l|litros?)$/.test(u)) u = "lt";
    if (!isFinite(v) || !(v > 0)) return null;
    var k = { kg: { kg: 1, g: 0.001 }, g: { g: 1, kg: 1000 }, lt: { lt: 1, ml: 0.001 }, unid: { unid: 1 } }[unidad];
    if (!k || k[u] == null) return null;
    v = v * k[u];
    v = unidad === "unid" ? Math.round(v) : unidad === "g" ? Math.round(v * 10) / 10 : Math.round(v * 1000) / 1000;
    return v > 0 ? v : null;
  };
  L.fmtCant = function (cant, unidad) {
    cant = Number(cant) || 0;
    if (unidad === "kg" && cant < 1) return Math.round(cant * 1000) + " g";
    if (unidad === "lt" && cant < 1) return Math.round(cant * 1000) + " ml";
    if (unidad === "unid") return String(cant);
    return String(Math.round(cant * 1000) / 1000).replace(".", ",") + " " + unidad;
  };
  L.subtotal = function (unit, cant) { return L.r2(Number(unit) * Number(cant)); };
  L.totalCarro = function (carro) { return L.r2((carro || []).reduce(function (a, l) { return a + L.subtotal(l.unit, l.cant); }, 0)); };

  /** Descuento (misma cuenta que el servidor). tipo: desc_pct | desc_monto | precio_final. Devuelve { ok, total, desc, error }. */
  L.descuento = function (sub, tipo, valor, maxPct) {
    sub = Number(sub) || 0;
    if (!tipo) return { ok: true, total: L.r2(sub), desc: 0 };
    var v = Number(String(valor).replace(",", "."));
    if (String(valor == null ? "" : valor).trim() === "" || !isFinite(v) || v < 0) return { ok: false, error: "Escribe el valor del descuento.", total: L.r2(sub), desc: 0 };
    var f;
    if (tipo === "desc_pct") { if (v <= 0 || v > 100) return { ok: false, error: "El porcentaje va de 1 a 100.", total: L.r2(sub), desc: 0 }; f = sub * (1 - v / 100); }
    else if (tipo === "desc_monto") { if (v <= 0 || v > sub) return { ok: false, error: "El descuento no puede pasar del total.", total: L.r2(sub), desc: 0 }; f = sub - v; }
    else if (tipo === "precio_final") { if (v > sub) return { ok: false, error: "El precio final no puede ser mayor que el total.", total: L.r2(sub), desc: 0 }; f = v; }
    else return { ok: false, error: "Tipo de descuento no válido.", total: L.r2(sub), desc: 0 };
    f = L.r2(f);
    var d = L.r2(sub - f);
    if (!(f > 0)) return { ok: false, error: "El total no puede quedar en cero.", total: L.r2(sub), desc: 0 };
    if (maxPct != null && sub > 0 && d / sub * 100 > maxPct + 0.0001) return { ok: false, error: "El descuento pasa del máximo permitido (" + maxPct + " %).", total: L.r2(sub), desc: 0 };
    return { ok: true, total: f, desc: d };
  };

  /** Pago mixto. pagos = { Efectivo: n, Yape: n, Plin: n, Tarjeta: n } (en efectivo va lo que entrega el cliente).
      Lo que no es efectivo debe ser exacto; el efectivo puede pasar y se da vuelto. */
  L.cobro = function (total, pagos) {
    total = L.r2(total);
    var ef = L.r2(Number(pagos.Efectivo) || 0), noEf = 0;
    Object.keys(pagos).forEach(function (k) { if (k !== "Efectivo") noEf += Number(pagos[k]) || 0; });
    noEf = L.r2(noEf);
    var resto = L.r2(total - noEf);
    var r = { total: total, noEfectivo: noEf, efectivo: ef, resto: Math.max(0, resto), falta: 0, vuelto: 0, ok: false, error: "" };
    if (resto < -0.004) { r.error = "Yape, Plin y tarjeta suman más que el total."; return r; }
    if (resto > 0.004) {
      if (ef < resto - 0.004) { r.falta = L.r2(resto - ef); r.error = "Falta cobrar " + L.soles(r.falta) + "."; return r; }
      r.vuelto = L.r2(ef - resto); r.ok = true; return r;
    }
    if (ef > 0) { r.error = "El total ya está cubierto sin efectivo."; return r; }
    r.ok = true; return r;
  };

  /** Kilos de una línea de venta: por kg o g directo; por presentación ("1 kg", "1/2 kg", "1/4 kg", "250 g") × cantidad. Si no se sabe, 0. */
  L.kilosDe = function (l) {
    var c = Number(l.cant) || 0;
    if (l.unidad === "kg") return L.r2(c * 1000) / 1000;
    if (l.unidad === "g") return L.r2(c) / 1000;
    var m = String(l.tam || "").toLowerCase().replace(",", ".").match(/^(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+))?\s*(kg|g|gr)\b/);
    if (!m) return 0;
    var v = parseFloat(m[1]); if (m[2]) v = v / parseFloat(m[2]);
    if (m[3] !== "kg") v = v / 1000;
    return Math.round(v * c * 1000) / 1000;
  };
  /** Código interno que lleva la etiqueta de un producto: SKU, si no código de barras, si no su id. */
  L.codigoInterno = function (p) { return String(p.sku || p.barras || p.id || ""); };
  /** Orden de la tienda: primero lo de la sección tienda, luego lo que no depende de cocina, al final el resto. */
  var SIN_COCINA = ["dolci", "italia", "caffetteria", "caffe", "vini", "aperitivi"];
  L.prioridad = function (seccion) { return seccion === "tienda" ? 0 : SIN_COCINA.indexOf(seccion) >= 0 ? 1 : 2; };

  L.nuevoCid = function () {
    var a = "abcdefghijklmnopqrstuvwxyz0123456789", s = "v", i;
    try { var b = new Uint8Array(14); root.crypto.getRandomValues(b); for (i = 0; i < b.length; i++) s += a.charAt(b[i] % a.length); }
    catch (e) { for (i = 0; i < 14; i++) s += a.charAt(Math.floor(Math.random() * a.length)); }
    return s + Date.now().toString(36);
  };

  /** Detector de lector USB: un lector "teclea" muy rápido y termina con Enter. feed(tecla, ms) devuelve el código cuando lo completa. */
  L.escaner = function (opc) {
    var gap = (opc && opc.gap) || 60, min = (opc && opc.min) || 3, buf = "", rapido = true, ultimo = 0;
    return {
      feed: function (tecla, t) {
        if (tecla === "Enter") { var c = buf, ok = c.length >= min && rapido; buf = ""; rapido = true; ultimo = 0; return ok ? c : null; }
        if (!tecla || tecla.length !== 1) return null;
        if (buf && t - ultimo > 300) { buf = ""; rapido = true; }
        if (buf && t - ultimo > gap) rapido = false;
        buf += tecla; ultimo = t;
        return null;
      },
      reset: function () { buf = ""; rapido = true; ultimo = 0; }
    };
  };

  /** Fecha de Lima (UTC-5, sin horario de verano) a partir de milisegundos. */
  L.fechaLima = function (ms) {
    var d = new Date(Number(ms) - 5 * 3600000), p = function (n) { return ("0" + n).slice(-2); };
    return p(d.getUTCDate()) + "/" + p(d.getUTCMonth() + 1) + "/" + d.getUTCFullYear() + " " + p(d.getUTCHours()) + ":" + p(d.getUTCMinutes());
  };
  L.textoRecibo = function (v, neg) {
    neg = neg || {};
    var lin = [], raya = "------------------------------";
    lin.push(String(neg.nombre || "Pasta Gallo").toUpperCase());
    if (neg.direccion) lin.push(neg.direccion);
    if (neg.telefono) lin.push("Tel. " + neg.telefono);
    lin.push(raya, "Venta " + v.id, L.fechaLima(v.fecha) + (v.cajero ? " · " + v.cajero : ""));
    if (v.cliente) lin.push("Cliente: " + [v.cliente.nombre, v.cliente.empresa, v.cliente.celular].filter(Boolean).join(" · "));
    lin.push(raya);
    (v.lineas || []).forEach(function (l) {
      lin.push(l.nombre + (l.tam ? " (" + l.tam + ")" : ""));
      lin.push("   " + L.fmtCant(l.cant, l.unidad) + " x " + L.soles(l.unit) + (l.unidad !== "unid" ? "/" + l.unidad : "") + " = " + L.soles(l.subtotal));
    });
    lin.push(raya);
    if (v.descuento > 0) { lin.push("Subtotal: " + L.soles(v.subtotal), "Descuento: -" + L.soles(v.descuento) + (v.motivo ? " (" + v.motivo + ")" : "")); }
    lin.push("TOTAL: " + L.soles(v.total));
    (v.pagos || []).forEach(function (p) { lin.push(p.metodo + ": " + L.soles(p.monto)); });
    if (v.vuelto > 0) lin.push("Recibido: " + L.soles(v.recibido), "Vuelto: " + L.soles(v.vuelto));
    if (v.estado === "Anulada") lin.push("*** VENTA ANULADA ***");
    lin.push(raya, "Comprobante de venta interno.", "No es boleta ni factura electrónica.", "¡Grazie!");
    return lin.join("\n");
  };

  root.PG_CAJERO_LIB = L;
  root.PG_APP_CAJERO = { iniciar: function (ctx) { iniciar(ctx); }, _lib: L };

  /* =========================== APP (navegador) =========================== */
  function iniciar(ctx) {
    var doc = root.document, app = ctx.contenedor, api = ctx.api, TOKEN = ctx.token;
    var K = "pg-cajero-carro";
    function h(tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
    function btn(txt, cls, fn) { var b = h("button", cls, txt); b.type = "button"; if (fn) b.addEventListener("click", fn); return b; }
    function leer(k, d) { try { var v = JSON.parse(root.localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
    function guardar(k, v) { try { root.localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
    var tT;
    function toast(t, tipo) {
      var x = doc.querySelector(".toast") || doc.body.appendChild(h("div", "toast"));
      x.textContent = t; x.className = "toast on" + (tipo ? " " + tipo : "");
      clearTimeout(tT); tT = setTimeout(function () { x.className = "toast"; }, tipo === "mal" ? 6000 : 2400);
    }
    function pitar() { try { if (root.navigator.vibrate) root.navigator.vibrate(120); } catch (e) {} }
    /* Modo RESTRINGIDO (panel de la computadora del local, rol local): solo "Vender"; sin totales de caja, cierre, anulaciones, efectivo
       ni etiquetas; la venta pasa por ctx.llamarTienda (mz l_tienda, que el servidor limita a productos y venta). */
    var RESTR = !!ctx.restringido;
    function llamar(o) { o.ext = "tienda"; o.t = TOKEN; return ctx.llamarTienda ? ctx.llamarTienda(o) : api(o); }

    var S = { prods: [], metodos: ["Efectivo", "Yape", "Plin", "Tarjeta"], descMax: null, anularCajero: true, negocio: {}, q: "", vista: "vender",
      carro: leer(K, []), cliente: leer("pg-cajero-cliente", null), cat: "", clientes: null, pend: null, recoger: [], enCocina: 0, hist: null, cargado: false, error: "" };
    function guardarCarro() { guardar(K, S.carro); }

    /* ---------- estilos ---------- */
    if (!doc.getElementById("cj-css")) {
      var st = h("style"); st.id = "cj-css";
      st.textContent = [
        ".cj,.cj-vel{--vino:#4b5a24;--vino-2:#5d6e2c;--rojo:#7c6a1f;--oro:#8a8a3a;--oro-claro:#b5b86a;--verde:#3f6b2b}",
        ".cj{min-height:100vh;min-height:100dvh;background:var(--crema,#efe6d3);color:var(--tinta,#2a1b17);padding-bottom:calc(210px + env(safe-area-inset-bottom))}",
        ".cj-top{position:sticky;top:0;z-index:20;background:var(--vino,#4a1519);color:var(--crema,#efe6d3);display:flex;align-items:center;gap:8px;padding:8px 10px;padding-top:calc(8px + env(safe-area-inset-top))}",
        ".cj-top b{flex:1;font-size:17px}.cj-top button{background:rgba(255,255,255,.14);border-radius:10px;padding:0 12px;height:42px;font-weight:700;color:inherit}",
        ".cj-tabs{display:flex;gap:6px;padding:8px 10px;background:var(--crema-2,#e6dac0)}.cj-tabs button{flex:1;height:46px;border-radius:10px;background:#fff;font-weight:800;border:2px solid transparent}",
        ".cj-tabs button.on{background:var(--vino,#4a1519);color:#fff}.cj-n{display:inline-block;min-width:20px;padding:0 6px;margin-left:4px;border-radius:10px;background:var(--vino-2,#5d6e2c);color:#fff;font-size:12px;line-height:20px}",
        ".cj-body{padding:10px;max-width:1100px;margin:0 auto}",
        ".cj-carta{display:grid;grid-template-columns:170px 1fr;gap:10px;align-items:start}.cj-carta:has(.cj-cats:empty),.cj-carta:not(:has(.cj-cats)){grid-template-columns:1fr}",
        ".cj-cats{position:sticky;top:8px;background:var(--papel,#faf6ec);border:1px solid var(--linea,#dccdb0);border-radius:12px;padding:6px;display:flex;flex-direction:column;gap:2px;max-height:70vh;overflow-y:auto}",
        ".cj-cats button{text-align:left;padding:12px;border-radius:10px;font-weight:700;font-size:15px}.cj-cats button.on{background:var(--vino,#4b5a24);color:#fff}",
        ".cj-prods .prod.sin .ft{background-color:var(--crema-2,#e6dac0)}",
        "@media(max-width:859px){.cj-carta{grid-template-columns:1fr}.cj-cats{position:sticky;top:0;z-index:5;flex-direction:row;overflow-x:auto;overflow-y:hidden;max-height:none;padding:8px;border-radius:0;margin:0 -10px 10px;border-left:0;border-right:0;scrollbar-width:none}.cj-cats button{flex:none;white-space:nowrap;background:#fff;border:1px solid var(--linea,#dccdb0);padding:10px 14px}.cj-cats button.on{border-color:var(--vino,#4b5a24)}}",
        ".cj-bus{display:flex;gap:8px;margin-bottom:10px}.cj-bus input{flex:1;height:50px;border-radius:12px;border:2px solid var(--linea,#dccdb0);padding:0 14px;font-size:17px;background:#fff}",
        ".cj-bus input:focus{outline:3px solid var(--oro-claro,#c9a45c)}.cj-bus button{width:54px;height:50px;border-radius:12px;background:var(--oro,#a9803f);color:#fff;font-size:22px}",
        ".cj-hint{font-size:13px;color:var(--gris,#6f5f57);margin:-4px 0 10px}",
        ".cj-cart{position:fixed;left:0;right:0;bottom:0;z-index:25;background:#fff;border-top:3px solid var(--oro,#a9803f);padding:8px 10px calc(10px + env(safe-area-inset-bottom));box-shadow:0 -6px 20px rgba(0,0,0,.15)}",
        ".cj-lineas{max-height:30vh;overflow:auto;margin-bottom:6px}",
        ".cj-l{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f1e8d6}.cj-l .t{flex:1;min-width:0}.cj-l .t b{display:block;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
        ".cj-l .t span{font-size:12px;color:var(--gris,#6f5f57)}.cj-l .s{font-weight:800;min-width:70px;text-align:right}",
        ".cj-l button{width:38px;height:38px;border-radius:9px;background:var(--crema,#efe6d3);font-weight:800;font-size:18px}.cj-l button.peso{width:auto;padding:0 10px;font-size:14px}",
        ".cj-tot{display:flex;align-items:center;gap:10px}.cj-tot .m{flex:1;font:800 24px var(--sans,sans-serif)}.cj-tot .m small{display:block;font-size:12px;font-weight:600;color:var(--gris,#6f5f57)}",
        ".cj-go{height:54px;padding:0 26px;border-radius:12px;background:var(--verde,#2f7a3a);color:#fff;font-weight:800;font-size:18px}.cj-go:disabled{opacity:.4}",
        ".cj-sec{background:#fff;border:1px solid var(--linea,#dccdb0);border-radius:12px;padding:12px;margin-bottom:10px}.cj-sec h3{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--gris,#6f5f57);margin-bottom:8px}",
        ".cj-kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-bottom:10px}.cj-kpi{background:#fff;border:1px solid var(--linea,#dccdb0);border-radius:12px;padding:10px}",
        ".cj-kpi span{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--gris,#6f5f57);font-weight:700}.cj-kpi b{font-size:20px}",
        ".cj-row{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid var(--linea,#dccdb0);border-radius:12px;padding:10px;margin-bottom:6px;width:100%;text-align:left}",
        ".cj-row .t{flex:1;min-width:0}.cj-row .t span{display:block;font-size:12px;color:var(--gris,#6f5f57)}.cj-row.anulada{opacity:.55}.cj-row.anulada b{text-decoration:line-through}",
        ".cj-del{width:100%;height:48px;border-radius:12px;background:var(--rojo,#b6232a);color:#fff;font-weight:800;margin-top:6px}",
        ".cj-vacio{padding:30px;text-align:center;color:var(--gris,#6f5f57);font-style:italic}",
        ".cj-vel{position:fixed;inset:0;z-index:50;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center}",
        ".cj-hoja{background:var(--papel,#faf6ec);width:100%;max-width:560px;max-height:92vh;overflow:auto;border-radius:18px 18px 0 0;padding:14px 14px calc(16px + env(safe-area-inset-bottom))}",
        "@media(min-width:700px){.cj-vel{align-items:center}.cj-hoja{border-radius:18px}}",
        ".cj-hoja h2{font-size:19px;color:var(--vino,#4a1519);margin-bottom:10px}.cj-hoja label{display:block;font-size:13px;font-weight:700;margin:8px 0 4px}",
        ".cj-hoja input,.cj-hoja select{width:100%;height:48px;border-radius:10px;border:2px solid var(--linea,#dccdb0);padding:0 12px;font-size:17px;background:#fff}",
        ".cj-acc{display:flex;gap:8px;margin-top:12px}.cj-acc button{flex:1;height:50px;border-radius:12px;font-weight:800;font-size:16px;background:var(--crema-2,#e6dac0)}",
        ".cj-acc .ok{background:var(--verde,#2f7a3a);color:#fff}.cj-acc .mal{background:var(--rojo,#b6232a);color:#fff}.cj-acc button:disabled{opacity:.4}",
        ".cj-pstep{display:flex;align-items:center;justify-content:center;gap:12px;margin:10px 0}.cj-pstep button{width:56px;height:56px;border-radius:14px;background:#fff;border:2px solid var(--linea,#dccdb0);font-size:26px;font-weight:800}.cj-pstep output{min-width:96px;text-align:center;font-size:24px;font-weight:800}",
        ".cj-pinfo{text-align:center;font-weight:700;margin:4px 0}.cj-pnota{display:block;text-align:center;font-size:12px;color:var(--gris,#6f5f57);margin:2px 0 6px}.cj-l .t small{display:block;font-size:11px;color:var(--gris,#6f5f57)}",
        ".cj-chips{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}.cj-chips button{height:44px;padding:0 16px;border-radius:999px;background:#fff;border:2px solid var(--linea,#dccdb0);font-weight:700}.cj-chips button.on{background:var(--vino,#4a1519);color:#fff;border-color:var(--vino,#4a1519)}",
        ".cj-pago{display:flex;align-items:center;gap:8px;margin-bottom:6px}.cj-pago span{width:78px;font-weight:700}.cj-pago input{flex:1}.cj-pago button{height:48px;padding:0 12px;border-radius:10px;background:var(--crema-2,#e6dac0);font-weight:700}",
        ".cj-res{padding:10px;border-radius:10px;font-weight:800;text-align:center;margin-top:8px;background:#fff;border:2px solid var(--linea,#dccdb0)}.cj-res.ok{border-color:var(--verde,#2f7a3a);color:var(--verde,#2f7a3a)}.cj-res.mal{border-color:var(--rojo,#b6232a);color:var(--rojo,#b6232a)}",
        ".cj-err{color:var(--rojo,#b6232a);font-weight:700;min-height:20px;margin-top:6px}",
        ".cj-rec{font:13px/1.35 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;background:#fff;border:1px dashed var(--gris,#6f5f57);border-radius:8px;padding:12px;margin-bottom:6px;-webkit-user-select:text;user-select:text}",
        ".cj-video{width:100%;max-height:50vh;background:#000;border-radius:12px}",
        ".cj-cli{height:40px;padding:0 12px;border-radius:10px;background:var(--crema-2,#e6dac0);font-weight:700;max-width:46%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
        ".cj-chk{display:flex;align-items:center;gap:8px;padding:8px;background:#fff;border:1px solid var(--linea,#dccdb0);border-radius:10px;margin-bottom:6px}.cj-chk input[type=checkbox]{width:24px;height:24px;flex:none}.cj-chk .t{flex:1;min-width:0}.cj-chk input[type=number]{width:64px;height:40px;flex:none}",
        "@media(min-width:1000px){.cj.vende{padding-right:400px;padding-bottom:0}.cj.vende .cj-cart{left:auto;width:400px;top:62px;border-top:0;border-left:3px solid var(--oro,#a9803f);display:flex;flex-direction:column;padding-bottom:12px}.cj.vende .cj-lineas{max-height:none;flex:1}.cj-body{max-width:none}.cj-prods{grid-template-columns:repeat(auto-fill,minmax(190px,1fr))}}",
        "#cj-print{display:none}",
        "@media print{body>*{display:none!important}body>#cj-print{display:block!important;font:12px/1.3 monospace;white-space:pre-wrap;width:72mm;margin:0;color:#000}@page{margin:4mm}}"
      ].join("\n");
      doc.head.appendChild(st);
    }

    /* ---------- hojas inferiores (un solo nivel) ---------- */
    var hojaAct = null, onCerrar = null;
    function cerrarHoja() { if (hojaAct) { hojaAct.remove(); hojaAct = null; } if (onCerrar) { var f = onCerrar; onCerrar = null; f(); } }
    function abrirHoja(titulo, nodos, botones, alCerrar) {
      cerrarHoja();
      var v = h("div", "cj-vel"), c = h("div", "cj-hoja");
      v.addEventListener("click", function (e) { if (e.target === v) cerrarHoja(); });
      c.setAttribute("role", "dialog"); c.setAttribute("aria-label", titulo);
      c.appendChild(h("h2", "", titulo));
      nodos.forEach(function (n) { c.appendChild(n); });
      if (botones && botones.length) { var a = h("div", "cj-acc"); botones.forEach(function (b) { a.appendChild(b); }); c.appendChild(a); }
      v.appendChild(c); doc.body.appendChild(v); hojaAct = v; onCerrar = alCerrar || null;
      return c;
    }
    function campo(etq, input) { var d = h("div"); d.appendChild(h("label", "", etq)); d.appendChild(input); return d; }
    function entrada(tipo, ph) { var i = h("input"); i.type = tipo || "text"; if (ph) i.placeholder = ph; return i; }

    /* ---------- carga de datos ---------- */
    /* Solo productos de tienda que NO pasan por cocina. El servidor no manda un campo "cocina": se usa la sección del producto
       (tienda, italia, dolci, bebidas = caffetteria/caffe/vini/aperitivi → L.prioridad < 2). Pasta, pizza, parrillas, etc. quedan fuera. */
    function sinCocina(p) { return L.prioridad(p.seccion) < 2; }
    function cargar() {
      return llamar({ op: "productos" }).then(function (r) {
        if (!r.ok) { S.error = r.error || "No se pudo cargar."; return; }
        S.prods = (r.productos || []).filter(sinCocina); S.metodos = r.metodos || S.metodos; S.descMax = r.descuentoMax; S.anularCajero = r.anularCajero !== false;
        S.negocio = r.negocio || {}; S.cargado = true; S.error = "";
      }).catch(function (e) { S.error = "Sin conexión. " + (e && e.message ? e.message : ""); });
    }
    function cargarRecoger() {
      return llamar({ op: "recoger" }).then(function (r) { if (r.ok) { S.recoger = r.pedidos || []; S.enCocina = r.enCocina || 0; pintarTabs(); } }).catch(function () {});
    }
    function cargarHist() {
      return llamar({ op: "historial" }).then(function (r) { if (r.ok) S.hist = r; else toast(r.error || "No se pudo cargar.", "mal"); }).catch(function () { toast("Sin conexión.", "mal"); });
    }

    /* ---------- estructura ---------- */
    var raiz = h("div", "cj"), top = h("div", "cj-top"), tabs = h("div", "cj-tabs"), cuerpo = h("div", "cj-body"), carrito = h("div", "cj-cart");
    app.innerHTML = "";
    top.appendChild(h("b", "", "Caja · " + (ctx.mozo && ctx.mozo.nombre || "")));
    var bInst = btn("⬇ Instalar", "", function () {
      if (ctx.instalar && ctx.instalar.disponible()) ctx.instalar.pedir().then(function () { pintarInstalar(); });
      else toast("En iPhone/iPad: Compartir (□↑) → “Agregar a inicio”. En Chrome o Edge: menú ⋮ → “Instalar PG Tienda”.", "ok");
    });
    function pintarInstalar() { var inst = ctx.instalar || {}; bInst.style.display = inst.instalada || (!inst.disponible() && !inst.ios) ? "none" : ""; }
    pintarInstalar(); doc.addEventListener("pg-instalable", pintarInstalar);
    top.appendChild(bInst);
    top.appendChild(btn("Salir", "", function () { if (S.carro.length && !root.confirm("Hay una venta sin cobrar. ¿Salir igual?")) return; ctx.salir(); }));
    if (!RESTR) raiz.appendChild(top);
    var mapaHost = h("div"); raiz.appendChild(mapaHost);
    if (ctx.mapaSalon && !RESTR) ctx.mapaSalon(mapaHost, { onMesa: verMesa });   // mapa del salón desplegable (solo mira; el cobro de mesas lo hace el mozo)
    raiz.appendChild(tabs); raiz.appendChild(cuerpo); raiz.appendChild(carrito); app.appendChild(raiz);

    function pintarTabs() {
      tabs.innerHTML = "";
      raiz.className = "cj" + (S.vista === "vender" ? " vende" : "") + (RESTR ? " restr" : "");
      if (RESTR) { S.vista = "vender"; tabs.style.display = "none"; return; }
      [["vender", "Vender"], ["recoger", "Por recoger"], ["hoy", "Hoy"], ["clientes", "Clientes"]].forEach(function (t) {
        var b = btn(t[1], t[0] === S.vista ? "on" : "", function () { S.vista = t[0]; pintar(); if (t[0] === "hoy") cargarHist().then(pintar); if (t[0] === "recoger") cargarRecoger().then(pintar); if (t[0] === "clientes") cargarClientes().then(pintar); });
        if (t[0] === "recoger" && S.recoger.length) b.appendChild(h("span", "cj-n", String(S.recoger.length)));
        tabs.appendChild(b);
      });
    }
    function pintar() {
      pintarTabs(); cuerpo.innerHTML = "";
      carrito.style.display = S.vista === "vender" ? "" : "none";
      if (S.error && !S.cargado) {
        cuerpo.appendChild(h("p", "cj-vacio", S.error));
        cuerpo.appendChild(btn("Reintentar", "cj-go", function () { cargar().then(pintar); }));
        return;
      }
      if (S.vista === "vender") { pintarVender(); pintarCarrito(); }
      else if (S.vista === "recoger") pintarRecoger();
      else if (S.vista === "clientes") pintarClientes();
      else pintarHoy();
    }

    /* ---------- vender: búsqueda y productos ---------- */
    var inBus = null, zonaProds = null;
    function pintarVender() {
      var f = h("div", "cj-bus");
      inBus = entrada("search", "Buscar producto");
      inBus.value = S.q; inBus.setAttribute("autocomplete", "off"); inBus.setAttribute("aria-label", "Buscar producto");
      inBus.addEventListener("input", function () { S.q = inBus.value; pintarProds(); });
      f.appendChild(inBus);
      cuerpo.appendChild(f);
      if (!S.prods.length) cuerpo.appendChild(h("p", "cj-vacio", "Todavía no hay productos de tienda sin cocina. El administrador debe marcarlos en el panel (Tienda > Catálogo)."));
      var cats = h("nav", "cj-cats"), secs = {}, wrap = h("div", "cj-carta");
      S.prods.forEach(function (p) { secs[p.seccion || ""] = 1; });
      var orden = Object.keys(secs).sort(function (a, b) { return L.prioridad(a) - L.prioridad(b) || (tituloSec(a) < tituloSec(b) ? -1 : 1); });
      if (orden.length > 1) {
        [""].concat(orden).forEach(function (k) {
          var b = btn(k ? tituloSec(k) : "Todo", k === S.cat ? "on" : "", function () { S.cat = k; Array.prototype.forEach.call(cats.children, function (x) { x.classList.toggle("on", x === b); }); pintarProds(); });
          cats.appendChild(b);
        });
        wrap.appendChild(cats);
      }
      zonaProds = h("div", "cj-prods"); wrap.appendChild(zonaProds); cuerpo.appendChild(wrap);
      pintarProds();
    }
    var fotoPorId = null;
    function fotoDe(id) {
      if (!fotoPorId) {
        fotoPorId = {};
        ((ctx.cfg && ctx.cfg.secciones) || []).forEach(function (s) { (s.grupos || []).forEach(function (g) { (g.items || []).forEach(function (it) { if (it.foto) fotoPorId[it.id] = it.foto; }); }); });
      }
      return fotoPorId[id] || "";
    }
    function tituloSec(id) { var r = ((ctx.cfg && ctx.cfg.secciones) || []).filter(function (s) { return s.id === id; })[0]; return r ? r.titulo : (id || "Otros"); }
    function pintarProds() {
      if (!zonaProds) return;
      zonaProds.innerHTML = "";
      var base = S.cat && !S.q ? S.prods.filter(function (p) { return p.seccion === S.cat; }) : S.prods;
      var lista = L.buscar(base, S.q, 80);
      if (!S.q && !S.cat) lista = lista.slice().sort(function (a, b) { return L.prioridad(a.seccion) - L.prioridad(b.seccion); });
      if (!lista.length && S.prods.length) { zonaProds.appendChild(h("p", "cj-vacio", "No hay productos con \"" + S.q + "\".")); return; }
      var grid = h("div", "grid"); zonaProds.appendChild(grid);
      lista.forEach(function (p) {
        var b = h("button", "prod"); b.type = "button";
        var ft = h("div", "ft"), fu = fotoDe(p.id);
        if (fu) { fu = String(fu); if (!/^(https?:|data:|\/)/.test(fu)) fu = "/" + fu; ft.style.backgroundImage = "url('" + fu.replace(/'/g, "%27") + "')"; }
        else { ft.className = "ft sin"; ft.style.backgroundImage = "url('/gallo-oro.png')"; ft.style.backgroundSize = "46% auto"; ft.style.backgroundRepeat = "no-repeat"; ft.style.opacity = ".5"; }
        b.appendChild(ft);
        var tx = h("div", "tx");
        tx.appendChild(h("span", "n", p.nombre));
        if (p.unidad !== "unid") tx.appendChild(h("span", "g", "por " + p.unidad));
        var pm = modoPres(p);
        if (pm === "paq") tx.appendChild(h("span", "op", "elige paquetes"));
        else if (pm === "peso") tx.appendChild(h("span", "op", "elige peso"));
        else if (p.tam && p.tam.length > 1) tx.appendChild(h("span", "op", "elige tamaño"));
        tx.appendChild(h("span", "p", pm === "paq" ? L.soles(precioTam(p, "1/2 kg")) + " · paquete 500 g" : pm === "peso" ? L.soles(precioTam(p, "1/2 kg") * 2) + " / kg" : p.tam && p.tam.length ? "desde " + L.soles(Math.min.apply(null, p.tam.map(function (x) { return x[1]; }))) : L.soles(p.precio)));
        b.appendChild(tx);
        b.addEventListener("click", function () { agregar(p); });
        grid.appendChild(b);
      });
    }

    /* ---------- presentaciones de la tienda: paquete de 500 g (solo "1/2 kg") o peso por 1/4 kg (salsas: "1/2 kg" + "1/4 kg") ----------
       Se decide por las presentaciones del producto (no por su id). Al servidor siempre van líneas {id, tam, cant} con tam igual a una presentación. */
    function modoPres(p) {
      if (!p || p.seccion !== "tienda" || p.unidad !== "unid" || !p.tam || !p.tam.length) return "";
      var ts = p.tam.map(function (x) { return x[0]; }), m = ts.indexOf("1/2 kg") >= 0;
      if (m && ts.length === 1) return "paq";
      if (m && ts.indexOf("1/4 kg") >= 0 && ts.indexOf("1 kg") < 0) return "peso";
      return "";
    }
    function precioTam(p, tam) { var x = (p.tam || []).filter(function (y) { return y[0] === tam; })[0]; return x ? x[1] : 0; }
    function fmtKg(n) { return String(Math.round(n * 100) / 100).replace(".", ","); }
    function fmtCuartos(q) { var e = Math.floor(q / 4), f = ["", "¼", "½", "¾"][q % 4]; return (e || !f ? String(e) : "") + f; }
    function descPartes(q) { var m = Math.floor(q / 2), c = q % 2, r = []; if (m) r.push(m + " × ½"); if (c) r.push(c + " × ¼"); return r.join(" + "); }
    function cuartosDe(ls) { return ls.reduce(function (a, l) { return a + l.cant * (l.tam === "1/2 kg" ? 2 : 1); }, 0); }
    var NOTA_PESO = "Si no hay de ½, se entrega en ¼.";
    function prodDe(id) { return S.prods.filter(function (x) { return x.id === id; })[0]; }
    function grupoPeso(l) { return (l.tam === "1/2 kg" || l.tam === "1/4 kg") && modoPres(prodDe(l.id)) === "peso" ? l.id : ""; }
    function agrupar() {
      var r = [], vistos = {};
      S.carro.forEach(function (l) {
        var g = grupoPeso(l);
        if (!g) { r.push({ l: l, ls: [l], g: "" }); return; }
        if (vistos[g]) return; vistos[g] = 1;
        r.push({ l: l, ls: S.carro.filter(function (x) { return grupoPeso(x) === g; }), g: g });
      });
      return r;
    }
    function ponerLinea(p, tam, cant) {   // fija la cantidad de la línea (id, tam); 0 la quita
      var ex = S.carro.filter(function (l) { return l.id === p.id && (l.tam || "") === tam; })[0];
      if (ex) { if (cant > 0) ex.cant = cant; else S.carro.splice(S.carro.indexOf(ex), 1); return; }
      if (cant > 0) S.carro.push({ id: p.id, nombre: p.nombre, sku: p.sku, unidad: p.unidad, unit: precioTam(p, tam), tam: tam, cant: cant });
    }
    function fijarCuartos(p, q) { ponerLinea(p, "1/2 kg", Math.floor(q / 2)); ponerLinea(p, "1/4 kg", q % 2); }
    function pedirPres(p, modo) {
      var q = modo === "paq" ? 1 : 2, info = h("div", "cj-pinfo"), out = h("output", "", ""), pr = h("div", "cj-res ok");
      function pintar() {
        out.textContent = modo === "paq" ? String(q) : fmtCuartos(q);
        if (modo === "paq") { info.textContent = q + (q === 1 ? " paquete" : " paquetes") + " de 500 g · " + fmtKg(q * 0.5) + " kg"; pr.textContent = q + " × " + L.soles(precioTam(p, "1/2 kg")) + " = " + L.soles(L.subtotal(precioTam(p, "1/2 kg"), q)); }
        else {
          info.textContent = fmtCuartos(q) + " kg (" + descPartes(q) + ")";
          pr.textContent = L.soles(L.r2((q % 2) * precioTam(p, "1/4 kg") + Math.floor(q / 2) * precioTam(p, "1/2 kg")));
        }
      }
      var max = modo === "paq" ? 99 : 40;
      var menos = btn("−", "", function () { if (q > 1) { q--; pintar(); } }), mas = btn("+", "", function () { if (q < max) { q++; pintar(); } });
      menos.setAttribute("aria-label", "Quitar uno"); mas.setAttribute("aria-label", "Agregar uno");
      var st = h("div", "cj-pstep"); st.appendChild(menos); st.appendChild(out); st.appendChild(mas);
      var nodos = [h("div", "cj-pinfo", modo === "paq" ? "Paquete de 500 g · " + L.soles(precioTam(p, "1/2 kg")) : "Peso (de ¼ en ¼ kg) · " + L.soles(precioTam(p, "1/2 kg") * 2) + " el kg"), st, info, pr];
      if (modo === "peso") nodos.push(h("span", "cj-pnota", NOTA_PESO));
      var ok = btn("Agregar", "ok", function () {
        cerrarHoja();
        if (modo === "paq") { var ex = S.carro.filter(function (l) { return l.id === p.id && l.tam === "1/2 kg"; })[0]; ponerLinea(p, "1/2 kg", Math.min(99, (ex ? ex.cant : 0) + q)); }
        else {
          var ls = S.carro.filter(function (l) { return grupoPeso(l) === p.id; });
          fijarCuartos(p, Math.min(40, cuartosDe(ls) + q));
        }
        cambioCarro();
      });
      abrirHoja(p.nombre + (modo === "paq" ? ": paquetes" : ": peso"), nodos, [btn("Cancelar", "", cerrarHoja), ok]);
      pintar();
    }

    /* ---------- agregar al carrito ---------- */
    function agregar(p, tam) {
      var pm = !tam && modoPres(p);
      if (pm) { pedirPres(p, pm); return; }
      if (p.tam && p.tam.length && !tam) {
        var chips = h("div", "cj-chips");
        p.tam.forEach(function (t) { chips.appendChild(btn(t[0] + " · " + L.soles(t[1]), "", function () { cerrarHoja(); agregar(p, t[0]); })); });
        abrirHoja(p.nombre + ": elige el tamaño", [chips], [btn("Cancelar", "", cerrarHoja)]);
        return;
      }
      var unit = p.precio;
      if (tam) unit = (p.tam.filter(function (t) { return t[0] === tam; })[0] || [0, 0])[1];
      if (p.unidad !== "unid") { pedirPeso(p, tam || "", unit, null); return; }
      var ex = S.carro.filter(function (l) { return l.id === p.id && (l.tam || "") === (tam || ""); })[0];
      if (ex) ex.cant = Math.min(99, ex.cant + 1);
      else S.carro.push({ id: p.id, nombre: p.nombre, sku: p.sku, unidad: p.unidad, unit: unit, tam: tam || "", cant: 1 });
      cambioCarro();
    }
    function pedirPeso(p, tam, unit, linea) {
      var inp = entrada("text", p.unidad === "g" ? "ej. 250" : p.unidad === "lt" ? "ej. 0,5" : "ej. 0,350"); inp.setAttribute("inputmode", "decimal");
      var opciones = p.unidad === "kg" ? ["kg", "g"] : p.unidad === "lt" ? ["lt", "ml"] : [p.unidad], sel = opciones[0];
      var chips = h("div", "cj-chips"), calc = h("div", "cj-res", ""), err = h("div", "cj-err");
      function recalcular() {
        var q = L.parsearCantidad(inp.value, p.unidad, sel);
        calc.className = "cj-res" + (q ? " ok" : "");
        calc.textContent = q ? L.fmtCant(q, p.unidad) + " × " + L.soles(unit) + "/" + p.unidad + " = " + L.soles(L.subtotal(unit, q)) : "Escribe el peso";
        return q;
      }
      opciones.forEach(function (o) {
        var b = btn(o, o === sel ? "on" : "", function () { sel = o; Array.prototype.forEach.call(chips.children, function (x) { x.classList.toggle("on", x === b); }); recalcular(); inp.focus(); });
        chips.appendChild(b);
      });
      inp.addEventListener("input", recalcular);
      function aceptar() {
        var q = recalcular();
        if (!q) { err.textContent = "Escribe un peso válido."; return; }
        if (q > (p.unidad === "g" ? 50000 : 50)) { err.textContent = "Ese peso es demasiado alto."; return; }
        cerrarHoja();
        if (linea) linea.cant = q;
        else S.carro.push({ id: p.id, nombre: p.nombre, sku: p.sku, unidad: p.unidad, unit: unit, tam: tam, cant: q });
        cambioCarro();
      }
      inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); aceptar(); } });
      var ok = btn("Agregar", "ok", aceptar);
      if (linea) ok.textContent = "Guardar peso";
      abrirHoja((linea ? "Cambiar peso: " : "Peso de ") + p.nombre, [campo("Cantidad (" + L.soles(unit) + " por " + p.unidad + ")", inp), chips, calc, err], [btn("Cancelar", "", cerrarHoja), ok]);
      if (linea) inp.value = String(linea.cant).replace(".", ",");
      recalcular(); setTimeout(function () { inp.focus(); inp.select(); }, 50);
    }
    function cambioCarro() { S.pend = null; guardarCarro(); if (S.vista === "vender") pintarCarrito(); }

    /* ---------- búsqueda: Enter agrega el producto si queda uno solo (sin lector de códigos ni cámara) ---------- */
    doc.addEventListener("keydown", function (e) {
      if (!doc.body.contains(raiz) || S.vista !== "vender" || hojaAct) return;
      if (e.key === "Enter" && e.target === inBus) {
        e.preventDefault();
        var q = inBus.value.trim(); if (!q) return;
        var r = L.buscar(S.prods, q, 2);
        if (r.length === 1) { S.q = ""; inBus.value = ""; agregar(r[0]); pintarProds(); } else if (!r.length) { pitar(); toast("No hay productos con \"" + q + "\".", "mal"); }
      }
    });

    /* ---------- carrito ---------- */
    function pintarCarrito() {
      carrito.innerHTML = "";
      var box = h("div", "cj-lineas");
      if (!S.carro.length) box.appendChild(h("p", "cj-vacio", "Busca o toca un producto para empezar."));
      agrupar().forEach(function (gr) {
        var l = gr.l, ls = gr.ls, grp = gr.g, i = S.carro.indexOf(l);
        var f = h("div", "cj-l"), t = h("div", "t"), pm = modoPres(prodDe(l.id));
        var sub = ls.reduce(function (a, x) { return a + L.subtotal(x.unit, x.cant); }, 0);
        if (grp) {
          t.appendChild(h("b", "", l.nombre + " · " + fmtCuartos(cuartosDe(ls)) + " kg (" + descPartes(cuartosDe(ls)) + ")"));
          t.appendChild(h("span", "", L.soles(L.r2(sub))));
          t.appendChild(h("small", "", NOTA_PESO));
        } else if (pm === "paq" && l.tam === "1/2 kg") {
          t.appendChild(h("b", "", l.nombre + " · " + l.cant + " × 500 g (" + fmtKg(l.cant * 0.5) + " kg)"));
          t.appendChild(h("span", "", L.soles(l.unit) + " el paquete"));
        } else {
          t.appendChild(h("b", "", l.nombre + (l.tam ? " (" + l.tam + ")" : "")));
          t.appendChild(h("span", "", L.fmtCant(l.cant, l.unidad) + " × " + L.soles(l.unit) + (l.unidad !== "unid" ? "/" + l.unidad : "")));
        }
        f.appendChild(t);
        if (grp) {
          var gp = prodDe(l.id), q0 = cuartosDe(ls);
          var gm = btn("−", "", function () { fijarCuartos(gp, q0 - 1); cambioCarro(); }); gm.setAttribute("aria-label", "Quitar ¼ kg");
          var gmas = btn("+", "", function () { if (q0 < 40) fijarCuartos(gp, q0 + 1); cambioCarro(); }); gmas.setAttribute("aria-label", "Agregar ¼ kg");
          f.appendChild(gm); f.appendChild(gmas);
        } else if (l.unidad === "unid") {
          var menos = btn("−", "", function () { if (l.cant > 1) l.cant--; else S.carro.splice(i, 1); cambioCarro(); }); menos.setAttribute("aria-label", "Quitar uno");
          var mas = btn("+", "", function () { l.cant = Math.min(99, l.cant + 1); cambioCarro(); }); mas.setAttribute("aria-label", "Agregar uno");
          f.appendChild(menos); f.appendChild(mas);
        } else {
          var pe = btn("⚖", "peso", function () { var p = S.prods.filter(function (x) { return x.id === l.id; })[0] || { id: l.id, nombre: l.nombre, unidad: l.unidad }; pedirPeso(p, l.tam, l.unit, l); });
          pe.setAttribute("aria-label", "Cambiar peso"); f.appendChild(pe);
        }
        f.appendChild(h("div", "s", L.soles(L.r2(sub))));
        var x = btn("✕", "", function () { ls.forEach(function (y) { S.carro.splice(S.carro.indexOf(y), 1); }); cambioCarro(); }); x.setAttribute("aria-label", "Quitar de la venta"); f.appendChild(x);
        box.appendChild(f);
      });
      carrito.appendChild(box);
      var tot = h("div", "cj-tot"), m = h("div", "m"), u = agrupar().length;
      m.appendChild(h("small", "", u + (u === 1 ? " línea" : " líneas")));
      m.appendChild(doc.createTextNode(L.soles(L.totalCarro(S.carro))));
      tot.appendChild(m);
      var cb = btn(S.cliente ? "👤 " + (S.cliente.nombre || S.cliente.empresa || S.cliente.celular) : "👤 Cliente", "cj-cli", abrirCliente);
      tot.appendChild(cb);
      if (u) tot.appendChild(btn("Vaciar", "", function () { if (root.confirm("¿Vaciar la venta?")) { S.carro = []; cambioCarro(); } }));
      var go = btn("Cobrar", "cj-go", abrirCobro); go.disabled = !u; tot.appendChild(go);
      carrito.appendChild(tot);
    }

    /* ---------- cobrar ---------- */
    function abrirCobro() {
      var sub = L.totalCarro(S.carro), dTipo = "", dVal = null, dMot = null;
      var cuerpoH = [], inputs = {}, res = h("div", "cj-res"), err = h("div", "cj-err"), totalTxt = h("div", "cj-res ok");
      var ok = btn("Confirmar venta", "ok", enviar);
      var bloqueDesc = h("div"), btnDesc = btn("＋ Descuento", "", function () { mostrarDesc(true); btnDesc.remove(); });
      function mostrarDesc(foco) {
        var chips = h("div", "cj-chips");
        [["desc_pct", "%"], ["desc_monto", "S/ menos"], ["precio_final", "Precio final"]].forEach(function (t) {
          var b = btn(t[1], t[0] === dTipo ? "on" : "", function () { dTipo = t[0]; Array.prototype.forEach.call(chips.children, function (x) { x.classList.toggle("on", x === b); }); recalcular(); });
          chips.appendChild(b);
        });
        dVal = entrada("text", "Valor"); dVal.setAttribute("inputmode", "decimal"); dVal.addEventListener("input", recalcular);
        dMot = entrada("text", "Motivo (obligatorio)"); dMot.setAttribute("maxlength", "120"); dMot.addEventListener("input", recalcular);
        bloqueDesc.appendChild(chips); bloqueDesc.appendChild(dVal); bloqueDesc.appendChild(h("div", "", "")); bloqueDesc.appendChild(dMot);
        dTipo = "desc_pct"; chips.children[0].classList.add("on");
        if (foco) setTimeout(function () { dVal.focus(); }, 30);
        recalcular();
      }
      function totalActual() {
        if (!dTipo) return { ok: true, total: sub, desc: 0 };
        var d = L.descuento(sub, dTipo, dVal.value, S.descMax);
        if (d.ok && (dMot.value || "").trim().length < 3) return { ok: false, total: d.total, desc: d.desc, error: "Escribe el motivo del descuento.", d: d };
        return d;
      }
      function pagosActuales() { var o = {}; S.metodos.forEach(function (m) { o[m] = Number(String(inputs[m].value).replace(",", ".")) || 0; }); return o; }
      function recalcular() {
        var t = totalActual();
        var total = t.ok ? t.total : (t.d && t.d.ok ? t.d.total : sub);
        totalTxt.textContent = "TOTAL " + L.soles(total) + (t.desc ? "  (descuento " + L.soles(t.desc) + ")" : "");
        var c = L.cobro(total, pagosActuales());
        var pagado = c.efectivo + c.noEfectivo;
        res.className = "cj-res " + (c.ok ? "ok" : "mal");
        res.textContent = c.ok ? (c.vuelto > 0 ? "Vuelto: " + L.soles(c.vuelto) : "Pago exacto") : (pagado ? c.error : "Indica cómo paga");
        ok.disabled = !(t.ok && c.ok);
        err.textContent = !t.ok ? t.error : "";
        return { t: t, c: c, total: total };
      }
      cuerpoH.push(totalTxt, btnDesc, bloqueDesc);
      var pag = h("div"); pag.appendChild(h("label", "", "Cómo paga"));
      S.metodos.forEach(function (m) {
        var f = h("div", "cj-pago"), i = entrada("text", "0.00"); i.setAttribute("inputmode", "decimal"); i.setAttribute("aria-label", m);
        i.addEventListener("input", recalcular); inputs[m] = i;
        f.appendChild(h("span", "", m)); f.appendChild(i);
        f.appendChild(btn(m === "Efectivo" ? "Exacto" : "Todo", "", function () {
          var otros = 0; S.metodos.forEach(function (o) { if (o !== m) otros += Number(String(inputs[o].value).replace(",", ".")) || 0; });
          var t = totalActual(), total = t.ok ? t.total : (t.d && t.d.ok ? t.d.total : sub), falta = L.r2(total - otros);
          inputs[m].value = falta > 0 ? falta.toFixed(2) : ""; recalcular();
        }));
        pag.appendChild(f);
      });
      cuerpoH.push(pag, res, err);
      var tieneEf = S.metodos.indexOf("Efectivo") >= 0;
      abrirHoja("Cobrar · " + L.soles(sub), cuerpoH, [btn("Volver", "", cerrarHoja), ok]);
      if (tieneEf) setTimeout(function () { inputs.Efectivo.focus(); }, 40);
      recalcular();

      function enviar() {
        var r = recalcular(); if (ok.disabled) return;
        var pagos = [], pa = pagosActuales();
        Object.keys(pa).forEach(function (m) { if (pa[m] > 0) pagos.push({ metodo: m, monto: pa[m] }); });
        var carga = { op: "venta", items: S.carro.map(function (l) { var o = { id: l.id, cant: l.cant }; if (l.tam) o.tam = l.tam; return o; }), pagos: pagos };
        if (dTipo) carga.descuento = { tipo: dTipo, valor: dVal.value, motivo: dMot.value.trim() };
        var snapCli = S.cliente, snapLin = S.carro.map(function (l) { return { id: l.id, nombre: l.nombre, unidad: l.unidad, tam: l.tam || "", cant: l.cant, kilos: L.kilosDe(l), subtotal: L.subtotal(l.unit, l.cant) }; });
        var firma = JSON.stringify(carga);
        if (!S.pend || S.pend.firma !== firma) S.pend = { firma: firma, cid: L.nuevoCid() };   // mismo contenido = mismo id: un reintento no duplica la venta
        carga.cid = S.pend.cid;
        ok.disabled = true; ok.textContent = "Guardando…"; err.textContent = "";
        llamar(carga).then(function (rs) {
          if (!rs.ok) { ok.textContent = "Confirmar venta"; ok.disabled = false; err.textContent = rs.error || "No se pudo guardar."; if (/otros datos/.test(rs.error || "")) S.pend = null; return; }
          if (snapCli) { rs.venta.cliente = snapCli; registrarSalida(carga.cid, rs.venta.id, snapCli, snapLin); }
          S.pend = null; S.carro = []; guardarCarro(); S.q = ""; S.cliente = null; guardar("pg-cajero-cliente", null);
          cerrarHoja(); if (rs.repetida) toast("Esa venta ya estaba registrada: no se duplicó.", "ok");
          pintar(); verRecibo(rs.venta, true);
        }).catch(function () { ok.textContent = "Confirmar venta"; ok.disabled = false; err.textContent = "Sin conexión. Toca de nuevo \"Confirmar venta\": si la venta ya se guardó, no se duplica."; });
      }
    }

    /* ---------- recibo ---------- */
    function imprimir(texto) {
      var p = doc.getElementById("cj-print") || doc.body.appendChild(h("div")); p.id = "cj-print"; p.textContent = texto;
      var limpiar = function () { root.removeEventListener("afterprint", limpiar); if (p.parentNode) p.parentNode.removeChild(p); };
      root.addEventListener("afterprint", limpiar);
      root.print();
    }
    function compartir(texto) {
      if (root.navigator.share) { root.navigator.share({ text: texto }).catch(function () {}); return; }
      try { root.open("https://wa.me/?text=" + encodeURIComponent(texto), "_blank", "noopener"); } catch (e) { toast("No se pudo compartir.", "mal"); }
    }
    function copiar(texto) {
      try { root.navigator.clipboard.writeText(texto).then(function () { toast("Recibo copiado.", "ok"); }); } catch (e) { toast("No se pudo copiar.", "mal"); }
    }
    function verRecibo(v, nueva) {
      var texto = L.textoRecibo(v, S.negocio), pre = h("pre", "cj-rec", texto);
      var botones = [btn(nueva ? "Nueva venta" : "Cerrar", "ok", function () { cerrarHoja(); if (S.vista === "vender") setTimeout(function () { if (inBus) inBus.focus(); }, 50); })];
      var acc = h("div", "cj-acc");
      acc.appendChild(btn("🖨 Imprimir", "", function () { imprimir(texto); }));
      acc.appendChild(btn("Compartir", "", function () { compartir(texto); }));
      acc.appendChild(btn("Copiar", "", function () { copiar(texto); }));
      var nodos = [pre, acc];
      if (!nueva && v.estado !== "Anulada") nodos.push(btn("Anular esta venta", "cj-del", function () { anularVenta(v); }));
      abrirHoja((nueva ? "✓ Venta registrada · " : "Venta ") + v.id, nodos, botones, function () { if (nueva && S.vista === "vender") pintarProds(); });
    }
    function anularVenta(v) {
      if (!S.anularCajero) { toast("Solo el administrador puede anular. Avísale desde el panel.", "mal"); return; }
      var mot = entrada("text", "Motivo (obligatorio)"), err = h("div", "cj-err");
      var ok = btn("Anular venta", "mal", function () {
        if (mot.value.trim().length < 3) { err.textContent = "Escribe el motivo."; return; }
        ok.disabled = true;
        llamar({ op: "anular", id: v.id, motivo: mot.value.trim() }).then(function (r) {
          if (!r.ok) { ok.disabled = false; err.textContent = r.error || "No se pudo anular."; return; }
          cerrarHoja(); toast("Venta anulada.", "ok"); cargarHist().then(pintar);
        }).catch(function () { ok.disabled = false; err.textContent = "Sin conexión."; });
      });
      abrirHoja("Anular " + v.id + " · " + L.soles(v.total), [campo("Motivo de la anulación", mot), err], [btn("Volver", "", function () { cerrarHoja(); verRecibo(v, false); }), ok]);
      setTimeout(function () { mot.focus(); }, 40);
    }

    /* ---------- por recoger ---------- */
    function pintarRecoger() {
      cuerpo.appendChild(h("p", "cj-hint", "Pedidos de la web para recoger que ya están listos" + (S.enCocina ? " · " + S.enCocina + " todavía en cocina" : "") + "."));
      if (!S.recoger.length) { cuerpo.appendChild(h("p", "cj-vacio", "No hay pedidos listos para recoger.")); }
      S.recoger.forEach(function (p) {
        var f = h("div", "cj-row"), t = h("div", "t");
        t.appendChild(h("b", "", "#" + (p.numDia || p.numero) + " · " + (p.nombre || "Cliente")));
        t.appendChild(h("span", "", p.detalle || ""));
        t.appendChild(h("span", "", L.soles(p.total) + (p.pago ? " · " + p.pago : "") + (p.pagoEstado ? " (" + p.pagoEstado + ")" : "") + (p.telefono ? " · " + p.telefono : "")));
        f.appendChild(t);
        var b = btn("Entregar", "cj-go", function () {
          if (!b.dataset.seguro) { b.dataset.seguro = "1"; b.textContent = "¿Seguro?"; setTimeout(function () { b.dataset.seguro = ""; b.textContent = "Entregar"; }, 3000); return; }
          b.disabled = true;
          llamar({ op: "entregar", numero: p.numero }).then(function (r) {
            if (!r.ok) { b.disabled = false; toast(r.error || "No se pudo entregar.", "mal"); return; }
            toast("✓ Pedido entregado.", "ok"); cargarRecoger().then(pintar);
          }).catch(function () { b.disabled = false; toast("Sin conexión.", "mal"); });
        });
        b.style.height = "48px"; b.style.fontSize = "15px"; f.appendChild(b);
        cuerpo.appendChild(f);
      });
    }

    /* ---------- hoy: historial y cierre ---------- */
    function kpi(etq, val) { var k = h("div", "cj-kpi"); k.appendChild(h("span", "", etq)); k.appendChild(h("b", "", val)); return k; }
    function pintarHoy() {
      if (!S.hist) { cuerpo.appendChild(h("p", "cj-vacio", "Cargando…")); return; }
      var t = S.hist.totales, k = h("div", "cj-kpis");
      k.appendChild(kpi("Ventas", String(t.ventas))); k.appendChild(kpi("Total", L.soles(t.total)));
      k.appendChild(kpi("Efectivo", L.soles(t.efectivo))); k.appendChild(kpi("Yape", L.soles(t.yape)));
      k.appendChild(kpi("Plin", L.soles(t.plin))); k.appendChild(kpi("Tarjeta", L.soles(t.tarjeta)));
      if (t.anuladas) k.appendChild(kpi("Anuladas", String(t.anuladas)));
      cuerpo.appendChild(k);
      var acc = h("div", "cj-acc"); acc.appendChild(btn("Actualizar", "", function () { cargarHist().then(pintar); })); acc.appendChild(btn("Cerrar el día", "ok", abrirCierre));
      cuerpo.appendChild(acc);
      if (!S.hist.ventas.length) cuerpo.appendChild(h("p", "cj-vacio", "Todavía no hay ventas hoy."));
      S.hist.ventas.forEach(function (v) {
        var f = h("button", "cj-row" + (v.estado === "Anulada" ? " anulada" : "")), t2 = h("div", "t");
        f.type = "button";
        t2.appendChild(h("b", "", "N° " + v.numero + " · " + v.hora + " · " + L.soles(v.total)));
        t2.appendChild(h("span", "", v.pagos.map(function (p) { return p.metodo + " " + L.soles(p.monto); }).join(" + ") + (v.estado === "Anulada" ? " · ANULADA: " + v.anuladaMotivo : "") + (v.descuento ? " · desc. " + L.soles(v.descuento) : "")));
        f.appendChild(t2); f.appendChild(h("span", "", "›"));
        f.addEventListener("click", function () { verRecibo(v, false); });
        cuerpo.appendChild(f);
      });
    }
    function abrirCierre() {
      var fondo = entrada("text", "0.00"), contado = entrada("text", "Opcional"), nota = entrada("text", "Nota (opcional)"), info = h("div", "cj-res"), err = h("div", "cj-err");
      fondo.setAttribute("inputmode", "decimal"); contado.setAttribute("inputmode", "decimal");
      var ok = btn("Guardar cierre", "ok", function () {
        ok.disabled = true;
        llamar({ op: "cierre", fondo: fondo.value.replace(",", "."), contado: contado.value.replace(",", "."), nota: nota.value, confirmar: true }).then(function (r) {
          if (!r.ok) { ok.disabled = false; err.textContent = r.error || "No se pudo guardar."; return; }
          cerrarHoja(); toast("✓ Cierre guardado (" + r.id + ").", "ok");
        }).catch(function () { ok.disabled = false; err.textContent = "Sin conexión."; });
      });
      var t = S.hist.totales;
      function recalcular() {
        var f = Number(fondo.value.replace(",", ".")) || 0, esp = L.r2(f + t.efectivo), c = contado.value.trim() === "" ? null : Number(contado.value.replace(",", "."));
        info.className = "cj-res" + (c == null ? "" : (Math.abs(c - esp) < 0.005 ? " ok" : " mal"));
        info.textContent = "Efectivo esperado: " + L.soles(esp) + (c == null || !isFinite(c) ? "" : " · diferencia " + L.soles(c - esp));
      }
      fondo.addEventListener("input", recalcular); contado.addEventListener("input", recalcular); recalcular();
      abrirHoja("Cerrar el día · " + L.soles(t.total), [h("p", "cj-hint", t.ventas + " ventas · Efectivo " + L.soles(t.efectivo) + " · Yape " + L.soles(t.yape) + " · Plin " + L.soles(t.plin) + " · Tarjeta " + L.soles(t.tarjeta)),
        campo("Efectivo con el que abriste la caja (fondo)", fondo), campo("Efectivo contado ahora", contado), info, campo("Nota", nota), err], [btn("Volver", "", cerrarHoja), ok]);
    }

    /* ---------- efectivo de caja (caja.js: abrir, ingreso, retiro, arqueo) ---------- */
    function abrirEfectivo() {
      var ir = function () { root.PG_CAJA.abrir({ api: api, token: TOKEN, mozo: ctx.mozo, toast: toast }); };
      if (root.PG_CAJA) { ir(); return; }
      var sc = doc.createElement("script"); sc.src = "/caja.js"; sc.onload = ir;
      sc.onerror = function () { toast("No se pudo cargar la caja. Revisa la conexión.", "mal"); };
      doc.head.appendChild(sc);
    }
    if (!RESTR) top.insertBefore(btn("Efectivo", "", abrirEfectivo), top.lastChild);

    /* ---------- cliente (mayoristas y otros locales que piden por WhatsApp): kilos salidos por producto y cliente ---------- */
    var K_PEND = "pg-cajero-salidas-pend";
    function registrarSalida(cid, ventaId, cli, lineas) {
      var pend = leer(K_PEND, []);
      pend.push({ cid: cid, venta: ventaId, cliente: cli, mayorista: !!cli.mayorista, lineas: lineas });
      guardar(K_PEND, pend.slice(-30)); enviarSalidas();
    }
    function enviarSalidas() {
      var pend = leer(K_PEND, []); if (!pend.length) return;
      var x = pend[0], c = { mz: "tiendasalida", t: TOKEN }; Object.keys(x).forEach(function (k) { c[k] = x[k]; });
      api(c).then(function (r) {
        if (r && (r.ok || /Falta/.test(r.error || ""))) { guardar(K_PEND, leer(K_PEND, []).slice(1)); enviarSalidas(); }
      }).catch(function () {});
    }
    function abrirCliente() {
      var c = S.cliente || {}, nom = entrada("text", "Nombre"), cel = entrada("tel", "Celular"), emp = entrada("text", "Empresa o local (opcional)"), err = h("div", "cj-err");
      nom.value = c.nombre || ""; cel.value = c.celular || ""; emp.value = c.empresa || "";
      [nom, emp].forEach(function (i) { i.setAttribute("maxlength", "60"); });
      var lista = h("div", "cj-chips");
      api({ mz: "tiendaclientes", t: TOKEN }).then(function (r) {
        (r && r.clientes || []).slice(0, 12).forEach(function (k) {
          lista.appendChild(btn(k.empresa || k.nombre || k.celular, "", function () { nom.value = k.nombre; cel.value = k.celular; emp.value = k.empresa; }));
        });
      }).catch(function () {});
      var ok = btn("Guardar cliente", "ok", function () {
        if (!nom.value.trim() && !emp.value.trim() && !cel.value.trim()) { err.textContent = "Escribe al menos el nombre, la empresa o el celular."; return; }
        S.cliente = { nombre: nom.value.trim(), celular: cel.value.replace(/[^\d+]/g, ""), empresa: emp.value.trim(), mayorista: !!emp.value.trim() };
        guardar("pg-cajero-cliente", S.cliente); cerrarHoja(); pintarCarrito();
      });
      var bs = [btn("Cancelar", "", cerrarHoja), ok];
      if (S.cliente) bs.splice(1, 0, btn("Quitar", "mal", function () { S.cliente = null; guardar("pg-cajero-cliente", null); cerrarHoja(); pintarCarrito(); }));
      abrirHoja("Cliente de esta venta", [h("p", "cj-hint", "Para mayoristas y locales que piden por WhatsApp: con empresa, se anotan los kilos que salen."), lista, campo("Nombre", nom), campo("Celular", cel), campo("Empresa o local", emp), err], bs);
    }
    function cargarClientes() {
      return api({ mz: "tiendasalidas", t: TOKEN, dias: 30 }).then(function (r) { S.clientes = r && r.ok ? r.clientes : []; }).catch(function () { S.clientes = []; toast("Sin conexión.", "mal"); });
    }
    function pintarClientes() {
      cuerpo.appendChild(h("p", "cj-hint", "Kilos salidos por cliente en los últimos 30 días (ventas con cliente registrado)."));
      if (!S.clientes) { cuerpo.appendChild(h("p", "cj-vacio", "Cargando…")); return; }
      if (!S.clientes.length) cuerpo.appendChild(h("p", "cj-vacio", "Todavía no hay ventas con cliente."));
      S.clientes.forEach(function (c) {
        var d = h("div", "cj-sec");
        d.appendChild(h("h3", "", (c.empresa ? c.empresa + " · " : "") + (c.nombre || "Sin nombre") + (c.celular ? " · " + c.celular : "")));
        d.appendChild(h("div", "", L.fmtCant(c.kilos, "kg") + " en total · " + L.soles(c.total)));
        c.productos.forEach(function (p) { d.appendChild(h("div", "cj-hint", p.producto + (p.tam ? " (" + p.tam + ")" : "") + ": " + p.cant + " " + (p.unidad === "unid" ? "unid." : p.unidad) + (p.kilos ? " · " + L.fmtCant(p.kilos, "kg") : ""))); });
        cuerpo.appendChild(d);
      });
    }

    /* ---------- mapa del salón: ver una mesa ---------- */
    function verMesa(m, estado) {
      var caja = h("div"); caja.appendChild(h("p", "cj-vacio", "Cargando…"));
      abrirHoja("Mesa " + m.mesa, [caja], [btn("Cerrar", "", cerrarHoja)]);
      api({ mz: "cuenta", t: TOKEN, mesa: m.mesa }).then(function (r) {
        caja.innerHTML = "";
        caja.appendChild(h("p", "cj-hint", "Estado: " + estado + (m.atiende ? " · atiende " + m.atiende.nombre : "") + ". El cobro de mesas lo hace el mozo."));
        if (!r.ok || !r.pedidos || !r.pedidos.length) { caja.appendChild(h("p", "cj-vacio", "La mesa no tiene pedidos.")); return; }
        r.pedidos.forEach(function (p) {
          var f = h("div", "cj-row"), t = h("div", "t");
          t.appendChild(h("b", "", "#" + p.numero + " · " + p.hora + " · " + p.estado));
          (p.lineas ? p.lineas.map(function (l) { return l.t; }) : [String(p.detalle || "").replace(/ — S\/ [\d.]+/g, "")]).forEach(function (x) { t.appendChild(h("span", "", x)); });
          f.appendChild(t); caja.appendChild(f);
        });
        caja.appendChild(h("div", "cj-res ok", "Total de la mesa: " + L.soles(r.total)));
      }).catch(function () { caja.innerHTML = ""; caja.appendChild(h("p", "cj-vacio", "Sin conexión.")); });
    }

    /* ---------- arranque ---------- */
    pintar(); enviarSalidas();
    if (RESTR) { cargar().then(pintar); return { recargar: function () { return cargar().then(pintar); } }; }
    cargar().then(function () { pintar(); return cargarRecoger(); });
    setInterval(function () { if (doc.hidden || !doc.body.contains(raiz)) return; cargarRecoger(); }, 45000);
  }
})(typeof window !== "undefined" ? window : this);
