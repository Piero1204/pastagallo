/* Pasta Gallo · efectivo de caja para el cajero (se carga desde cajero.js al tocar "Efectivo").
   window.PG_CAJA.abrir({ api, token, h, toast, mozo }) muestra una hoja con: saldo de caja chica, Abrir caja, Ingreso, Retiro,
   Transferir a caja grande y Arquear/Cerrar con conteo por denominaciones. El servidor decide los permisos y recalcula todo
   (límites caja_retiro_max / caja_ingreso_max): lo de aquí solo es vista. */
(function (root) {
  "use strict";
  var doc = root.document;
  function r2(n) { return Math.round(Number(n) * 100) / 100; }
  function soles(n) { return "S/ " + r2(n || 0).toFixed(2); }
  function h(tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function btn(txt, cls, fn) { var b = h("button", cls, txt); b.type = "button"; if (fn) b.addEventListener("click", fn); return b; }

  function css() {
    if (doc.getElementById("cg-css")) return;
    var s = h("style"); s.id = "cg-css";
    s.textContent = [
      ".cg-vel{position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center}",
      ".cg-hoja{background:var(--papel,#faf6ec);width:100%;max-width:600px;max-height:94vh;overflow:auto;border-radius:18px 18px 0 0;padding:14px 14px calc(16px + env(safe-area-inset-bottom))}",
      "@media(min-width:700px){.cg-vel{align-items:center}.cg-hoja{border-radius:18px}}",
      ".cg-hoja h2{font-size:19px;color:var(--vino,#4a1519);margin:0 0 10px}.cg-hoja h3{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--gris,#6f5f57);margin:12px 0 6px}",
      ".cg-saldo{background:#fff;border:2px solid var(--oro,#a9803f);border-radius:14px;padding:12px;margin-bottom:10px}.cg-saldo span{display:block;font-size:12px;font-weight:700;text-transform:uppercase;color:var(--gris,#6f5f57)}",
      ".cg-saldo b{font-size:30px;color:var(--vino,#4a1519)}.cg-saldo small{display:block;color:var(--gris,#6f5f57)}",
      ".cg-btns{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px}.cg-btns button,.cg-acc button{height:52px;border-radius:12px;font-weight:800;font-size:16px;background:var(--crema-2,#e6dac0)}",
      ".cg-btns .prim,.cg-acc .ok{background:var(--verde,#2f7a3a);color:#fff}.cg-acc{display:flex;gap:8px;margin-top:12px}.cg-acc button{flex:1}.cg-acc button:disabled{opacity:.4}",
      ".cg-hoja label{display:block;font-size:13px;font-weight:700;margin:8px 0 4px}.cg-hoja input,.cg-hoja select{width:100%;height:48px;border-radius:10px;border:2px solid var(--linea,#dccdb0);padding:0 12px;font-size:17px;background:#fff;box-sizing:border-box}",
      ".cg-den{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px}.cg-den label{margin:0}.cg-den input{text-align:center}",
      ".cg-res{padding:10px;border-radius:10px;font-weight:800;text-align:center;margin-top:8px;background:#fff;border:2px solid var(--linea,#dccdb0)}.cg-res.ok{border-color:var(--verde,#2f7a3a);color:var(--verde,#2f7a3a)}.cg-res.mal{border-color:var(--rojo,#b6232a);color:var(--rojo,#b6232a)}",
      ".cg-err{color:var(--rojo,#b6232a);font-weight:700;min-height:20px;margin-top:6px}",
      ".cg-row{display:flex;justify-content:space-between;gap:8px;padding:7px 0;border-bottom:1px solid #f1e8d6;font-size:14px}.cg-row small{display:block;color:var(--gris,#6f5f57)}.cg-row.anulado{opacity:.5;text-decoration:line-through}.cg-neg{color:var(--rojo,#b6232a)}.cg-pos{color:var(--verde,#2f7a3a)}"
    ].join("\n");
    doc.head.appendChild(s);
  }

  function abrir(ctx) {
    css();
    var tok = ctx.token, api = ctx.api, toast = ctx.toast || function () {}, S = { d: null }, vel = h("div", "cg-vel"), hoja = h("div", "cg-hoja");
    vel.appendChild(hoja); doc.body.appendChild(vel);
    vel.addEventListener("click", function (e) { if (e.target === vel) cerrar(); });
    hoja.setAttribute("role", "dialog"); hoja.setAttribute("aria-label", "Efectivo de caja");
    function cerrar() { vel.remove(); }
    function llamar(op, datos) { return api({ ext: "caja", t: tok, op: op, datos: datos || {} }); }
    function cargar() {
      return llamar("estado").then(function (r) { if (!r.ok) { vista("Efectivo de caja", [h("p", "cg-err", r.error || "No se pudo cargar.")], [btn("Cerrar", "", cerrar)]); return; } S.d = r; principal(); })
        .catch(function () { vista("Efectivo de caja", [h("p", "cg-err", "Sin conexión.")], [btn("Reintentar", "ok", cargar), btn("Cerrar", "", cerrar)]); });
    }
    function vista(titulo, nodos, botones) {
      hoja.textContent = ""; hoja.appendChild(h("h2", "", titulo));
      nodos.forEach(function (n) { hoja.appendChild(n); });
      if (botones && botones.length) { var a = h("div", "cg-acc"); botones.forEach(function (b) { a.appendChild(b); }); hoja.appendChild(a); }
    }
    function campo(etq, input) { var d = h("div"); d.appendChild(h("label", "", etq)); d.appendChild(input); return d; }
    function entrada(ph, modo) { var i = h("input"); i.type = "text"; if (ph) i.placeholder = ph; if (modo) i.setAttribute("inputmode", modo); return i; }

    function principal() {
      var d = S.d, c = d.chica, nodos = [];
      var sa = h("div", "cg-saldo"); sa.appendChild(h("span", "", "Efectivo en caja chica ahora")); sa.appendChild(h("b", "", soles(c.saldo)));
      sa.appendChild(h("small", "", d.abierta ? "Abierta " + d.base.desde + " · " + d.base.quien : (d.sinBase ? "Sin abrir" : "Cerrada")));
      nodos.push(sa);
      if (d.abiertaVieja) nodos.push(h("p", "cg-err", "Hay una caja abierta de otro día: ciérrala (Arquear / Cerrar) antes de abrir una nueva."));
      var g = h("div", "cg-btns");
      if (!d.abierta) g.appendChild(btn("Abrir caja", "prim", formAbrir));
      g.appendChild(btn("+ Ingreso", "", function () { formMov("ingreso"); }));
      g.appendChild(btn("− Retiro", "", function () { formMov("retiro"); }));
      g.appendChild(btn("A caja grande", "", formTransf));
      if (d.abierta) g.appendChild(btn("Arquear / Cerrar", "prim", formCierre));
      nodos.push(g);
      nodos.push(h("h3", "", "Movimientos de hoy"));
      if (!d.movimientos.length) nodos.push(h("p", "", "Todavía no hay movimientos."));
      d.movimientos.forEach(function (m) {
        var f = h("div", "cg-row" + (m.anulado ? " anulado" : "")), t = h("div"), neg = 0 > m.efecto;
        t.appendChild(h("b", "", m.hora + " · " + m.tipo + (m.categoria ? " · " + m.categoria : ""))); t.appendChild(h("small", "", m.motivo + " · " + m.responsable));
        f.appendChild(t); f.appendChild(h("b", neg ? "cg-neg" : "cg-pos", (neg ? "-" : "+") + soles(Math.abs(m.efecto))));
        nodos.push(f);
      });
      vista("Efectivo de caja", nodos, [btn("Actualizar", "", cargar), btn("Cerrar", "", cerrar)]);
    }
    function conteo(alCambiar) {
      var cont = h("div"), den = h("div", "cg-den"), campos = {}, tot = h("div", "cg-res", "Total contado: S/ 0.00");
      (S.d.denominaciones || []).forEach(function (x) {
        var i = entrada("0", "numeric"); i.addEventListener("input", calc); campos[x] = i;
        var l = h("div"); l.appendChild(h("label", "", "S/ " + Number(x).toFixed(2))); l.appendChild(i); den.appendChild(l);
      });
      function valores() { var o = {}; Object.keys(campos).forEach(function (k) { var v = campos[k].value.trim(); if (v !== "") o[k] = v; }); return o; }
      function total() { var t = 0; Object.keys(campos).forEach(function (k) { t += (Number(campos[k].value) || 0) * Number(k); }); return r2(t); }
      function calc() { tot.textContent = "Total contado: " + soles(total()); if (alCambiar) alCambiar(); }
      cont.appendChild(den); cont.appendChild(tot);
      return { nodo: cont, valores: valores, total: total };
    }
    function enviar(op, datos, ok, bot, err) {
      bot.disabled = true;
      llamar(op, datos).then(function (r) { if (!r.ok) { bot.disabled = false; err.textContent = r.error || "No se pudo guardar."; return; } ok(r); })
        .catch(function () { bot.disabled = false; err.textContent = "Sin conexión."; });
    }
    function formAbrir() {
      var cn = conteo(), nota = entrada("Nota (si no coincide con lo que quedó)"), err = h("p", "cg-err"), ok = btn("Abrir caja", "ok");
      ok.addEventListener("click", function () { enviar("abrir", { conteo: cn.valores(), nota: nota.value }, function (r) { toast("✓ Caja abierta con " + soles(r.monto) + ".", "ok"); cargar(); }, ok, err); });
      vista("Abrir caja: cuenta tu efectivo", [cn.nodo, campo("Nota", nota), err], [btn("Volver", "", principal), ok]);
    }
    function formMov(tipo) {
      var d = S.d, cats = tipo === "ingreso" ? d.categoriasIngreso : d.categoriasRetiro, sel = h("select");
      Object.keys(cats).forEach(function (k) {
        if (k === "a_caja_grande" || (d.soloAdmin || []).indexOf(k) >= 0) return;
        var o = h("option", "", cats[k]); o.value = k; sel.appendChild(o);
      });
      var monto = entrada("0.00", "decimal"), mot = entrada("Motivo (obligatorio)"), comp = entrada("N° de nota (opcional)"), err = h("p", "cg-err"), ok = btn("Guardar", "ok");
      var lim = tipo === "ingreso" ? d.limites.ingresoMax : d.limites.retiroMax;
      ok.addEventListener("click", function () { enviar("movimiento", { tipo: tipo, categoria: sel.value, monto: monto.value.replace(",", "."), motivo: mot.value, comprobante: comp.value }, function () { toast("✓ Registrado.", "ok"); cargar(); }, ok, err); });
      vista(tipo === "ingreso" ? "Ingreso de efectivo" : "Retiro de efectivo", [h("p", "", "Hasta " + soles(lim) + " por movimiento; lo mayor lo registra el administrador."), campo("Tipo", sel), campo("Monto (S/)", monto), campo("Motivo", mot), campo("Comprobante", comp), err], [btn("Volver", "", principal), ok]);
    }
    function formTransf() {
      var monto = entrada("0.00", "decimal"), mot = entrada("Motivo (opcional)"), err = h("p", "cg-err"), ok = btn("Pasar", "ok");
      ok.addEventListener("click", function () { enviar("transferir", { de: "chica", monto: monto.value.replace(",", "."), motivo: mot.value }, function () { toast("✓ Pasado a caja grande.", "ok"); cargar(); }, ok, err); });
      vista("Pasar efectivo a caja grande", [campo("Monto (S/)", monto), campo("Motivo", mot), err], [btn("Volver", "", principal), ok]);
    }
    function formCierre() {
      var res = h("div", "cg-res", "Cuenta los billetes y monedas."), obs = entrada("Observación (obligatoria si no cuadra)"), aG = entrada("0.00", "decimal"), err = h("p", "cg-err"), tm = null, ok = btn("Guardar cierre", "ok");
      var cn = conteo(function () { clearTimeout(tm); tm = setTimeout(previa, 350); });
      aG.addEventListener("input", function () { clearTimeout(tm); tm = setTimeout(previa, 350); });
      function previa() {
        llamar("cerrar", { conteo: cn.valores(), aGrande: aG.value.replace(",", ".") }).then(function (r) {
          if (!r.ok) { res.textContent = r.error || ""; res.className = "cg-res mal"; return; }
          res.textContent = "Esperado " + soles(r.esperado) + " · " + (r.resultado === "Cuadra" ? "CUADRA" : r.resultado.toUpperCase() + " " + soles(Math.abs(r.diferencia))) + " · queda " + soles(r.queda);
          res.className = "cg-res " + (r.resultado === "Cuadra" ? "ok" : "mal");
        }).catch(function () {});
      }
      ok.addEventListener("click", function () { enviar("cerrar", { conteo: cn.valores(), aGrande: aG.value.replace(",", "."), observacion: obs.value, confirmar: true }, function (r) { toast("✓ Cierre guardado (" + r.id + ").", "ok"); cargar(); }, ok, err); });
      vista("Arquear y cerrar caja", [cn.nodo, res, campo("Pasar a caja grande al cerrar (S/)", aG), campo("Observación", obs), err], [btn("Volver", "", principal), ok]);
    }
    vista("Efectivo de caja", [h("p", "", "Cargando…")], []);
    cargar();
  }
  root.PG_CAJA = { abrir: abrir };
})(typeof window !== "undefined" ? window : this);
