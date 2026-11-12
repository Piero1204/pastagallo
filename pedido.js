/* Pasta Gallo · ficha de producto, carrito y envío de pedidos (delivery, recojo y mesa).
   No necesitas editar este archivo: todo se configura desde el panel. */
(function () {
  "use strict";
  var C = window.CARTA, CFG = C.pedidos || {}, GRUPOS = C.opciones || {};
  var I = window.PG_I18N, t = I.t, tx = I.tx;
  var MODO = window.MODO === "mesa" ? "mesa" : "delivery";
  var params = new URLSearchParams(location.search);
  var MESA = MODO === "mesa" ? (params.get("m") || "").slice(0, 6) : "";
  var CODIGO = MODO === "mesa" ? (params.get("c") || "").slice(0, 20) : "";
  var CLAVE = "pg-carrito-" + MODO + (MESA ? "-" + MESA : "");
  var carrito = [];
  var P, h; // utilidades de app.js

  function origen() { try { return sessionStorage.getItem("pg-origen") || ""; } catch (e) { return ""; } }
  function guardar() { try { localStorage.setItem(CLAVE, JSON.stringify({ t: Date.now(), c: carrito })); } catch (e) {} }
  function cargar() {
    try {
      var o = JSON.parse(localStorage.getItem(CLAVE) || "null");
      if (o && Date.now() - o.t < 6 * 3600 * 1000 && Array.isArray(o.c)) carrito = o.c;
    } catch (e) { carrito = []; }
  }

  var productos = {}, seccionDe = {};
  C.secciones.forEach(function (s) {
    s.grupos.forEach(function (g) { g.items.forEach(function (it) { productos[it.id] = it; seccionDe[it.id] = s; }); });
  });
  var salsas = (C.salsas || []).filter(function (s) { return !s.agotado; });
  var salsaPorId = {}; salsas.forEach(function (s) { salsaPorId[s.id] = s; });

  /* ---------- reglas ---------- */
  function abiertoAhora() { return P.estadoActual().abierto; }
  function mesaValida() { return MODO !== "mesa" || (MESA && CODIGO); }
  function activo() {
    if (!CFG.activos) return false;
    if (MODO === "mesa") return !!(CFG.api && CFG.mesaActivos && mesaValida());
    return true; // sin api, el delivery funciona solo por WhatsApp
  }
  function aceptaAhora() {
    if (!activo()) return false;
    if (abiertoAhora()) return true;
    return MODO === "delivery" && !!CFG.fueraHorario;
  }
  function motivoNoPedible(it, sec) {
    if (it.agotado) return t("agotado");
    if (it.promo && !it._hoy) return t("promoOtroDia", { c: it._cuando });
    if (it.promo && it._hora) return t("promoHora", { c: it._cuando });
    if (it.canal === "local" && MODO !== "mesa") return t("soloLocalTxt");
    if (it.canal === "delivery" && MODO === "mesa") return t("soloDeliveryTxt");
    if (it.p == null && !(it.t && it.t.length)) return t("consulta");
    if (!activo() || (MODO === "mesa" ? !sec.mesa : !sec.delivery)) return t("noPedible");
    return "";
  }
  function puedePedir(it, sec) {
    if (it.tipo === "salsa") return false;
    if (it.salsa && !salsas.length) return false;
    return !motivoNoPedible(it, sec);
  }
  function gruposDe(it, salsaId) {
    var ids = (it.op || []).slice();
    var s = salsaPorId[salsaId];
    if (s && s.op) s.op.forEach(function (g) { if (ids.indexOf(g) < 0) ids.push(g); });
    return ids.filter(function (g) { return GRUPOS[g]; });
  }
  function tieneOpciones(it) { return !!(it.t || it.salsa || (it.op && it.op.length)); }

  /* ---------- dinero ---------- */
  function soles(n) { return "S/ " + Number(n).toFixed(2); }
  function total() { return carrito.reduce(function (a, l) { return a + l.unit * l.cant; }, 0); }
  function unidades() { return carrito.reduce(function (a, l) { return a + l.cant; }, 0); }

  /* ---------- hoja (ventana inferior) ---------- */
  function boton(texto, cls, fn) { var b = h("button", cls, texto); b.type = "button"; b.addEventListener("click", fn); return b; }
  var capa, hoja, barra, barraTxt, barraTot, ultimoFoco;
  function abrirHoja(contenido, titulo, cls) {
    ultimoFoco = document.activeElement;
    hoja.textContent = "";
    hoja.className = "hoja" + (cls ? " " + cls : "");
    var cab = h("div", "hoja__cab");
    cab.appendChild(h("h2", null, titulo));
    var x = boton("×", "hoja__x", cerrarHoja); x.setAttribute("aria-label", t("cerrar"));
    cab.appendChild(x);
    hoja.appendChild(cab);
    hoja.appendChild(contenido);
    hoja.setAttribute("aria-label", titulo);
    hoja.scrollTop = 0;
    capa.classList.add("on");
    document.body.classList.add("sin-scroll");
    setTimeout(function () { x.focus(); }, 60);
  }
  function cerrarHoja() {
    capa.classList.remove("on");
    document.body.classList.remove("sin-scroll");
    if (ultimoFoco && ultimoFoco.focus) ultimoFoco.focus();
  }

  function stepper(valor, min, max, alCambiar) {
    var w = h("div", "stepper");
    var menos = boton("−", "", function () { if (valor > min) { valor--; out.textContent = valor; alCambiar(valor); } });
    var mas = boton("+", "", function () { if (valor < max) { valor++; out.textContent = valor; alCambiar(valor); } });
    menos.setAttribute("aria-label", t("quitarUno")); mas.setAttribute("aria-label", t("agregarUno"));
    var out = h("output", null, String(valor)); out.setAttribute("aria-live", "polite");
    w.appendChild(menos); w.appendChild(out); w.appendChild(mas);
    return w;
  }

  function opcionesUI(nombre, opciones, multiple, alCambiar) {
    var w = h("div", "opciones"); w.setAttribute("role", multiple ? "group" : "radiogroup");
    opciones.forEach(function (o) {
      var l = h("label", "opcion");
      var r = h("input"); r.type = multiple ? "checkbox" : "radio"; r.name = nombre; r.value = o.valor;
      if (o.marcado) r.checked = true;
      r.addEventListener("change", function () {
        var marcados = Array.prototype.slice.call(w.querySelectorAll("input:checked")).map(function (x) { return x.value; });
        alCambiar(marcados);
      });
      l.appendChild(r);
      l.appendChild(h("span", "opcion__t", o.texto));
      if (o.extra) l.appendChild(h("span", "opcion__p", o.extra));
      w.appendChild(l);
    });
    return w;
  }

  /* ---------- ficha del producto (detalle + opciones) ---------- */
  function abrirDetalle(it, sec) {
    var c = h("div", "hoja__cuerpo");
    if (it.foto) {
      var im = h("img", "detalle__foto"); im.src = it.foto; im.alt = tx(it, "n");
      im.onerror = function () { im.remove(); };
      c.appendChild(im);
    }
    if (tx(it, "g")) c.appendChild(h("p", "detalle__g", tx(it, "g")));
    if (tx(it, "d")) c.appendChild(h("p", "hoja__desc", tx(it, "d")));
    var inc = I.lang === "en" && it.inc_en ? it.inc_en : it.inc;
    if (inc && inc.length) {
      c.appendChild(h("h3", "hoja__sub", t("incluye")));
      var ul = h("ul", "incluye"); inc.forEach(function (x) { ul.appendChild(h("li", null, x)); }); c.appendChild(ul);
      if (it._cuando) c.appendChild(h("p", "detalle__g", t("disponible") + it._cuando));
    }
    if (it.destacado === "tris" && P.diagramaTris) c.appendChild(P.diagramaTris());
    if (it.al && it.al.length) {
      var al = h("ul", "detalle__al");
      it.al.forEach(function (k) {
        if (!P.ICONOS[k]) return;
        var li = h("li"); li.appendChild(P.iconoSvg(k)); li.appendChild(document.createTextNode(I.alergeno(k, C))); al.appendChild(li);
      });
      c.appendChild(h("h3", "hoja__sub", t("alergenos"))); c.appendChild(al);
    }

    var motivo = motivoNoPedible(it, sec);
    var sinAbrir = !motivo && !aceptaAhora();
    if (motivo || sinAbrir || it.tipo === "salsa") {
      if (it.t) {
        var tb = h("div", "tam");
        it.t.forEach(function (x) { var d = h("div"); d.appendChild(h("span", null, x[0])); d.appendChild(P.precioEl(x[1])); tb.appendChild(d); });
        c.appendChild(tb);
      } else if (it.p != null) {
        var pr = h("div", "detalle__precio"); pr.appendChild(P.precioEl(it.p)); c.appendChild(pr);
      }
      if (it.tipo !== "salsa") c.appendChild(h("p", "detalle__aviso", motivo || (MODO === "mesa" ? t("cerradoMesa") : t("cerradoAviso"))));
      c.appendChild(boton(t("volver"), "btn-ped btn-ped--linea", cerrarHoja));
      abrirHoja(c, tx(it, "n"), "hoja--detalle");
      return;
    }

    var sel = { tam: it.t ? it.t[0][0] : "", salsa: "", cant: 1, nota: "", ops: {} };
    var err = h("p", "hoja__err"); err.setAttribute("role", "alert");
    var add;
    function precioUnit() {
      var base = it.t ? (it.t.filter(function (x) { return x[0] === sel.tam; })[0] || it.t[0])[1] : it.p;
      var s = salsaPorId[sel.salsa];
      var extra = s ? s.extra : 0;
      gruposDe(it, sel.salsa).forEach(function (gid) {
        (sel.ops[gid] || []).forEach(function (nm) {
          var o = GRUPOS[gid].ops.filter(function (x) { return x.n === nm; })[0];
          if (o) extra += o.p;
        });
      });
      return base + extra;
    }
    function pintar() { add.textContent = t("agregar") + " · " + soles(precioUnit() * sel.cant); err.textContent = ""; }

    function bloqueGrupo(gid) {
      var g = GRUPOS[gid];
      var w = h("div", "grupo-op");
      w.appendChild(h("h3", "hoja__sub", tx(g, "n") + (g.req ? "" : " (" + t("opcional") + ")")));
      w.appendChild(opcionesUI("g-" + gid, g.ops.map(function (o) {
        return { valor: o.n, texto: tx(o, "n"), extra: o.p ? t("masPrecio") + Number(o.p).toFixed(2) : "",
          marcado: (sel.ops[gid] || []).indexOf(o.n) >= 0 };
      }), g.tipo === "varias", function (v) { sel.ops[gid] = v; pintar(); }));
      return w;
    }

    if (it.t) {
      c.appendChild(h("h3", "hoja__sub", t("tamano")));
      c.appendChild(opcionesUI("tam", it.t.map(function (x, i) { return { valor: x[0], texto: x[0], extra: soles(x[1]), marcado: i === 0 }; }),
        false, function (v) { sel.tam = v[0]; pintar(); }));
    }
    var zonaSalsa = h("div");
    if (it.salsa) {
      c.appendChild(h("h3", "hoja__sub", t("eligeSalsa")));
      if (/tris/.test(it.id)) c.appendChild(h("p", "hoja__ayuda", t("salsaTris")));
      c.appendChild(opcionesUI("salsa", salsas.map(function (s) {
        var sp = productos[s.id];
        return { valor: s.id, texto: sp ? tx(sp, "n") : s.n, extra: s.extra ? t("masPrecio") + Number(s.extra).toFixed(2) : "" };
      }), false, function (v) {
        // limpiar opciones de la salsa anterior
        Object.keys(sel.ops).forEach(function (g) { if ((it.op || []).indexOf(g) < 0) delete sel.ops[g]; });
        sel.salsa = v[0];
        zonaSalsa.textContent = "";
        var s = salsaPorId[sel.salsa];
        (s && s.op || []).forEach(function (gid) { if (GRUPOS[gid] && (it.op || []).indexOf(gid) < 0) zonaSalsa.appendChild(bloqueGrupo(gid)); });
        pintar();
      }));
      c.appendChild(zonaSalsa);
    }
    (it.op || []).forEach(function (gid) { if (GRUPOS[gid]) c.appendChild(bloqueGrupo(gid)); });

    c.appendChild(h("h3", "hoja__sub", t("indicaciones")));
    var nota = h("input", "campo"); nota.type = "text"; nota.maxLength = 120; nota.placeholder = t("indicacionesPh");
    nota.addEventListener("input", function () { sel.nota = nota.value; });
    c.appendChild(nota);
    c.appendChild(err);
    var pie = h("div", "hoja__pie");
    pie.appendChild(stepper(1, 1, 20, function (v) { sel.cant = v; pintar(); }));
    add = boton("", "btn-ped", function () {
      if (it.salsa && !sel.salsa) { err.textContent = t("eligeSalsaErr"); return; }
      var falta = gruposDe(it, sel.salsa).filter(function (g) { return GRUPOS[g].req && !(sel.ops[g] || []).length; })[0];
      if (falta) { err.textContent = t("eligeAlgo", { g: tx(GRUPOS[falta], "n").toLowerCase() }); return; }
      agregar(it, sel, precioUnit());
      cerrarHoja();
    });
    pie.appendChild(add);
    c.appendChild(pie);
    pintar();
    abrirHoja(c, tx(it, "n"), "hoja--detalle");
  }

  function textoOpciones(it, sel, en) {
    var r = [];
    gruposDe(it, sel.salsa).forEach(function (gid) {
      var vals = sel.ops[gid] || []; if (!vals.length) return;
      var g = GRUPOS[gid];
      r.push((en ? tx(g, "n") : g.n) + ": " + vals.map(function (nm) {
        var o = g.ops.filter(function (x) { return x.n === nm; })[0];
        return (en && o ? tx(o, "n") : nm) + (o && o.p ? " (+" + soles(o.p) + ")" : "");
      }).join(", "));
    });
    return r;
  }

  function agregar(it, sel, unit) {
    var s = salsaPorId[sel.salsa];
    var ops = {};
    gruposDe(it, sel.salsa).forEach(function (g) { if ((sel.ops[g] || []).length) ops[g] = sel.ops[g].slice(); });
    var key = [it.id, sel.tam, sel.salsa, JSON.stringify(ops), sel.nota].join("|");
    var ex = carrito.filter(function (l) { return l.key === key; })[0];
    if (ex) ex.cant = Math.min(20, ex.cant + sel.cant);
    else carrito.push({ key: key, id: it.id, n: tx(it, "n"), nEs: it.n, tam: sel.tam, salsa: sel.salsa,
      salsaN: s ? (productos[s.id] ? tx(productos[s.id], "n") : s.n) : "", salsaEs: s ? s.n : "",
      ops: ops, opsTxt: textoOpciones(it, sel, true), opsEs: textoOpciones(it, sel, false),
      unit: unit, cant: sel.cant, nota: (sel.nota || "").trim(), alcohol: !!(seccionDe[it.id] && seccionDe[it.id].alcohol) });
    guardar(); pintarBarra(true);
    aviso(t("agregado", { n: tx(it, "n") }));
  }

  function clicAgregar(it, sec) {
    if (!aceptaAhora()) { aviso(MODO === "mesa" ? t("cerradoMesa") : t("cerradoAviso")); return; }
    if (tieneOpciones(it)) abrirDetalle(it, sec);
    else agregar(it, { tam: "", salsa: "", cant: 1, nota: "", ops: {} }, it.p);
  }

  /* ---------- aviso flotante ---------- */
  var toast, toastT;
  function aviso(txt) {
    toast.textContent = txt; toast.classList.add("on");
    clearTimeout(toastT); toastT = setTimeout(function () { toast.classList.remove("on"); }, 2200);
  }

  /* ---------- barra del carrito ---------- */
  function pintarBarra(animar) {
    var n = unidades();
    barra.classList.toggle("on", n > 0);
    document.body.classList.toggle("con-carrito", n > 0);
    barraTxt.textContent = t("verPedido") + n + (n === 1 ? t("producto") : t("productos"));
    barraTot.textContent = soles(total());
    if (animar) { barra.classList.remove("pulso"); void barra.offsetWidth; barra.classList.add("pulso"); }
  }

  /* ---------- carrito y formulario ---------- */
  var form = {};
  function abrirCarrito() {
    var c = h("div", "hoja__cuerpo");
    if (!carrito.length) { c.appendChild(h("p", "hoja__desc", t("vacio"))); abrirHoja(c, t("tuPedido")); return; }
    var lista = h("ul", "lineas");
    var tot = h("strong");
    function pintarLista() {
      lista.textContent = "";
      carrito.forEach(function (l, i) {
        var li = h("li", "linea");
        var info = h("div", "linea__info");
        info.appendChild(h("strong", null, l.n + (l.tam ? " · " + l.tam : "")));
        if (l.salsaN) info.appendChild(h("span", null, t("salsa") + l.salsaN));
        (l.opsTxt || []).forEach(function (o) { info.appendChild(h("span", null, o)); });
        if (l.nota) info.appendChild(h("span", null, t("nota") + l.nota));
        info.appendChild(h("span", "linea__p", soles(l.unit * l.cant)));
        li.appendChild(info);
        li.appendChild(stepper(l.cant, 0, 20, function (v) {
          if (v === 0) carrito.splice(i, 1); else l.cant = v;
          guardar(); pintarBarra(); if (!carrito.length) { cerrarHoja(); return; } pintarLista();
        }));
        lista.appendChild(li);
      });
      tot.textContent = soles(total());
    }
    c.appendChild(lista);
    var tl = h("div", "total"); tl.appendChild(h("span", null, MODO === "mesa" ? t("total") : t("totalProd"))); tl.appendChild(tot);
    c.appendChild(tl);
    pintarLista();
    c.appendChild(formulario());
    abrirHoja(c, MODO === "mesa" ? t("pedidoMesa") + MESA : t("tuPedido"));
  }

  function campo(nombre, etiqueta, tipo, opc) {
    opc = opc || {};
    var w = h("label", "campo-w");
    w.appendChild(h("span", "campo-l", etiqueta));
    var i = tipo === "area" ? h("textarea", "campo") : h("input", "campo");
    if (tipo !== "area") i.type = tipo || "text";
    i.name = nombre; i.value = form[nombre] || ""; i.maxLength = opc.max || 120;
    if (opc.ph) i.placeholder = opc.ph;
    if (opc.auto) i.autocomplete = opc.auto;
    if (opc.modo) i.inputMode = opc.modo;
    i.addEventListener("input", function () { form[nombre] = i.value; });
    w.appendChild(i);
    return w;
  }

  function formulario() {
    var f = h("form", "form"); f.noValidate = true;
    var hp = h("input", "trampa"); hp.name = "web"; hp.tabIndex = -1; hp.autocomplete = "off"; hp.setAttribute("aria-hidden", "true");
    f.appendChild(hp);
    var zona = h("div");
    if (MODO === "mesa") {
      f.appendChild(campo("nombre", t("aNombre"), "text", { max: 60, auto: "given-name" }));
      f.appendChild(campo("notas", t("comentCocina"), "area", { max: 300 }));
    } else {
      if (!form.canal || !CFG.recojo) form.canal = "delivery";
      if (CFG.recojo) {
        f.appendChild(h("h3", "hoja__sub", t("comoLoQuieres")));
        f.appendChild(opcionesUI("canal", [
          { valor: "delivery", texto: t("delivery"), marcado: form.canal === "delivery" },
          { valor: "recojo", texto: t("recojo"), marcado: form.canal === "recojo" }
        ], false, function (v) { form.canal = v[0]; pintarZona(); }));
      }
      f.appendChild(zona);
      f.appendChild(campo("nombre", t("nombre"), "text", { max: 60, auto: "name" }));
      f.appendChild(campo("telefono", t("celular"), "tel", { max: 16, auto: "tel", modo: "tel", ph: "9XX XXX XXX" }));
      if (CFG.metodosPago && CFG.metodosPago.length) {
        f.appendChild(h("h3", "hoja__sub", t("comoPagar")));
        f.appendChild(opcionesUI("pago", CFG.metodosPago.map(function (m) { return { valor: m, texto: m, marcado: form.pago === m }; }),
          false, function (v) { form.pago = v[0]; }));
      }
      if (!abiertoAhora() || form.programado) {
        f.appendChild(campo("programado", abiertoAhora() ? t("paraHora") : t("paraHoraReq"), "time", {}));
      }
      f.appendChild(campo("notas", t("comentarios"), "area", { max: 300 }));
      if (carrito.some(function (l) { return l.alcohol; })) {
        var lb = h("label", "check");
        var ck = h("input"); ck.type = "checkbox"; ck.checked = !!form.mayorEdad;
        ck.addEventListener("change", function () { form.mayorEdad = ck.checked; });
        lb.appendChild(ck); lb.appendChild(h("span", null, t("mayor")));
        f.appendChild(lb);
      }
    }
    function pintarZona() {
      zona.textContent = "";
      if (MODO === "mesa" || form.canal !== "delivery") {
        if (form.canal === "recojo") zona.appendChild(h("p", "hoja__ayuda", t("recogeEn") + C.negocio.direccion + "."));
        return;
      }
      zona.appendChild(campo("direccion", t("direccion"), "text", { max: 200, auto: "street-address" }));
      zona.appendChild(campo("referencia", t("referencia"), "text", { max: 200, ph: t("referenciaPh") }));
      var td = I.lang === "en" && CFG.textoDelivery_en ? CFG.textoDelivery_en : CFG.textoDelivery;
      if (td) zona.appendChild(h("p", "hoja__ayuda", td));
    }
    pintarZona();
    var err = h("p", "hoja__err"); err.setAttribute("role", "alert");
    f.appendChild(err);
    f.addEventListener("input", function () { err.textContent = ""; });
    f.addEventListener("change", function () { err.textContent = ""; });
    var enviar = h("button", "btn-ped", MODO === "mesa" ? t("enviarCocina") : t("enviar"));
    enviar.type = "submit";
    f.appendChild(enviar);
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var e = validar();
      if (e) { err.textContent = e; return; }
      enviar.disabled = true; enviar.textContent = t("enviando");
      enviarPedido(hp.value).then(function (r) {
        enviar.disabled = false; enviar.textContent = MODO === "mesa" ? t("enviarCocina") : t("enviar");
        if (r && r.error) err.textContent = r.error;
      });
    });
    return f;
  }

  function validar() {
    if (!carrito.length) return t("vacio");
    if (MODO === "mesa") return "";
    if (!form.nombre || form.nombre.trim().length < 2) return t("errNombre");
    if (String(form.telefono || "").replace(/\D/g, "").length < 9) return t("errCel");
    if (form.canal === "delivery" && (!form.direccion || form.direccion.trim().length < 5)) return t("errDir");
    if (CFG.metodosPago && CFG.metodosPago.length && !form.pago) return t("errPago");
    if (!abiertoAhora() && !form.programado) return t("errHora");
    if (carrito.some(function (l) { return l.alcohol; }) && !form.mayorEdad) return t("errMayor");
    return "";
  }

  function cuerpoPedido(trampa) {
    return {
      canal: MODO === "mesa" ? "mesa" : form.canal, mesa: MESA, codigo: CODIGO, web: trampa || "", idioma: I.lang,
      nombre: form.nombre || "", telefono: form.telefono || "", direccion: form.canal === "delivery" ? (form.direccion || "") : "",
      referencia: form.canal === "delivery" ? (form.referencia || "") : "", pago: form.pago || "",
      programado: form.programado || "", notas: form.notas || "", mayorEdad: !!form.mayorEdad, origen: origen(),
      items: carrito.map(function (l) { return { id: l.id, tam: l.tam, salsa: l.salsa, cant: l.cant, nota: l.nota, ops: l.ops || {} }; })
    };
  }

  // El mensaje de WhatsApp siempre va en español: lo lee el equipo del restaurante.
  function mensajeWhatsapp(numero, totalServidor, detalle) {
    var L = [];
    L.push("Hola " + C.negocio.nombre + ", quiero confirmar mi pedido" + (numero ? " #" + numero : "") + ".");
    L.push(form.canal === "recojo" ? "*Recojo en el local*" : "*Delivery*");
    L.push("");
    if (detalle) L.push(detalle);
    else carrito.forEach(function (l) {
      L.push(l.cant + " × " + (l.nEs || l.n) + (l.tam ? " (" + l.tam + ")" : "") + " — " + soles(l.unit * l.cant));
      if (l.salsaEs) L.push("    Salsa: " + l.salsaEs);
      (l.opsEs || []).forEach(function (o) { L.push("    " + o); });
      if (l.nota) L.push("    Nota: " + l.nota);
    });
    L.push("");
    L.push("*Total productos: " + soles(totalServidor != null ? totalServidor : total()) + "*" + (form.canal === "delivery" ? " (+ delivery)" : ""));
    L.push("Nombre: " + (form.nombre || ""));
    L.push("Celular: " + (form.telefono || ""));
    if (form.canal === "delivery") {
      L.push("Dirección: " + (form.direccion || ""));
      if (form.referencia) L.push("Referencia: " + form.referencia);
    }
    if (form.pago) L.push("Pago: " + form.pago);
    L.push("Para: " + (form.programado ? "las " + form.programado : "lo antes posible"));
    if (form.notas) L.push("Comentarios: " + form.notas);
    if (I.lang === "en") L.push("(Cliente en inglés)");
    return "https://wa.me/" + C.negocio.whatsapp + "?text=" + encodeURIComponent(L.join("\n"));
  }

  function enviarPedido(trampa) {
    var cuerpo = cuerpoPedido(trampa);
    if (!CFG.api) { exito(null, null, null, true); return Promise.resolve({}); }
    var ctrl = window.AbortController ? new AbortController() : null;
    var tm = setTimeout(function () { if (ctrl) ctrl.abort(); }, 25000);
    return fetch(CFG.api, { method: "POST", body: JSON.stringify(cuerpo), signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        clearTimeout(tm);
        if (!r || !r.ok) return { error: (r && r.error) || t("errEnvio") };
        exito(r.numero, r.total, r.detalle, false);
        return {};
      })
      .catch(function () {
        clearTimeout(tm);
        if (MODO === "mesa") return { error: t("errCocina") };
        exito(null, null, null, true);
        return {};
      });
  }

  function exito(numero, totalServidor, detalle, soloWhatsapp) {
    var c = h("div", "hoja__cuerpo exito");
    c.appendChild(h("div", "exito__ic", "✓"));
    if (MODO === "mesa") {
      c.appendChild(h("h3", null, t("enviadoMesa", { n: numero })));
      c.appendChild(h("p", null, t("mozoConfirma") + soles(totalServidor)));
      c.appendChild(boton(t("volver"), "btn-ped", cerrarHoja));
    } else {
      var url = mensajeWhatsapp(numero, totalServidor, detalle);
      c.appendChild(h("h3", null, soloWhatsapp ? t("ultimoPaso") : t("recibido", { n: numero })));
      c.appendChild(h("p", null, soloWhatsapp ? t("envianosWa") : t("confirmaWa")));
      var a = h("a", "btn-ped btn-ped--wa", t("enviarWa")); a.href = url; a.target = "_blank"; a.rel = "noopener";
      c.appendChild(a);
      c.appendChild(h("p", "hoja__ayuda", t("respondemos", { d: form.canal === "delivery" ? t("conDelivery") : "" })));
    }
    carrito = []; guardar(); pintarBarra();
    abrirHoja(c, MODO === "mesa" ? t("mesa") + MESA : t("tuPedido"));
  }

  /* ---------- API para app.js ---------- */
  window.PG_PEDIDO = {
    modo: MODO, mesa: MESA,
    activo: function () { return activo(); },
    aceptaAhora: function () { return aceptaAhora(); },
    mesaValida: mesaValida,
    puedePedir: puedePedir,
    abrirDetalle: function (it, sec) { abrirDetalle(it, sec); },
    boton: function (it, sec) {
      var b = h("button", "agregar"); b.type = "button";
      b.appendChild(h("span", null, "+")); b.appendChild(document.createTextNode(" " + t("agregar")));
      b.setAttribute("aria-label", t("agregarA", { n: tx(it, "n") }));
      b.addEventListener("click", function (ev) { ev.stopPropagation(); clicAgregar(it, sec); });
      return b;
    },
    iniciar: function (utils) {
      P = utils; h = P.h;
      cargar();
      carrito = carrito.filter(function (l) { var it = productos[l.id]; return it && !it.agotado; });
      capa = h("div", "capa");
      hoja = h("div", "hoja"); hoja.setAttribute("role", "dialog"); hoja.setAttribute("aria-modal", "true");
      capa.appendChild(hoja);
      capa.addEventListener("click", function (e) { if (e.target === capa) cerrarHoja(); });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape" && capa.classList.contains("on")) cerrarHoja(); });
      document.body.appendChild(capa);
      barra = h("button", "barra-ped"); barra.type = "button";
      barraTxt = h("span"); barraTot = h("strong");
      barra.appendChild(barraTxt); barra.appendChild(barraTot);
      barra.addEventListener("click", abrirCarrito);
      document.body.appendChild(barra);
      toast = h("div", "toast"); toast.setAttribute("role", "status"); document.body.appendChild(toast);
      pintarBarra();
    }
  };
})();
