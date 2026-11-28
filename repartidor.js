/* Pasta Gallo · app del REPARTIDOR (módulo "reparto").
   La carga mozo.js cuando el enlace del equipo pertenece a alguien con rol "repartidor" y llama:
     window.PG_APP_REPARTIDOR.iniciar({ api, token, mozo, contenedor, h, toast, salir, cfg })
   Todo se habla con el servidor por api({ ext: 'reparto', accion, t, ... }). Las acciones que cambian algo van a una COLA guardada en
   el teléfono (localStorage) con un identificador único (rid): si no hay señal se reintentan solas y el servidor no las repite.
   Sin GPS, sin mapas con clave, sin notificaciones push: "Abrir en Google Maps" es solo un enlace. */
(function () {
  "use strict";
  var K_COLA = "pg-rep-cola", K_ESTADO = "pg-rep-estado";
  function leer(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function guardar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function soles(n) { return "S/ " + Number(n || 0).toFixed(2); }
  function r2(n) { return Math.round(n * 100) / 100; }
  /* ---- funciones puras (se pueden probar solas) ---- */
  function vuelto(total, recibido) { var t = Number(total), r = Number(String(recibido).replace(",", ".")); if (!isFinite(r) || String(recibido).trim() === "" || r < t) return null; return r2(r - t); }
  function urlMapa(direccion, referencia) { var q = String(direccion || "").trim(); return q ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q) : ""; }
  function urlTel(tel) { var t = String(tel || "").replace(/[^\d+]/g, ""); return t ? "tel:" + t : ""; }
  function nuevoRid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
  function minSeg(ms) { var s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
  window.PG_REP_UTIL = { vuelto: vuelto, urlMapa: urlMapa, urlTel: urlTel, minSeg: minSeg };

  var CSS = ".rp{max-width:560px;margin:0 auto;padding:12px 12px 90px;color:var(--tinta,#2a1b17)}" +
    ".rp *{box-sizing:border-box}" +
    ".rp-top{position:sticky;top:0;z-index:5;background:var(--vino,#4a1519);color:var(--crema,#efe6d3);margin:-12px -12px 12px;padding:10px 12px;display:grid;gap:8px}" +
    ".rp-top b{font-size:18px}.rp-fila{display:flex;gap:8px;align-items:center;justify-content:space-between}" +
    ".rp-sw{display:flex;gap:6px}.rp-sw button{flex:1;min-height:44px;border-radius:10px;font-weight:800;background:rgba(255,255,255,.14);color:#fff}" +
    ".rp-sw button.on{background:var(--crema,#efe6d3);color:var(--vino,#4a1519)}" +
    ".rp-aviso{background:var(--naranja,#c46a12);color:#fff;padding:8px 12px;border-radius:10px;font-weight:700;font-size:14px}" +
    ".rp h2{font-size:15px;margin:16px 2px 8px;text-transform:uppercase;letter-spacing:.06em;color:var(--gris,#6f5f57)}" +
    ".rp-card{background:#fff;border:1px solid var(--linea,#dccdb0);border-left:6px solid var(--oro,#a9803f);border-radius:14px;padding:12px;margin-bottom:12px;display:grid;gap:8px}" +
    ".rp-card.oferta{border-left-color:var(--rojo,#b6232a);box-shadow:0 0 0 3px rgba(182,35,42,.15)}.rp-card.camino{border-left-color:var(--verde,#2f7a3a)}" +
    ".rp-num{font:800 24px/1 var(--sans,sans-serif);color:var(--vino,#4a1519)}.rp-nota{font-size:14px;color:var(--gris,#6f5f57)}.rp-dir{font-size:18px;font-weight:700}" +
    ".rp-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:56px;border-radius:14px;font-size:18px;font-weight:800;text-decoration:none;text-align:center;background:var(--vino,#4a1519);color:#fff;border:0}" +
    ".rp-btn.sec{background:var(--crema-2,#e6dac0);color:var(--vino,#4a1519)}.rp-btn.ok{background:var(--verde,#2f7a3a)}.rp-btn.mal{background:#fff;color:var(--rojo,#b6232a);border:2px solid var(--rojo,#b6232a)}" +
    ".rp-btn[disabled]{opacity:.5}.rp-dos{display:grid;grid-template-columns:1fr 1fr;gap:8px}" +
    ".rp-cobro{background:#fbf3de;border-radius:12px;padding:10px;display:grid;gap:8px}.rp-cobro input,.rp-prob select,.rp-prob input{width:100%;min-height:50px;font-size:20px;padding:0 12px;border:2px solid var(--linea,#dccdb0);border-radius:10px;font-family:inherit;-webkit-user-select:text;user-select:text}" +
    ".rp-rap{display:flex;gap:6px;flex-wrap:wrap}.rp-rap button{flex:1;min-width:64px;min-height:44px;border-radius:10px;background:#fff;border:2px solid var(--oro,#a9803f);font-weight:800}" +
    ".rp-vuelto{font-size:22px;font-weight:800;color:var(--verde,#2f7a3a)}.rp-pend{font-size:13px;font-weight:700;color:var(--naranja,#c46a12)}.rp-vacio{text-align:center;color:var(--gris,#6f5f57);padding:28px 8px}";

  function iniciar(ctx) {
    var h = ctx.h, api = ctx.api, app = ctx.contenedor;
    var E = leer(K_ESTADO, null), cola = leer(K_COLA, []), enviando = false, sinRed = false, desfase = 0, abierto = {};   // abierto: tarjetas con el formulario de problema desplegado
    var timerSondeo = null, timerCuenta = null, timerReintento = null, ultimoPitido = "";
    if (!document.getElementById("rp-css")) { var st = document.createElement("style"); st.id = "rp-css"; st.textContent = CSS; document.head.appendChild(st); }
    app.textContent = "";
    var raiz = h("div", "rp"); app.appendChild(raiz);

    function btn(txt, cls, fn) { var b = h("button", "rp-btn" + (cls ? " " + cls : ""), txt); b.type = "button"; if (fn) b.addEventListener("click", fn); return b; }
    function enlace(txt, href, cls, nueva) { var a = h("a", "rp-btn" + (cls ? " " + cls : ""), txt); a.href = href; if (nueva) { a.target = "_blank"; a.rel = "noopener"; } return a; }
    function pendiente(numero) { return cola.some(function (c) { return String(c.body.numero) === String(numero); }); }

    /* ---------- cola con reintentos ---------- */
    function guardarCola() { guardar(K_COLA, cola); }
    function accion(nombre, extra, aviso) {
      var body = { ext: "reparto", accion: nombre };
      Object.keys(extra || {}).forEach(function (k) { body[k] = extra[k]; });
      cola.push({ rid: nuevoRid(), body: body, aviso: aviso || "" }); guardarCola(); pintar(); vaciar();
    }
    function vaciar() {
      if (enviando || !cola.length) return;
      enviando = true;
      var it = cola[0], body = {}; Object.keys(it.body).forEach(function (k) { body[k] = it.body[k]; }); body.t = ctx.token; body.rid = it.rid;
      api(body).then(function (r) {
        enviando = false; sinRed = false; cola.shift(); guardarCola();
        if (r && r.ok) { if (it.aviso) ctx.toast(it.aviso, "ok"); }
        else ctx.toast((r && r.error) || "No se pudo completar.", "mal");
        sondear(); vaciar();
      }).catch(function () {
        enviando = false; sinRed = true; pintar();   // sin señal: se queda en la cola y se reintenta
        clearTimeout(timerReintento); timerReintento = setTimeout(vaciar, 8000);
      });
    }

    /* ---------- sondeo ---------- */
    var ultimoSondeo = 0;
    function sondear() {
      ultimoSondeo = Date.now();
      return api({ ext: "reparto", accion: "estado", t: ctx.token }).then(function (r) {
        sinRed = false;
        if (r && r.ok) { desfase = r.ahora - Date.now(); E = r; guardar(K_ESTADO, r); pintar(); sonar(r); }
        else if (r && r.error) ctx.toast(r.error, "mal");
      }).catch(function () { sinRed = true; pintar(); });
    }
    function sonar(r) {   // vibración suave cuando llega una oferta nueva (no hay push: solo mientras la app está abierta)
      var f = (r.ofrecidos || []).map(function (x) { return x.numero; }).join(",");
      if (f && f !== ultimoPitido && navigator.vibrate) { try { navigator.vibrate([200, 100, 200]); } catch (e) {} }
      ultimoPitido = f;
    }
    function ahora() { return Date.now() + desfase; }

    /* ---------- tarjetas ---------- */
    function cabecera(p, extra) {
      var c = h("div", "rp-fila"), n = h("span", "rp-num", "#" + p.nd);
      c.appendChild(n);
      var d = h("span", "rp-nota", soles(p.total) + (extra ? " · " + extra : "")); c.appendChild(d);
      return c;
    }
    function bloqueDireccion(p, completo) {
      var d = h("div"); d.appendChild(h("div", "rp-dir", p.direccion || "(sin dirección)"));
      if (p.referencia) d.appendChild(h("div", "rp-nota", "Ref.: " + p.referencia));
      if (p.zona) d.appendChild(h("div", "rp-nota", "Zona: " + p.zona));
      if (completo && p.detalle) d.appendChild(h("div", "rp-nota", p.detalle));
      if (completo && p.notas) d.appendChild(h("div", "rp-nota", "Nota: " + p.notas));
      return d;
    }
    function tarjetaOferta(p) {
      var c = h("div", "rp-card oferta");
      c.appendChild(cabecera(p, "Oferta para ti"));
      c.appendChild(h("div", "rp-nota", "Cliente: " + (p.cliente || "—") + (p.cobrar ? " · cobrar " + soles(p.cobrar) + " en efectivo" : "")));
      c.appendChild(bloqueDireccion(p, false));
      var t = h("div", "rp-vuelto", ""); t.setAttribute("data-hasta", p.ofertaHasta || 0); t.setAttribute("aria-live", "off"); c.appendChild(t);
      var d = h("div", "rp-dos");
      d.appendChild(btn("✓ Aceptar", "ok", function () { accion("aceptar", { numero: p.numero }, "Pedido aceptado"); }));
      d.appendChild(btn("No puedo", "mal", function () { accion("rechazar", { numero: p.numero }); }));
      c.appendChild(d);
      if (pendiente(p.numero)) c.appendChild(h("div", "rp-pend", "⏳ Enviando…"));
      return c;
    }
    function tarjetaLibre(p) {
      var c = h("div", "rp-card");
      c.appendChild(cabecera(p, "Disponible"));
      c.appendChild(bloqueDireccion(p, false));
      c.appendChild(btn("Tomar este pedido", "", function () { accion("aceptar", { numero: p.numero }, "Pedido tomado"); }));
      if (pendiente(p.numero)) c.appendChild(h("div", "rp-pend", "⏳ Enviando…"));
      return c;
    }
    function bloqueCobro(p) {
      var c = h("div", "rp-cobro");
      if (p.cobrado) { c.appendChild(h("div", "rp-vuelto", p.recibido ? "Cobrado " + soles(p.cobrar) + " · vuelto " + soles(p.vuelto) : "Sin cobro (ya pagado)")); return c; }
      c.appendChild(h("div", "", "Cobrar en efectivo: " + soles(p.cobrar)));
      var inp = h("input"); inp.type = "text"; inp.inputMode = "decimal"; inp.placeholder = "Cliente paga con S/"; inp.setAttribute("aria-label", "Con cuánto paga el cliente");
      var v = h("div", "rp-vuelto", "");
      function calc() { var x = vuelto(p.cobrar, inp.value); v.textContent = x === null ? (inp.value ? "Falta dinero" : "") : "Vuelto: " + soles(x); ok.disabled = x === null || pendiente(p.numero); }
      var rap = h("div", "rp-rap");
      [["Exacto", p.cobrar], ["S/ 50", 50], ["S/ 100", 100], ["S/ 200", 200]].forEach(function (x) { var b = h("button", "", x[0]); b.type = "button"; b.addEventListener("click", function () { inp.value = String(x[1]); calc(); }); rap.appendChild(b); });
      var ok = btn("Registrar cobro", "ok", function () { accion("cobrar", { numero: p.numero, recibido: inp.value.replace(",", ".") }, "Cobro registrado"); });
      ok.disabled = true; inp.addEventListener("input", calc);
      c.appendChild(inp); c.appendChild(rap); c.appendChild(v); c.appendChild(ok);
      var ya = h("button", "rp-nota", "Ya estaba pagado (no cobrar)"); ya.type = "button"; ya.style.cssText = "text-decoration:underline;min-height:40px";
      ya.addEventListener("click", function () { if (confirm("¿Confirmas que este pedido ya estaba pagado?")) accion("cobrar", { numero: p.numero, yaPagado: true }, "Registrado"); });
      c.appendChild(ya);
      return c;
    }
    function formProblema(p) {
      var f = h("div", "rp-prob"); f.style.cssText = "display:grid;gap:8px";
      var s = h("select"); ["Elige el problema…", "El cliente no responde", "Dirección incorrecta o no la encuentro", "El cliente rechazó el pedido", "Otro"].forEach(function (o, i) { var op = h("option", "", o); op.value = i ? o : ""; s.appendChild(op); });
      var n = h("input"); n.type = "text"; n.maxLength = 200; n.placeholder = "Detalle (opcional)";
      f.appendChild(s); f.appendChild(n);
      f.appendChild(btn("Enviar reporte", "", function () { if (!s.value) return ctx.toast("Elige el tipo de problema.", "mal"); delete abierto[p.numero]; accion("problema", { numero: p.numero, tipo: s.value, nota: n.value }, "Reporte enviado al administrador"); }));
      return f;
    }
    function tarjetaMia(p) {
      var camino = p.estado === "En camino", c = h("div", "rp-card" + (camino ? " camino" : ""));
      c.appendChild(cabecera(p, camino ? "En camino" : "Por recoger"));
      c.appendChild(h("div", "", (p.cliente || "Cliente") + (p.pago ? " · pago: " + p.pago : "")));
      c.appendChild(bloqueDireccion(p, true));
      if (p.etaHasta) c.appendChild(h("div", "rp-nota", "Entrega prometida: " + new Date(p.etaHasta).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })));
      if (p.problema) c.appendChild(h("div", "rp-pend", "⚠ Reportado: " + p.problema));
      var dos = h("div", "rp-dos"), mapa = urlMapa(p.direccion, p.referencia), tel = urlTel(p.telefono);
      if (mapa) dos.appendChild(enlace("📍 Mapa", mapa, "sec", true));
      if (tel) dos.appendChild(enlace("📞 Llamar", tel, "sec"));
      if (dos.children.length) c.appendChild(dos);
      var bloqueado = pendiente(p.numero);
      if (!camino) {
        var s = btn("🛵 Salgo en camino", "", function () { accion("salir", { numero: p.numero }, "En camino"); }); s.disabled = bloqueado; c.appendChild(s);
        c.appendChild(btn("Soltar este pedido", "mal", function () { if (confirm("¿Soltar el pedido #" + p.nd + "? Se ofrecerá a otro repartidor.")) accion("soltar", { numero: p.numero }); }));
      } else {
        if (p.cobrar > 0 || p.cobrado) c.appendChild(bloqueCobro(p));
        var e = btn("✓ Entregado", "ok", function () { accion("entregar", { numero: p.numero }, "¡Entregado!"); });
        e.disabled = bloqueado || (p.cobrar > 0 && !p.cobrado); c.appendChild(e);
        if (p.cobrar > 0 && !p.cobrado) c.appendChild(h("div", "rp-nota", "Registra el cobro para poder marcar la entrega."));
      }
      var pr = btn(abierto[p.numero] ? "Cancelar reporte" : "⚠ Reportar problema", "mal", function () { if (abierto[p.numero]) delete abierto[p.numero]; else abierto[p.numero] = true; pintar(); });
      c.appendChild(pr);
      if (abierto[p.numero]) c.appendChild(formProblema(p));
      if (bloqueado) c.appendChild(h("div", "rp-pend", "⏳ Guardado: se enviará en cuanto haya conexión"));
      return c;
    }

    /* ---------- pantalla ---------- */
    function pintar() {
      var y = window.scrollY;
      if (document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) && raiz.contains(document.activeElement)) return;   // no borres lo que escribe
      raiz.textContent = "";
      var top = h("div", "rp-top"), fila = h("div", "rp-fila");
      fila.appendChild(h("b", "", "🛵 " + (ctx.mozo && ctx.mozo.nombre || "Repartidor"))); fila.appendChild(h("span", "rp-nota", E && E.perfil && E.perfil.vehiculo || ""));
      top.appendChild(fila);
      var est = E && E.perfil ? E.perfil.estado : "";
      var sw = h("div", "rp-sw"), b1 = h("button", est === "descanso" ? "" : "on", "Disponible"), b2 = h("button", est === "descanso" ? "on" : "", "Descanso");
      b1.type = b2.type = "button";
      b1.addEventListener("click", function () { accion("disponibilidad", { estado: "disponible" }); });
      b2.addEventListener("click", function () { accion("disponibilidad", { estado: "descanso" }); });
      sw.appendChild(b1); sw.appendChild(b2); top.appendChild(sw);
      if (est === "en ruta") { var er = h("div", "rp-nota", "En ruta"); er.style.color = "#efe6d3"; top.appendChild(er); }
      if (sinRed || cola.length) top.appendChild(h("div", "rp-aviso", sinRed ? "Sin conexión" + (cola.length ? " · " + cola.length + " acción(es) por enviar (se reintentan solas)" : " · mostrando lo último guardado") : "Enviando…"));
      raiz.appendChild(top);
      if (!E) { raiz.appendChild(h("p", "rp-vacio", "Cargando…")); return; }
      var hay = false;
      if (E.ofrecidos && E.ofrecidos.length) { hay = true; raiz.appendChild(h("h2", "", "Te ofrecieron")); E.ofrecidos.forEach(function (p) { raiz.appendChild(tarjetaOferta(p)); }); }
      if (E.mios && E.mios.length) { hay = true; raiz.appendChild(h("h2", "", "Mis pedidos")); E.mios.forEach(function (p) { raiz.appendChild(tarjetaMia(p)); }); }
      if (E.libres && E.libres.length && est !== "descanso") { hay = true; raiz.appendChild(h("h2", "", "Pedidos listos")); E.libres.forEach(function (p) { raiz.appendChild(tarjetaLibre(p)); }); }
      if (!hay) raiz.appendChild(h("p", "rp-vacio", est === "descanso" ? "Estás en descanso. Toca \"Disponible\" para recibir pedidos." : "Sin pedidos por ahora. Esta pantalla se actualiza sola."));
      var salirB = h("button", "rp-nota", "Cerrar sesión de este equipo"); salirB.type = "button"; salirB.style.cssText = "margin:18px auto;display:block;text-decoration:underline;min-height:44px";
      salirB.addEventListener("click", function () { if (confirm("¿Salir? Para volver a entrar necesitas pedir un enlace nuevo al administrador.")) ctx.salir(); });
      raiz.appendChild(salirB);
      window.scrollTo(0, y); cuenta();
    }
    function cuenta() {   // cuenta regresiva de las ofertas
      raiz.querySelectorAll("[data-hasta]").forEach(function (e) {
        var hasta = Number(e.getAttribute("data-hasta")), rest = hasta - ahora();
        e.textContent = rest > 0 ? "Responde en " + minSeg(rest) : "Venció la oferta…";
        e.setAttribute("data-vencida", rest <= 0 ? "1" : "");
      });
    }

    /* ---------- arranque ---------- */
    pintar(); sondear(); vaciar();
    timerSondeo = setInterval(function () { if (document.visibilityState !== "hidden") sondear(); }, 8000);
    timerCuenta = setInterval(function () {
      cuenta();
      if (raiz.querySelector("[data-vencida='1']") && Date.now() - ultimoSondeo > 3000) sondear();
    }, 1000);
    window.addEventListener("online", function () { sinRed = false; vaciar(); sondear(); });
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") { vaciar(); sondear(); } });
  }
  window.PG_APP_REPARTIDOR = { iniciar: iniciar };
})();
