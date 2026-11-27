/* Pasta Gallo · búsqueda inteligente y pedido por texto/voz (módulo "busqueda").
   100 % en el navegador, sin dependencias. Solo se carga si CARTA.ext.busqueda existe (interruptor modulo_busqueda).
   Parte 1: intérprete de pedidos en lenguaje natural (lee SOLO los productos reales de CARTA; no inventa platos).
   Parte 2: pantalla de pedido rápido (texto o voz) con revisión obligatoria antes de agregar al carrito.
   Parte 3: caja de búsqueda tolerante a errores y sinónimos (se suma a la lupa de la carta). */
(function (root) {
  "use strict";

  /* =====================================================================
     PARTE 1 · INTÉRPRETE
     ===================================================================== */
  var STOP = {};
  ("de del di della dello delle dei degli al a ai agli alla alle all dell la el lo los las le il e y con en un una uno unos unas o u para por que me mi tu se es ya al " +
   "mas tambien ademas luego despues entonces pues eh este esta ese esa otro otra otros otras")
    .split(" ").forEach(function (w) { if (w) STOP[w] = 1; });
  var FILLER = {};
  ("quiero quisiera quisieramos queremos queria deseo desearia necesito necesitamos pedir pido pedimos pedido dame damelo deme dime pon ponme ponga agrega agregame agregar anade anadir " +
   "sumale manda mandame envia enviame traeme traer tienen hay porfa porfavor favor gracias hola buenas buenos buen noches tardes dias nomas solo listo ok okey vale " +
   "persona personas pax somos son vamos llevar llevo delivery recojo mesa aqui comer ser seria serian vendria vendrian tal bueno please quiere quieres sirve algo cosa cosas " +
   "tambien ademas aparte nada mas tamano tamanos sabor sabores quiza capaz salsa salsas ordenar ordeno das gustaria gustaria encantaria pedirte pedirles regalar regalame ambas ambos todas todos mismo misma cuanto cuesta cuestan precio precios carta menu horario abren cierran ahora ya")
    .split(" ").forEach(function (w) { if (w) FILLER[w] = 1; });
  var NUMS = { un: 1, uno: 1, una: 1, dos: 2, due: 2, tres: 3, tre: 3, cuatro: 4, quattro: 4, cinco: 5, cinque: 5, seis: 6, sei: 6, siete: 7, sette: 7,
               ocho: 8, otto: 8, nueve: 9, nove: 9, diez: 10, dieci: 10, once: 11, undici: 11, doce: 12, dodici: 12, quince: 15, veinte: 20 };
  var SIZE_WORDS = { personal: "P", personales: "P", personale: "P", individual: "P", individuales: "P",
                     mediana: "M", medianas: "M", mediano: "M", medianos: "M", media: "M",
                     familiar: "F", familiares: "F", personali: "P", grandi: "G", piccola: "S", piccole: "S", familia: "F", famiglia: "F", grande: "G", grandes: "G", gigante: "G",
                     chica: "S", chico: "S", chicas: "S", pequena: "S", pequeno: "S", pequenas: "S", chiquita: "S" };
  var WEAK = { fonte: 1, tre: 1, marie: 1, tabernero: 1, box: 1, casa: 1, classic: 1, york: 1, new: 1, gran: 1, tuyo: 1 };
  var TIENDA = "tienda";   // sección de la carta con la pasta y salsas para llevar a casa (precocidas)
  var ALERGIA_RE = /^(alerg|celiac|gluten|lactosa|intoler|anafil)/;

  function plano(s) {
    s = String(s == null ? "" : s).toLowerCase().replace(/½/g, " medio ").replace(/×/g, " x ").replace(/[’'`´]/g, " ");
    try { s = s.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) { /* motor sin normalize */ }
    return s.replace(/[^a-z0-9| ]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function fold(w) {
    return w.replace(/ph/g, "f").replace(/cc([ei])/g, "#$1").replace(/ch/g, "#").replace(/h/g, "").replace(/w/g, "v").replace(/b/g, "v").replace(/ll/g, "i").replace(/y/g, "i")
      .replace(/gn/g, "n").replace(/gu([ei])/g, "g$1").replace(/qu/g, "k").replace(/c([ei])/g, "s$1").replace(/z/g, "s").replace(/c/g, "k")
      .replace(/x/g, "ks").replace(/(.)\1+/g, "$1");
  }
  function canon(w) {
    if (w.length >= 5 && /[lnrz]es$/.test(w)) w = w.slice(0, -2);
    else if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) w = w.slice(0, -1);
    return fold(w);
  }
  function dl(a, b) {
    var la = a.length, lb = b.length, d = [], i, j, c;
    for (i = 0; i <= la; i++) { d[i] = [i]; }
    for (j = 1; j <= lb; j++) d[0][j] = j;
    for (i = 1; i <= la; i++) for (j = 1; j <= lb; j++) {
      c = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a.charAt(i - 1) === b.charAt(j - 2) && a.charAt(i - 2) === b.charAt(j - 1)) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[la][lb];
  }
  function limpiarSalida(s) { return String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120); }
  function palabras(s) { return plano(s).split(" ").filter(function (x) { return x && !STOP[x] && !/^\d+$/.test(x); }); }

  /* Sinónimos y nombres alternativos (español / italiano). Solo se aplican si el producto EXISTE en la carta (se busca por su nombre). */
  var SIN = [
    [/^pane aglio$|^pane all aglio$/, ["pan al ajo", "pan de ajo", "pan con ajo", "pan ajillo", "pan al ajillo"]],
    [/^pane all aglio con formaggio$/, ["pan al ajo con queso", "pan de ajo con queso", "pan al ajo y queso", "pan con ajo y queso", "pan ajo queso"]],
    [/^bruschetta ai funghi$/, ["bruschetta de hongos", "bruschetta de champinones", "bruschetta hongos", "bruschetta champinones"]],
    [/^prosciutto crudo$/, ["jamon crudo", "proscuito"]],
    [/^affettato misto$/, ["fiambres", "fiambre mixto", "fiambres mixtos", "tabla de fiambres", "embutidos"]],
    [/^piqueo all italiana$/, ["piqueo italiano", "piqueo"]],
    [/^insalata italiana$/, ["ensalada italiana"]],
    [/^insalata caprese$/, ["ensalada caprese"]],
    [/^frittata di cipolla$/, ["tortilla de cebolla"]],
    [/^frittata mista$/, ["tortilla mixta"]],
    [/^crepe agli asparagi$/, ["crepes de esparragos", "crepe de esparragos", "crepa de esparragos", "crespelle"]],
    [/^lasagna di spinaci$/, ["lasagna de espinaca", "lasagna espinaca"]],
    [/^lasagna agli asparagi$/, ["lasagna de esparragos", "lasagna esparragos"]],
    [/^napoletana$/, ["napolitana"]],
    [/^quattro stagioni$/, ["cuatro estaciones", "quattro estaciones"]],
    [/^quattro formaggi$/, ["cuatro quesos", "quattro quesos"]],
    [/^la peruanita$/, ["peruanita", "peruana"]],
    [/^speciale$/, ["especial"]],
    [/^piemontese$/, ["piamontesa", "piamontes"]],
    [/^ghiottona$/, ["glotona"]],
    [/^tentazione$/, ["tentacion"]],
    [/^gomiti$/, ["codito", "codo", "coditos"]],
    [/^maccheroni$/, ["macarron", "macarrones", "macarroni"]],
    [/^conchiglie$/, ["conchas", "conchitas", "conchita"]],
    [/^fettuccine verdi$/, ["fettuccine verde", "fettuccine verdes", "fettuccini verde", "fettuccini verdi", "fetuccine verde", "fetuccini verde", "fettuccine de espinaca", "fideos verdes"]],
    [/^spaghetti$/, ["espagueti", "espaguetis", "spagueti"]],
    [/^ravioli di carne$/, ["ravioles de carne", "ravioli carne"]],
    [/^ravioli di ricotta$/, ["ravioles de ricota", "ravioles de queso", "ravioli de queso", "ravioli de formaggio", "ravioles de formaggio", "ravioli formaggio"]],
    [/^fonte di ravioli di ricotta$/, ["fuente de ravioles de ricota", "fuente de ravioli de ricota", "fuente de ravioles de queso"]],
    [/^fonte di ravioli di carne$/, ["fuente de ravioles de carne", "fuente de ravioli de carne"]],
    [/^fonte di fettuccine$/, ["fuente de fettuccine"]],
    [/^gnocchi di patate$/, ["noquis", "noquis de papa", "noquis de patata", "gnoqui"]],
    [/^tris di pasta$/, ["tris de pasta", "tris"]],
    [/^spaghetti ai gamberi$/, ["espagueti con camarones", "spaghetti con camarones", "spaghetti camarones", "spaghetti gambas", "espagueti camarones"]],
    [/^lomo fino a la plancha$/, ["lomo fino", "lomo plancha", "lomo a la plancha", "lomito fino"]],
    [/^torta al cioccolato$/, ["torta de chocolate", "pastel de chocolate", "keke de chocolate", "torta chocolate"]],
    [/^classic new york cookie$/, ["galleta new york", "cookie new york", "galleta clasica", "galleta con chispas", "galleta"]],
    [/^chocolate cookie$/, ["galleta de chocolate", "cookie de chocolate", "galleta"]],
    [/^red velvet cookie$/, ["galleta red velvet", "cookie red velvet", "galleta"]],
    [/^biscotti tre marie x2$|^biscotti tre marie 2$/, ["galletas tre marie", "galleta tre marie"]],
    [/^limonata$/, ["limonada"]],
    [/^maracuya$/, ["jugo de maracuya", "maracuyada"]],
    [/^bibita gassata$/, ["gaseosa", "gasosa", "refresco", "soda", "bebida gaseosa", "bibita", "cola"]],
    [/^acqua$/, ["agua", "agua mineral", "agua natural", "agua singas", "agua mineral singas"]],
    [/^acqua frizzante$/, ["agua con gas", "agua frizzante", "agua gasificada", "agua mineral con gas"]],
    [/^hielo$/, ["hielos"]],
    [/^calice di vino$/, ["copa de vino", "copa vino", "copa", "vino por copa", "vino en copa"]],
    [/^caffe$/, ["cafe", "cafecito"]],
    [/^espresso$/, ["expreso", "espreso"]],
    [/^cappuccino$/, ["capuchino", "capuccino"]],
    [/^cioccolata calda$/, ["chocolate caliente", "chocolate calido"]],
    [/^te$/, ["te", "te caliente"]],
    [/^pina colada$/, ["pina colada"]],
    [/^calice di vino$/, ["copa de vino"]]
  ];
  /* Categorías genéricas: "una pizza", "pasta", "algo dulce"... → se pregunta cuál. palabra → secciones */
  var HEADS = { pizza: ["pizze"], pizze: ["pizze"], pasta: ["pasta"], fideo: ["pasta"], tallarin: ["pasta"], postre: ["dolci"], dulce: ["dolci"], vino: ["vini"],
                bebida: ["caffe"], trago: ["aperitivi"], coctel: ["aperitivi"], cocktail: ["aperitivi"], entrada: ["antipasti"], antipasto: ["antipasti"], parrilla: ["parrillas"] };
  /* Frases de opciones (temperatura, picante, término...) además del texto de la carta. */
  var OPSIN = [
    [/^helada$/, ["fria", "frio", "bien fria", "bien helada"]],
    [/ambiente|sin helar/, ["natural", "al tiempo", "sin helar", "no helada", "ambiente"]],
    [/^1 suave$|^suave$/, ["suave", "poco picante", "leve"]],
    [/^3 picante$|^picante$/, ["picante", "muy picante", "bien picante", "fuerte"]],
    [/tres cuartos/, ["tres cuartos", "3 4"]],
    [/bien cocido/, ["bien cocido", "bien cocida", "cocido", "cocida"]],
    [/^termino medio$/, ["termino medio", "punto medio", "medio"]],
    [/verde/, ["verde", "espinaca", "de espinaca"]],
    [/inca kola/, ["inca", "inka", "inka kola", "inca cola", "incakola"]],
    [/coca cola/, ["coca", "cocacola", "coca cola"]]
  ];

  function crear(carta, opts) {
    carta = carta || {}; opts = opts || {};
    var modo = opts.modo === "mesa" ? "mesa" : "delivery";
    var GR = carta.opciones || {};
    var prods = [], porId = {}, salsas = [], salsaPorId = {}, SEC = {}, VOC = {};
    var soportaMitad = false;

    (carta.secciones || []).forEach(function (sec) {
      SEC[sec.id] = sec;
      if (sec.id === TIENDA && modo === "mesa") return;   // la tienda (para llevar a casa) no se pide desde la mesa
      (sec.grupos || []).forEach(function (g) {
        (g.items || []).forEach(function (it) {
          if (it.tipo === "salsa") return;
          var p = { id: it.id, n: it.n, n_en: it.n_en || "", sec: sec.id, t: it.t || null, p: it.p, op: (it.op || []).slice(), salsa: !!it.salsa,
                    agotado: !!it.agotado, canal: it.canal || "", promo: it.promo || null, d: it.d || "", g: it.g || "", orden: prods.length,
                    foto: it.foto || "", tienda: sec.id === TIENDA };
          prods.push(p); porId[p.id] = p;
          if (sec.id === "pizze" && p.t && p.t.length > 1) soportaMitad = true;
        });
      });
    });
    (carta.salsas || []).forEach(function (s) { if (!s.agotado) { salsas.push(s); salsaPorId[s.id] = s; } });

    /* Ficha corta de un producto para las listas de alternativas y las tarjetas de "¿restaurante o para llevar?". */
    function info(p) {
      var precios = p.t && p.t.length ? p.t.map(function (x) { return { n: x[0], p: x[1] }; }) : (p.p != null ? [{ n: "", p: p.p }] : []);
      return { id: p.id, nombre: p.n, sub: p.g || "", tienda: !!p.tienda, foto: p.foto || "", precios: precios,
               etiqueta: p.tienda ? "Precocida para llevar" : "Del restaurante" };
    }
    /* ¿Las alternativas mezclan un plato del restaurante con su equivalente de la tienda? → se pregunta dónde lo quiere comer. */
    function mezclaOrigen(alts) {
      var r = false, t = false;
      alts.forEach(function (a) { if (a.tienda) t = true; else r = true; });
      return r && t;
    }

    /* ---------- estado de un producto (misma idea que pedido.js; el servidor vuelve a validar todo) ---------- */
    function estado(p) {
      var sec = SEC[p.sec] || {};
      if (p.agotado) return "Agotado por ahora.";
      if (p.canal === "local" && modo !== "mesa") return "Solo se pide en el local.";
      if (p.canal === "delivery" && modo === "mesa") return "Solo por delivery o recojo.";
      if (modo === "mesa" ? sec.mesa === false : sec.delivery === false) return "No se pide por este canal.";
      if (p.p == null && !(p.t && p.t.length)) return "Consulta el precio con nosotros.";
      if (p.promo && p.promo.dias && opts.dia != null && p.promo.dias.indexOf(opts.dia) < 0) return "Esta promoción no es de hoy.";
      return "";
    }
    function gruposDe(p, salsaId) {
      var ids = (p.op || []).slice(), s = salsaPorId[salsaId];
      if (s && s.op) s.op.forEach(function (g) { if (ids.indexOf(g) < 0) ids.push(g); });
      return ids.filter(function (g) { return GR[g]; });
    }

    /* ---------- alias (nombres alternativos) ---------- */
    var ALIAS = [];
    function addAlias(texto, dueno, extra) {
      var toks = palabras(texto).map(canon);
      if (!toks.length) return;
      var key = dueno.tipo + ":" + dueno.id + ":" + toks.join(" ");
      for (var i = 0; i < ALIAS.length; i++) if (ALIAS[i].key === key) return;
      toks.forEach(function (t) { VOC[t] = 1; });
      var a = { key: key, toks: toks, dueno: dueno, exacto: !!(extra && extra.exacto), preset: extra && extra.preset || null, numerico: toks.some(function (t) { return NUMCANON[t] != null; }) };
      ALIAS.push(a);
    }
    var NUMCANON = {}; Object.keys(NUMS).forEach(function (k) { NUMCANON[canon(k)] = NUMS[k]; });
    var SIZECANON = {}; Object.keys(SIZE_WORDS).forEach(function (k) { SIZECANON[canon(k)] = SIZE_WORDS[k]; });
    prods.forEach(function (p) {
      var dueno = { tipo: "item", id: p.id, p: p };
      var base = plano(p.n);
      addAlias(p.n, dueno);
      if (p.n_en && plano(p.n_en) !== base) addAlias(p.n_en, dueno, { exacto: true });
      SIN.forEach(function (r) { if (r[0].test(base)) r[1].forEach(function (x) { addAlias(x, dueno); }); });
      // sabores de gaseosa: "una inca kola" → Bibita Gassata + sabor
      (p.op || []).forEach(function (gid) {
        var g = GR[gid]; if (!g || gid !== "sabor-gaseosa") return;
        g.ops.forEach(function (o) {
          var pre = {}; pre[gid] = [o.n];
          addAlias(o.n, dueno, { preset: pre });
          OPSIN.forEach(function (r) { if (r[0].test(plano(o.n))) r[1].forEach(function (x) { addAlias(x, dueno, { preset: pre }); }); });
        });
      });
    });
    salsas.forEach(function (s) {
      var dueno = { tipo: "salsa", id: s.id, s: s };
      addAlias(s.n, dueno);
      var b = plano(s.n);
      if (/bolognese/.test(b)) { addAlias("bolonesa", dueno); addAlias("ragu", dueno); }
      if (/huancaina/.test(b)) addAlias("a la huancaina", dueno);
      if (/amatriciana/.test(b)) addAlias("marchigiana", dueno);
    });
    Object.keys(HEADS).forEach(function (w) {
      var dueno = { tipo: "head", id: w, secs: HEADS[w] };
      if (!HEADS[w].some(function (sid) { return SEC[sid]; })) return;
      addAlias(w, dueno);
    });
    // categorías por sección existente: "pizzas", "lasañas"... ya salen de los nombres; títulos para la búsqueda
    Object.keys(GR).forEach(function (gid) { GR[gid].ops.forEach(function (o) { palabras(o.n).forEach(function (w) { VOC[canon(w)] = 1; }); }); });

    var DF = {};   // en cuántos productos distintos aparece cada palabra (las muy repetidas no bastan para elegir un plato)
    (function () {
      var vistos = {};
      ALIAS.forEach(function (a) { if (a.dueno.tipo !== "item") return; a.toks.forEach(function (t) { var k = t + "|" + a.dueno.id; if (!vistos[k]) { vistos[k] = 1; DF[t] = (DF[t] || 0) + 1; } }); });
    })();
    function sim(u, v) {
      if (u === v) return 1;
      var L = Math.max(u.length, v.length);
      if (L <= 4 || u.length < 3) return 0;
      if (VOC[u]) return 0;
      if (u.length >= 4 && v.length > u.length && v.indexOf(u) === 0) return 0.85;
      var d = dl(u, v), allow = L <= 8 ? 1 : 2;
      if (d > allow) return 0;
      return d === 1 ? 0.9 : 0.8;
    }

    /* ---------- tokenizado ---------- */
    function tokenizar(texto) {
      var s = String(texto == null ? "" : texto).slice(0, 700);
      s = s.replace(/(\d)[.,](\d)/g, "$1p$2").replace(/[\n\r;,.!?:()\[\]{}"“”¿¡]+/g, " | ").replace(/\s[-–—]\s/g, " | ").replace(/[\/+&]/g, " ");
      s = plano(s).replace(/\bsin gas\b/g, "singas").replace(/\bmesa\s+\d+\b/g, " ");
      s = s.replace(/\b(para|somos|son|de)\s+(\d+|un|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|[a-z]+)\s+(personas?|pax)\b/g, " ")
           .replace(/\bmedia docena\b/g, " zq6 ").replace(/\bdocena\b/g, " zq12 ").replace(/\b(un\s+)?par\s+de\b|\bun par\b/g, " zq2 ")
           .replace(/\b(\d+)\s*x(?![a-z0-9])/g, " zqa$1 ").replace(/(^|\s)x\s*(\d+)\b/g, " zqb$2 ")
           .replace(/\b(un\s+|1\s+)?litro y medio\b/g, " zlt15 ").replace(/\b(1p5|1 y medio|1 medio)\s*litros?\b/g, " zlt15 ")
           .replace(/\bmedio litro\b/g, " zlt05 ")
           .replace(/\b(1|un|uno)\s+litro\b|\blitro\b/g, " zlt1 ")
           .replace(/\b4\s+(quesos|estaciones|formaggi|stagioni)\b/g, " cuatro $1 ")
           .replace(/\bmedia jarra\b/g, " zmjar ").replace(/\bjarra\b/g, " zjar ")
           .replace(/\bmitad y mitad\b|\bmitad mitad\b|\bhalf and half\b|\bhalf half\b/g, " zmm ").replace(/\bmitad\b|\bhalf\b/g, " zmit ");
      var raw = s.split(" ").filter(Boolean).slice(0, 140), T = [], i, w, m;
      for (i = 0; i < raw.length; i++) {
        w = raw[i];
        var t = { w: w, c: canon(w), kind: "w", stop: false, num: null, owner: -1, nota: false, filler: false, i: T.length };
        if (w === "|") t.kind = "sep";
        else if ((m = /^zq(\d+)$/.exec(w))) { t.kind = "q"; t.num = +m[1]; }
        else if ((m = /^zqa(\d+)$/.exec(w))) { t.kind = "q"; t.num = +m[1]; }
        else if ((m = /^zqb(\d+)$/.exec(w))) { t.kind = "qpost"; t.num = +m[1]; }
        else if (/^zlt1$/.test(w)) { t.kind = "size"; t.cls = "L1"; }
        else if (/^zlt05$/.test(w)) { t.kind = "size"; t.cls = "L05"; }
        else if (/^zlt15$/.test(w)) { t.kind = "size"; t.cls = "L15"; }
        else if (w === "zjar") { t.kind = "size"; t.cls = "J"; }
        else if (w === "zmjar") { t.kind = "size"; t.cls = "MJ"; }
        else if (w === "zmm") t.kind = "mm";
        else if (w === "zmit") t.kind = "mit";
        else {
          if (/^\d+$/.test(w)) t.num = parseInt(w, 10);
          else if (NUMS[w] != null) t.num = NUMS[w];
          if (STOP[w]) t.stop = true;
          if (FILLER[w]) { t.filler = true; t.stop = true; }
          if (w === "y" || w === "e" || w === "tambien" || w === "ademas") t.soft = true;
          if (SIZECANON[t.c] && !(w === "media" && false)) t.cls = SIZECANON[t.c];
          if (w === "sin") t.kind = "sin";
        }
        t.i = T.length; T.push(t);
      }
      // "sin ..." : lo que sigue es una nota para cocina, no un plato (hasta 3 palabras o separador)
      for (i = 0; i < T.length; i++) if (T[i].kind === "sin") {
        T[i].nota = true; var n = 0;
        for (var j = i + 1; j < T.length && n < 1; j++) {
          if (T[j].kind === "sep" || T[j].kind === "q" || T[j].num != null || T[j].soft) break;
          T[j].nota = true; if (!T[j].stop) n++;
        }
      }
      return T;
    }

    /* ---------- candidatos ---------- */
    function alinear(al, T, s) {
      var toks = al.toks, k = toks.length, j = 0, pos = [], tot = 0, gap = 0, ix0 = -1;
      for (var p = s; p < T.length; p++) {
        var t = T[p];
        if (t.kind === "sep") break;
        if (t.nota) break;
        if (t.kind !== "w") { if (pos.length) break; return null; }
        if (t.stop) { if (!pos.length) return null; if (++gap > 2) break; continue; }
        var best = 0, bj = -1;
        for (var q = j; q < k; q++) {
          var sc = al.exacto || t.cls ? (t.c === toks[q] ? 1 : 0) : sim(t.c, toks[q]);
          if (sc > best + 1e-9) { best = sc; bj = q; }
          if (sc === 1 && q === j) break;
        }
        if (bj < 0 || best < 0.8) { if (!pos.length) return null; break; }
        if (t.num != null && !(al.numerico && toks[bj] === t.c)) { if (!pos.length) return null; break; }
        if (pos.length === 0 && bj > 0 && toks.length > 1 && bj !== 0 && false) return null;
        if (!pos.length) ix0 = bj;
        pos.push(p); tot += best; j = bj + 1; gap = 0;
        if (j >= k) break;
      }
      if (!pos.length) return null;
      var m = pos.length;
      if (al.numerico && m < k) return null;
      if (m === 1 && k >= 2 && WEAK[T[pos[0]].w]) return null;
      if (m === 1 && toks.length === 1 && toks[0].length <= 2) {          // palabras de 2 letras ("té"): solo con cantidad delante
        var pr = T[pos[0] - 1]; if (!pr || pr.num == null) return null;
      }
      var avg = tot / m, frac = m / k;
      var rank = avg * frac * frac;
      if (al.dueno.tipo === "head") rank = Math.min(rank, 0.45);
      return { ix0: ix0, al: al, s: pos[0], e: pos[m - 1], pos: pos, m: m, k: k, sim: avg, rank: rank, conf: avg * (0.55 + 0.45 * frac) };
    }
    function candidatos(T, tipos) {
      var out = [];
      for (var s = 0; s < T.length; s++) {
        var t = T[s]; if (t.kind !== "w" || t.stop || t.nota) continue;
        for (var a = 0; a < ALIAS.length; a++) {
          if (tipos.indexOf(ALIAS[a].dueno.tipo) < 0) continue;
          var c = alinear(ALIAS[a], T, s); if (c) out.push(c);
        }
      }
      return out;
    }
    function solapa(c, used) { for (var i = 0; i < c.pos.length; i++) if (used[c.pos[i]]) return true; return false; }
    function elegir(cands, used) {
      cands.sort(function (x, y) { return y.rank - x.rank || y.m - x.m || x.s - y.s; });
      var acc = [];
      cands.forEach(function (c) {
        if (solapa(c, used)) return;
        acc.push(c); c.pos.forEach(function (p) { used[p] = 1; });
      });
      acc.sort(function (x, y) { return x.s - y.s; });
      return acc;
    }

    /* ---------- tamaños ---------- */
    function claseDeTamano(label) {
      var b = plano(label);
      if (/media jarra/.test(b)) return "MJ";
      if (/jarra/.test(b)) return "J";
      if (/1 medio litro|litro y medio|1 1 2|1p5/.test(b)) return "L15";
      if (/^medio litro/.test(b)) return "L05";
      if (/^(1|un) litro/.test(b)) return "L1";
      if (/personal|individual/.test(b)) return "P";
      if (/^media$|mediana|mediano/.test(b)) return "M";
      if (/famil|famiglia/.test(b)) return "F";
      if (/^grande/.test(b)) return "G";
      if (/peque|chic/.test(b)) return "S";
      return "";
    }
    function tamanoPara(p, cls) {
      if (!p.t) return "";
      var i, c;
      for (i = 0; i < p.t.length; i++) { c = claseDeTamano(p.t[i][0]); if (c === cls) return p.t[i][0]; }
      if (cls === "G") for (i = 0; i < p.t.length; i++) if (claseDeTamano(p.t[i][0]) === "F") return p.t[i][0];
      return "";
    }

    /* ---------- frases de opciones ---------- */
    function frasesOpcion(gid, g, p) {
      var out = [], extras = g.tipo === "varias" && !g.req;
      var unicos = {};
      g.ops.forEach(function (o) { palabras(o.n).forEach(function (w) { var c = canon(w); unicos[c] = (unicos[c] || 0) + 1; }); });
      g.ops.forEach(function (o) {
        var b = plano(o.n), ws = palabras(o.n).filter(function (w) { return !(extras && w === "extra"); });
        var cs = ws.map(canon);
        if (cs.length) out.push({ toks: cs, op: o.n, marca: extras, gid: gid });
        if (!extras) ws.forEach(function (w) {
          var c = canon(w);
          if (w.length >= 4 && unicos[c] === 1 && NUMCANON[c] == null && !/^(termino|tipo|sabor|temperatura|nivel)$/.test(w)) out.push({ toks: [c], op: o.n, marca: false, gid: gid });
        });
        if (!extras) OPSIN.forEach(function (r) {
          if (r[0].test(b)) r[1].forEach(function (x) { var cs2 = palabras(x).map(canon); if (cs2.length) out.push({ toks: cs2, op: o.n, marca: false, gid: gid }); });
        });
      });
      return out;
    }
    function buscarFrase(fr, T, desde, hasta) {
      for (var s = desde; s <= hasta; s++) {
        var t = T[s]; if (!t || t.kind !== "w" || t.stop || t.owner >= 0 || t.nota) continue;
        var pos = [], j = 0, gap = 0;
        for (var p = s; p < T.length && j < fr.toks.length; p++) {
          var u = T[p];
          if (u.kind === "sep" || u.owner >= 0 || u.nota) break;
          if (u.kind !== "w") break;
          if (u.stop) { if (!pos.length) break; if (++gap > 1) break; continue; }
          if (sim(u.c, fr.toks[j]) < 0.85) break;
          if (u.num != null && NUMCANON[fr.toks[j]] == null) break;
          pos.push(p); j++; gap = 0;
        }
        if (j === fr.toks.length) return pos;
      }
      return null;
    }

    /* ---------- interpretación ---------- */
    function interpretar(texto) {
      var T = tokenizar(texto), used = {}, avisos = [];
      var res = { ok: true, lineas: [], noEntendido: [], avisos: avisos, alergia: false, mitadSoportada: soportaMitad };
      var todo = candidatos(T, ["item", "head"]);
      var rechazados = todo.slice();
      var acc = elegir(todo.slice(), used);
      // una palabra suelta que es solo un trozo del nombre de un plato (y sobre todo si está junto a "pizza", "vino"...) no basta para elegirlo
      acc = acc.filter(function (c) {
        if (c.al.dueno.tipo !== "item" || c.m >= c.k) return true;
        var frac = c.m / c.k, df = DF[T[c.pos[0]].c] || 0, cerca = null;
        acc.forEach(function (h) { if (h.al.dueno.tipo === "head" && (h.s > c.e ? h.s - c.e : c.s - h.e) <= 4) {
          var a = Math.min(h.s, c.s), b = Math.max(h.e, c.e), corta = false;
          for (var x = a + 1; x < b; x++) if (T[x].kind === "sep") corta = true;
          if (!corta) cerca = h; } });
        var quitar = (df >= 4 && c.ix0 > 0) || (frac < 0.4 && (df >= 2 || cerca)) || (cerca && (frac < 0.5 || cerca.al.dueno.secs.indexOf(c.al.dueno.p.sec) < 0));
        if (quitar) c.pos.forEach(function (p) { delete used[p]; });
        return !quitar;
      });

      // categoría genérica pegada a un producto concreto de la misma sección ("pizza hawaiana") → se absorbe
      var items = [];
      acc.forEach(function (c) { items.push({ c: c, tipo: c.al.dueno.tipo, pos: c.pos.slice(), salsa: "", ops: {}, tam: "", cant: 0, mitad: "", nota: "", plural: false, avisosL: [] }); });
      items.forEach(function (it) {
        if (it.tipo !== "head") return;
        var hd = it.c.al.dueno, pi = it.c.s;
        it.plural = /s$/.test(T[pi].w) && !/ss$/.test(T[pi].w);
        for (var k = 0; k < items.length; k++) {
          var o = items[k]; if (o === it || o.tipo !== "item" || o.absorbido) continue;
          if (hd.secs.indexOf(o.c.al.dueno.p.sec) < 0) continue;
          var gapN = o.c.s > pi ? o.c.s - pi : pi - o.c.e;
          if (gapN <= 3 && !hayBarreraSimple(T, Math.min(pi, o.c.s), Math.max(pi, o.c.e), [pi].concat(o.pos))) {
            it.absorbidoEn = o; o.cabeza = it; o.pos = o.pos.concat(it.pos); it.absorbido = true; break;
          }
        }
      });
      function hayBarreraSimple(T, a, b, propios) {
        for (var p = a + 1; p < b; p++) {
          if (propios.indexOf(p) >= 0) continue;
          var t = T[p]; if (t.kind === "sep") return true;
          if (t.owner >= 0 || t.num != null || t.soft) return true;
          if (!t.stop && t.kind === "w" && !t.cls) return true;
        }
        return false;
      }
      items = items.filter(function (x) { return !x.absorbido; });
      // "gaseosa mediana coca cola": el nombre genérico y el sabor son la misma línea
      for (var a1 = 0; a1 < items.length; a1++) for (var b1 = a1 + 1; b1 < items.length; b1++) {
        var X = items[a1], Y = items[b1];
        if (X.tipo !== "item" || Y.tipo !== "item" || X.c.al.dueno.id !== Y.c.al.dueno.id) continue;
        var pre = X.c.al.preset ? X : (Y.c.al.preset ? Y : null), otro = pre === X ? Y : X;
        if (!pre || otro.c.al.preset || otro.presetOps) continue;
        var lo1 = Math.min(Math.max.apply(null, X.pos), Math.max.apply(null, Y.pos)), hi1 = Math.max(Math.min.apply(null, X.pos), Math.min.apply(null, Y.pos));
        if (hayBarreraSimple(T, lo1, hi1, X.pos.concat(Y.pos))) continue;
        otro.presetOps = pre.c.al.preset; otro.pos = otro.pos.concat(pre.pos); items.splice(items.indexOf(pre), 1); b1 = a1;
      }
      items.forEach(function (it, ix) { it.pos.forEach(function (p) { T[p].owner = ix; }); it.s = Math.min.apply(null, it.pos); it.e = Math.max.apply(null, it.pos); });

      function barrera(a, b, ia, ib, skip) {   // entre las posiciones a<b (exclusive): separador, cantidad u otro producto
        for (var p = a + 1; p < b; p++) {
          var t = T[p];
          if (skip && skip.indexOf(p) >= 0) continue;
          if (t.kind === "sep" || t.kind === "q" || t.kind === "qpost") return true;
          if (t.owner >= 0 && t.owner !== ia && t.owner !== ib) return true;
          if (t.kind === "w" && t.num != null && !t.stop && t.owner < 0 && !t.cls) return true;
          if (t.kind === "w" && t.num != null && t.owner < 0 && t.w !== "un" && t.w !== "una" && t.w !== "uno") return true;
        }
        return false;
      }
      function distancia(p, it) { return p < it.s ? it.s - p : p - it.e; }
      function inmediato(p, it) {   // solo palabras de relleno (no "y") entre el modificador y el producto
        var a = p < it.s ? p : it.e, b = p < it.s ? it.s : p;
        for (var x = a + 1; x < b; x++) if (!(T[x].stop && !T[x].soft)) return false;
        return true;
      }
      function alcanza(p, it, skip) {
        if (p >= it.s && p <= it.e) return 0;
        var d = distancia(p, it); if (d > 7) return -1;
        var bad = p < it.s ? barrera(p, it.s, -2, items.indexOf(it), skip) : barrera(it.e, p, items.indexOf(it), -2, skip);
        return bad ? -1 : d;
      }

      // salsas (pastas): se pegan al plato con salsa más cercano; si sobran, se preguntan
      var sCands = candidatos(T, ["salsa"]).filter(function (c) { return c.rank >= 0.8; });
      sCands.sort(function (x, y) { return y.rank - x.rank || y.m - x.m || x.s - y.s; });
      var salsasUsadas = [];
      sCands.forEach(function (sc) {
        if (sc.pos.some(function (p) { return T[p].nota; })) return;
        var best = null, bd = 99;
        items.forEach(function (it, ix) {
          var cons = it.tipo === "item" ? it.c.al.dueno.p.salsa : (it.tipo === "head" && it.c.al.dueno.secs.indexOf("pasta") >= 0);
          if (!cons || it.salsa) return;
          var d = sc.s > it.e ? sc.s - it.e : it.s - sc.e;
          if (d < 0) return;
          var bad = sc.s > it.e ? barrera(it.e, sc.s, ix, -2) : barrera(sc.e, it.s, -2, ix);
          if (bad || d > 6) return;
          var prefer = sc.s > it.e ? 0 : 0.5;
          if (d + prefer < bd) { bd = d + prefer; best = it; }
        });
        // pisan a un candidato débil (parcial) que ocupe esas palabras; no pisan a uno completo ajeno
        var chocan = items.filter(function (it) { return it !== best && it.pos.some(function (p) { return sc.pos.indexOf(p) >= 0; }); });
        if (best) {
          if (chocan.some(function (it) { return it.c.rank >= 0.99 && it.tipo === "item" && it.c.m === it.c.k && it.c.k >= sc.k && false; })) return;
          chocan.forEach(function (it) { items.splice(items.indexOf(it), 1); it.pos.forEach(function (p) { T[p].owner = -1; }); });
          best.salsa = sc.al.dueno.id; sc.pos.forEach(function (p) { used[p] = 1; T[p].owner = -3; T[p].used = true; });
          salsasUsadas.push(sc);
        }
      });
      // reindexar dueños
      items.forEach(function (it, ix) { it.pos.forEach(function (p) { T[p].owner = ix; }); });
      // salsas sin plato: línea de pasta por elegir, con la salsa ya marcada
      sCands.forEach(function (sc) {
        if (salsasUsadas.indexOf(sc) >= 0 || sc.pos.some(function (p) { return T[p].nota; })) return;
        var choc = items.filter(function (it) { return it.pos.some(function (p) { return sc.pos.indexOf(p) >= 0; }); });
        if (choc.length) {
          if (!choc.every(function (it) { return it.tipo === "item" && it.c.rank < sc.rank * 0.6; })) return;
          items = items.filter(function (it) { return choc.indexOf(it) < 0; });
          choc.forEach(function (it) { it.pos.forEach(function (p) { T[p].owner = -1; }); });
        }
        var it2 = { c: { al: { dueno: { tipo: "head", id: "pasta", secs: ["pasta"] } }, s: sc.s, e: sc.e, pos: sc.pos, m: 1, k: 1, sim: sc.sim, rank: 0.4, conf: 0.5 }, tipo: "head", pos: sc.pos.slice(), salsa: sc.al.dueno.id, ops: {}, tam: "", cant: 0, mitad: "", nota: "", avisosL: [], huerfana: true };
        items.push(it2); it2.s = sc.s; it2.e = sc.e;
        sc.pos.forEach(function (p) { T[p].owner = 0; T[p].used = true; });
      });
      items.sort(function (a, b) { return a.s - b.s; });
      items.forEach(function (it, ix) { it.pos.forEach(function (p) { T[p].owner = ix; }); });

      // vino ("copa de vino" ya es un producto) / categoría sola de otra sección: nada más que hacer

      // preajustes de alias (sabor de gaseosa)
      items.forEach(function (it) {
        var pre = it.presetOps || (it.tipo === "item" ? it.c.al.preset : null);
        if (pre) Object.keys(pre).forEach(function (g) { it.ops[g] = pre[g].slice(); });
      });

      // mitad y mitad: dos pizzas seguidas con la palabra "mitad" cerca se funden en una línea (solo si la carta lo permite)
      var mitPos = [];
      T.forEach(function (t, i) { if (t.kind === "mm" || t.kind === "mit") mitPos.push(i); });
      if (mitPos.length) {
        var fundio = false;
        for (var a = 0; a < items.length - 1; a++) {
          var A = items[a], B2 = items[a + 1];
          if (!soportaMitad || A.tipo !== "item" || B2.tipo !== "item") continue;
          if (A.c.al.dueno.p.sec !== "pizze" || B2.c.al.dueno.p.sec !== "pizze") continue;
          var enMedio = mitPos.some(function (x) { return x > A.s - 4 && x < B2.e; });
          var sepEntre = false; for (var q2 = A.e + 1; q2 < B2.s; q2++) if (T[q2].kind === "sep" || T[q2].kind === "q" || (T[q2].num != null && !T[q2].soft && T[q2].kind === "w" && !T[q2].stop)) sepEntre = true;
          if (enMedio && !sepEntre) { A.mitadCon = B2; A.pos = A.pos.concat(B2.pos); items.splice(a + 1, 1); A.e = Math.max(A.e, B2.e); fundio = true; }
        }
        items.forEach(function (it, ix) { it.pos.forEach(function (p) { T[p].owner = ix; }); it.s = Math.min.apply(null, it.pos); it.e = Math.max.apply(null, it.pos); });
        if (!soportaMitad) avisos.push("Por ahora no ofrecemos mitad y mitad; revisa los sabores.");
        else if (!fundio) items.forEach(function (it) { if (it.tipo === "item" && it.c.al.dueno.p.sec === "pizze") it.avisosL.push("Pediste mitad y mitad: elige tamaño Media o Famiglia y el segundo sabor."); });
      }

      // tamaño general: "ambas medianas", "todas familiares" → a todos los platos que lo admitan
      T.forEach(function (t, i) {
        if (t.owner >= 0 || t.used || !t.cls || t.nota) return;
        var prev = T[i - 1];
        if (!prev || !/^(ambas|ambos|todas|todos)$/.test(prev.w)) return;
        var algo = false;
        items.forEach(function (it) { if (it.tipo === "item" && !it.tam) { var tm = tamanoPara(it.c.al.dueno.p, t.cls); if (tm) { it.tam = tm; algo = true; } } });
        if (algo) { t.used = true; prev.used = true; }
      });
      // modificadores: tamaños y opciones → al producto más cercano donde sean válidos
      var mods = [];
      items.forEach(function (it, ix) {
        if (it.tipo !== "item") return;
        var p = it.c.al.dueno.p;
        // tamaños
        for (var q = 0; q < T.length; q++) {
          var t = T[q]; if (t.owner >= 0 || t.nota || !t.cls) continue;
          var tam = tamanoPara(p, t.cls); if (!tam) continue;
          var d = alcanza(q, it); if (d < 0) continue;
          mods.push({ tipo: "tam", it: it, pos: [q], d: inmediato(q, it) ? 0 + (q > it.e ? 0 : 0.01) : d + 1 + (q > it.e ? 0 : 0.1), tam: tam, asumido: t.cls === "G" && claseDeTamano(tam) === "F", len: 1 });
        }
        // opciones
        var lo = Math.max(0, it.s - 5), hi = Math.min(T.length - 1, it.e + 7);
        gruposDe(p, it.salsa).forEach(function (gid) {
          var g = GR[gid];
          frasesOpcion(gid, g, p).forEach(function (fr) {
            var pos = buscarFrase(fr, T, lo, hi); if (!pos) return;
            var extraPos = [];
            if (fr.marca) {   // ingredientes adicionales: solo si dice "extra"/"adicional"
              var a = pos[0] - 1, b = pos[pos.length - 1] + 1, ok = false;
              [a - 1, a, b, b + 1].forEach(function (x) { var u = T[x]; if (u && u.kind === "w" && /^(extra|extras|adicional|adicionales|mas)$/.test(u.w) && u.owner < 0) { ok = true; extraPos.push(x); } });
              if (!ok) return;
            }
            var dmin = 99, okb = true;
            pos.forEach(function (x) { var d = alcanza(x, it, pos); if (d < 0) okb = false; else dmin = Math.min(dmin, d); });
            if (!okb) return;
            mods.push({ tipo: "op", it: it, pos: pos.concat(extraPos), d: dmin + (pos[0] > it.e ? 0 : 0.1) - fr.toks.length * 0.01, gid: gid, op: fr.op, varias: g.tipo === "varias", len: pos.length });
          });
        });
      });
      mods.sort(function (a, b) { return a.d - b.d || b.len - a.len; });
      mods.forEach(function (m) {
        if (m.pos.some(function (p) { return T[p].owner >= 0 || T[p].used; })) return;
        if (m.tipo === "tam") { if (m.it.tam) return; m.it.tam = m.tam; if (m.asumido) m.it.avisosL.push("Dijiste \"grande\": elegimos " + m.tam + ". Cámbialo si no es lo que quieres."); }
        else {
          var cur = m.it.ops[m.gid] || [];
          if (!m.varias) { if (cur.length && !(m.it.c.al.preset && m.it.c.al.preset[m.gid])) return; if (cur.length && m.it.c.al.preset) return; m.it.ops[m.gid] = [m.op]; }
          else if (cur.indexOf(m.op) < 0) m.it.ops[m.gid] = cur.concat([m.op]);
        }
        m.pos.forEach(function (p) { T[p].used = true; });
      });

      // cantidades
      var qs = [];
      T.forEach(function (t, i) { if (t.owner < 0 && !t.used && !t.nota && (t.kind === "q" || t.kind === "qpost" || (t.kind === "w" && t.num != null && !(t.stop && !(t.w === "un" || t.w === "una" || t.w === "uno"))))) qs.push(i); });
      qs.forEach(function (i) {
        var t = T[i], best = null, bd = 99, v = t.num;
        if (!(v >= 1)) return;
        items.forEach(function (it, ix) {
          if (it.cantFijada) return;
          var d, bad;
          if (t.kind === "qpost") { if (i < it.e) return; d = i - it.e; bad = barrera(it.e, i, ix, -2); if (d > 4) return; }
          else if (i < it.s) { d = it.s - i; bad = barrera(i, it.s, -2, ix); if (d > 6) return; }
          else {
            if (t.kind !== "w" || /^(un|una|uno)$/.test(t.w) || (i - it.e) > 2) return;       // "hawaiana 2": cantidad detrás, solo pegada y con cifra
            if (!/^\d+$/.test(t.w)) return;
            d = i - it.e + 0.5; bad = barrera(it.e, i, ix, -2);
          }
          if (bad) return;
          if (d < bd) { bd = d; best = it; }
        });
        if (best) { best.cant = v; best.cantFijada = true; t.used = true; best.qpos = i; }
      });
      // "dos pizzas, una hawaiana y una americana": la categoría suelta solo cuenta, no es otra línea
      items = items.filter(function (it) {
        if (it.tipo !== "head" || it.huerfana || !it.cantFijada) return true;
        var secs = it.c.al.dueno.secs;
        var sig = items.filter(function (o) { return o !== it && o.tipo === "item" && o.s > it.e && secs.indexOf(o.c.al.dueno.p.sec) >= 0; });
        if (!sig.length) return true;
        var suma = sig.reduce(function (acc2, o) { return acc2 + (o.cantFijada ? o.cant : 1); }, 0);
        if (suma !== it.cant) avisos.push("Dijiste " + it.cant + " en total pero detallaste " + suma + ": revisa las cantidades.");
        return false;
      });
      // plural + enumeración ("dos pizzas hawaiana y americana"): una de cada una
      items.forEach(function (it) {
        if (it.tipo !== "item" || !it.cabeza || !it.cabeza.plural || it.cant < 2) return;
        var vecinos = items.filter(function (o) { return o.tipo === "item" && o.c.al.dueno.p.sec === it.c.al.dueno.p.sec && (o === it || !o.cantFijada) && Math.abs(o.s - it.s) <= 4; });
        if (vecinos.length >= 2) { var total = it.cant; vecinos.forEach(function (o) { o.cant = 1; o.cantFijada = true; }); if (total !== vecinos.length) avisos.push("Dijiste " + total + " pero nombraste " + vecinos.length + " sabores: ajusta las cantidades."); }
      });
      // tamaño dado a una categoría suelta ("dos pizzas medianas" absorbido) ya se asigna por cercanía; el resto de lo no usado queda como "no entendido"

      // ---------- armar líneas ----------
      var lineas = [];
      items.forEach(function (it) {
        var L = armarLinea(it, items, rechazados, T);
        if (it.mitadCon) { L.mitad = it.mitadCon.c.al.dueno.id; L.nombreMitad = porId[L.mitad].n; completar(L); }
        lineas.push(L);
      });
      // nota "sin ..." al plato anterior
      var notaTxt = [], nota = null;
      T.forEach(function (t, i) {
        if (t.kind === "sin" && t.nota) {
          var frag = []; for (var j = i; j < T.length && T[j].nota && T[j].kind !== "sep"; j++) frag.push(T[j].w);
          var dueno = null, dd = 99;
          items.forEach(function (it) { if (it.e < i && i - it.e < dd && !barrera(it.e, i, -2, -2)) { dd = i - it.e; dueno = it; } });
          if (!dueno) items.forEach(function (it) { if (it.s > i && it.s - i < dd) { dd = it.s - i; dueno = it; } });
          if (dueno) { dueno.nota = (dueno.nota ? dueno.nota + ", " : "") + frag.join(" "); }
          else notaTxt.push(frag.join(" "));
        }
      });
      lineas.forEach(function (L) { var src = items.filter(function (it) { return it.c.s === L._s; })[0]; if (src && src.nota) L.nota = limpiarSalida(src.nota); delete L._s; });
      // alergias: no se interpreta nada
      T.forEach(function (t) { if (ALERGIA_RE.test(t.w)) res.alergia = true; });
      if (res.alergia) avisos.push("Mencionaste alergias o restricciones. No podemos confirmarlas desde aquí: avísanos o escríbelo en la nota del pedido.");

      // lo no entendido
      var run = [];
      function cerrarRun() {
        while (run.length && (T[run[0]].stop)) run.shift();
        while (run.length && (T[run[run.length - 1]].stop)) run.pop();
        if (run.length && run.some(function (x) { return !T[x].stop || false; })) {
          var txt = limpiarSalida(run.map(function (x) { return T[x].w; }).join(" "));
          if (txt && res.noEntendido.length < 20) res.noEntendido.push(txt);
        }
        run = [];
      }
      T.forEach(function (t, i) {
        var libre = t.kind === "w" && t.owner < 0 && !t.used && !t.filler && !(t.nota);
        if (t.kind === "sin" || t.nota) { cerrarRun(); return; }
        if (t.kind === "mm" || t.kind === "mit") { cerrarRun(); return; }
        if (libre && !(t.soft && !run.length)) { if (t.soft && run.length) { cerrarRun(); return; } run.push(i); }
        else if (t.kind === "w" && t.stop && t.owner < 0 && !t.used && run.length) run.push(i);
        else cerrarRun();
      });
      cerrarRun();
      res.noEntendido = res.noEntendido.filter(function (x) { return !/^(un|una|uno|\d+)$/.test(x) || true; });
      res.lineas = lineas;
      if (notaTxt.length) res.notaGeneral = limpiarSalida(notaTxt.join(", "));
      res.resumen = { lineas: lineas.length, sinEntender: res.noEntendido.length, porRevisar: lineas.filter(function (l) { return l.revisar; }).length };
      return res;
    }

    function armarLinea(it, items, rechazados, T) {
      var L = { id: "", nombre: "", seccion: "", categoria: "", cant: it.cant >= 1 ? Math.min(20, it.cant) : 1, cantImplicita: !(it.cant >= 1), tam: it.tam || "",
                salsa: it.salsa || "", ops: {}, mitad: "", nota: "", confianza: 0, alternativas: [], faltan: [], avisos: it.avisosL.slice(), pedible: true, motivo: "",
                texto: limpiarSalida(it.pos.map(function (p) { return T[p].w; }).join(" ")), _s: it.c.s };
      if (it.cant > 20) L.avisos.push("Máximo 20 por línea: ajustamos la cantidad a 20.");
      Object.keys(it.ops).forEach(function (g) { L.ops[g] = it.ops[g].slice(); });
      var dueno = it.c.al.dueno;
      if (it.tipo === "item") {
        L.id = dueno.id; L.nombre = dueno.p.n; L.seccion = dueno.p.sec; L.confianza = it.c.conf;
        // ¿hay otros candidatos igual de buenos sobre las mismas palabras?
        var vistos = {}; vistos[dueno.id] = 1; var cercanas = [], lejanas = [];
        rechazados.forEach(function (r) {
          if (r.al.dueno.tipo !== "item" || vistos[r.al.dueno.id]) return;
          if (!r.pos.some(function (p) { return it.c.pos.indexOf(p) >= 0; })) return;
          if (r.m < it.c.m && r.pos.every(function (p) { return it.c.pos.indexOf(p) >= 0; })) return;   // versión más corta del mismo nombre
          var mismoTrozo = it.c.m < it.c.k && r.m < r.k && r.pos.length === it.c.pos.length && r.pos.every(function (p) { return it.c.pos.indexOf(p) >= 0; });
          if (mismoTrozo || r.rank >= it.c.rank * 0.8 - 1e-9) { cercanas.push(r); vistos[r.al.dueno.id] = 1; }
          else if (r.rank >= it.c.rank * 0.4) { lejanas.push(r); vistos[r.al.dueno.id] = 1; }
        });
        if (cercanas.length) {
          L.alternativas = [info(dueno.p)].concat(cercanas.map(function (r) { return info(r.al.dueno.p); })).slice(0, 8);
          L.id = ""; L.nombre = ""; L.confianza = Math.min(0.45, it.c.conf);
          if (mezclaOrigen(L.alternativas)) L.origen = true;   // restaurante vs tienda con nombre parecido: la pantalla pregunta con tarjetas
          else L.avisos.push("Hay varias opciones parecidas: elige cuál quieres.");
        } else {
          L.alternativas = lejanas.slice(0, 4).map(function (r) { return info(r.al.dueno.p); });
          if (it.c.rank < 0.5 && L.alternativas.length) { L.confianza = Math.min(L.confianza, 0.6); }
        }
      } else {    // categoría genérica: el cliente elige
        L.categoria = dueno.secs[0]; L.confianza = 0.3;
        L.alternativas = [];
        dueno.secs.forEach(function (sid) { prods.forEach(function (p) { if (p.sec === sid && !p.agotado && !estado(p)) L.alternativas.push(info(p)); }); });
        L.avisos.push("Elige cuál " + (dueno.id === "pasta" || it.huerfana ? "pasta" : dueno.id) + " quieres.");
        if (it.huerfana && it.salsa && salsaPorId[it.salsa]) {
          // "salsa alfredo" suelta: puede ser la salsa de una pasta del restaurante o el frasco de la tienda para llevar a casa
          var bs = plano(salsaPorId[it.salsa].n);
          var ts = prods.filter(function (p) { return p.tienda && !p.agotado && !estado(p) && /^salsa /.test(plano(p.n)) && (" " + plano(p.n) + " ").indexOf(" " + bs + " ") >= 0; }).map(info);
          if (ts.length) L.salsaTienda = ts;
        }
        L.seccion = dueno.secs[0];
      }
      L.revisar = L.confianza < 0.7 || !L.id;
      return completar(L);
    }

    /* Recalcula lo que falta y el estado de una línea (también lo usa la pantalla de revisión al editar). */
    function completar(L) {
      L.faltan = []; L.motivo = ""; L.pedible = true;
      var p = porId[L.id];
      if (!p) { L.faltan.push("producto"); L.pedible = false; return L; }
      L.nombre = p.n; L.seccion = p.sec;
      var m = estado(p); if (m) { L.pedible = false; L.motivo = m; }
      if (p.t && p.t.length === 1 && !L.tam) L.tam = p.t[0][0];   // una sola presentación (ej. paquete de 500 g de la tienda): no hay nada que elegir
      if (p.t && p.t.length) {
        var ok = p.t.some(function (x) { return x[0] === L.tam; });
        if (!ok) { L.tam = ""; L.faltan.push("tam"); }
      } else L.tam = "";
      if (L.mitad) {
        var m2 = porId[L.mitad];
        if (!(p.sec === "pizze" && p.t && p.t.length > 1 && m2 && m2.t && !m2.agotado) || (L.tam && L.tam === p.t[0][0])) {
          if (L.tam && p.t && L.tam === p.t[0][0]) L.avisos.push("Mitad y mitad solo desde el tamaño " + p.t[1][0] + ".");
          L.mitad = "";
          if (L.tam && p.t && L.tam === p.t[0][0]) L.tam = "";
          if (L.tam === "") { if (L.faltan.indexOf("tam") < 0) L.faltan.push("tam"); }
        } else if (L.tam && !m2.t.some(function (x) { return x[0] === L.tam; })) { L.mitad = ""; }
      }
      if (p.salsa) {
        if (!salsaPorId[L.salsa]) { L.salsa = ""; L.faltan.push("salsa"); }
      } else L.salsa = "";
      var gs = gruposDe(p, L.salsa), nuevos = {};
      gs.forEach(function (gid) {
        var g = GR[gid], sel = (L.ops[gid] || []).filter(function (nm) { return g.ops.some(function (o) { return o.n === nm; }); });
        if (sel.length) nuevos[gid] = sel;
        else if (g.req && g.tipo !== "varias") L.faltan.push(gid);
      });
      L.ops = nuevos;
      L.precio = precio(L);
      return L;
    }
    function precio(L) {
      var p = porId[L.id]; if (!p) return null;
      var base = p.t ? (p.t.filter(function (x) { return x[0] === L.tam; })[0] || [0, null])[1] : p.p;
      if (base == null) return null;
      if (L.mitad && porId[L.mitad] && porId[L.mitad].t) { var t2 = porId[L.mitad].t.filter(function (x) { return x[0] === L.tam; })[0]; if (t2) base = Math.max(base, t2[1]); }
      var extra = 0;
      if (L.salsa && salsaPorId[L.salsa]) extra += salsaPorId[L.salsa].extra || 0;
      Object.keys(L.ops || {}).forEach(function (gid) { (L.ops[gid] || []).forEach(function (nm) { var o = (GR[gid] ? GR[gid].ops : []).filter(function (x) { return x.n === nm; })[0]; if (o) extra += o.p || 0; }); });
      return Math.round((base + extra) * 100) / 100;
    }

    /* Lo que la pantalla de revisión necesita para dibujar una línea. */
    function requisitos(id, salsaId) {
      var p = porId[id]; if (!p) return null;
      return {
        id: p.id, nombre: p.n, seccion: p.sec,
        tallas: (p.t || []).map(function (x) { return { n: x[0], p: x[1] }; }),
        salsa: p.salsa, salsas: p.salsa ? salsas.map(function (s) { return { id: s.id, n: s.n, extra: s.extra || 0 }; }) : [],
        grupos: gruposDe(p, salsaId || "").map(function (gid) { var g = GR[gid]; return { id: gid, n: g.n, tipo: g.tipo, req: !!g.req, ops: g.ops.map(function (o) { return { n: o.n, p: o.p || 0 }; }) }; }),
        mitad: p.sec === "pizze" && !!p.t && p.t.length > 1 && soportaMitad,
        primerTam: p.t && p.t.length ? p.t[0][0] : "",
        estado: estado(p)
      };
    }
    function listaCategoria(sec) {
      var out = []; prods.forEach(function (p) { if (p.sec === sec && !p.agotado && !estado(p)) out.push(info(p)); }); return out;
    }
    function otrasPizzas(id, tam) {
      var out = [];
      prods.forEach(function (p) {
        if (p.id === id || p.sec !== "pizze" || p.agotado || !p.t || estado(p)) return;
        if (tam && !p.t.some(function (x) { return x[0] === tam; })) return;
        out.push({ id: p.id, nombre: p.n });
      });
      return out;
    }

    /* ---------- búsqueda por nombre aproximado y sinónimos ---------- */
    var INDICE = null;
    var SINTOK = { gaseosa: ["bibita", "gassata"], refresco: ["bibita", "gassata"], soda: ["bibita", "gassata"], gasosa: ["bibita", "gassata"], cola: ["bibita", "kola"],
                   fideo: ["pasta"], tallarin: ["pasta", "spaghetti", "fettuccine"], pasta: ["pasta"], bebida: ["bibita", "limonata", "maracuya", "acqua"],
                   postre: ["dolci", "tiramisu", "torta", "cookie"], dulce: ["dolci", "tiramisu", "torta", "cookie"], trago: ["aperitivi"], coctel: ["aperitivi"],
                   tortilla: ["frittata"], ensalada: ["insalata"], lasana: ["lasagna"], chocolate: ["cioccolato", "cioccolata", "chocolate"], galleta: ["cookie", "biscotti"],
                   agua: ["acqua"], jugo: ["maracuya", "limonata"], vino: ["vini", "vino", "calice"], copa: ["calice"], cafe: ["caffe", "caffetteria"], hongo: ["funghi"],
                   champinon: ["funghi"], queso: ["formaggio", "formaggi", "formaggi"], jamon: ["prosciutto"], pollo: ["pollo"], carne: ["carne", "ragu"], esparrago: ["asparagi"] };
    var SINTOKC = {}; Object.keys(SINTOK).forEach(function (k) { SINTOKC[canon(k)] = SINTOK[k]; });
    function construirIndice() {
      INDICE = prods.map(function (p) {
        var nombre = {}, desc = {};
        ALIAS.forEach(function (a) { if (a.dueno.tipo === "item" && a.dueno.id === p.id) a.toks.forEach(function (t) { nombre[t] = 1; }); });
        palabras(p.n_en).forEach(function (w) { nombre[canon(w)] = 1; });
        palabras(p.g + " " + p.d).forEach(function (w) { var c = canon(w); if (!nombre[c]) desc[c] = 1; });
        var sec = SEC[p.sec] || {}, secT = {};
        palabras((sec.titulo || "") + " " + p.sec).forEach(function (w) { secT[canon(w)] = 1; });
        var ops = {};
        (p.op || []).forEach(function (gid) { var g = GR[gid]; if (g && g.tipo !== "varias") g.ops.forEach(function (o) { palabras(o.n).forEach(function (w) { ops[canon(w)] = 1; }); }); });
        if (p.salsa) salsas.forEach(function (sa) { palabras(sa.n).forEach(function (w) { ops[canon(w)] = 1; }); });
        return { p: p, nombre: nombre, desc: desc, secT: secT, ops: ops };
      });
    }
    function buscar(consulta, max) {
      if (!INDICE) construirIndice();
      var qs = [];
      plano(String(consulta || "").slice(0, 120)).split(" ").forEach(function (w) { if (w && w !== "|" && !STOP[w] && !FILLER[w]) qs.push(w); });
      if (!qs.length) return [];
      var res = [];
      INDICE.forEach(function (ix) {
        var total = 0;
        for (var i = 0; i < qs.length; i++) {
          var c = canon(qs[i]), mejor = 0, alts = [c];
          var sy = SINTOKC[c]; if (sy) sy.forEach(function (x) { alts.push(canon(x)); });
          alts.forEach(function (u, k) {
            var peso = k === 0 ? 1 : 0.9;
            [[ix.nombre, 1], [ix.secT, 0.6], [ix.ops, 0.55], [ix.desc, 0.5, true]].forEach(function (par) {
              Object.keys(par[0]).forEach(function (v) {
                var s = u === v ? 1 : simBus(u, v, par[2]);
                if (s * par[1] * peso > mejor) mejor = s * par[1] * peso;
              });
            });
          });
          if (mejor < 0.4) return;
          total += mejor;
        }
        // cada palabra debe aparecer en algún sitio
        var okAll = true;
        for (var j = 0; j < qs.length && okAll; j++) {
          var cj = canon(qs[j]), alts2 = [cj], found = false;
          var sy2 = SINTOKC[cj]; if (sy2) sy2.forEach(function (x) { alts2.push(canon(x)); });
          alts2.forEach(function (u) { [[ix.nombre], [ix.secT], [ix.ops], [ix.desc, true]].forEach(function (par) { Object.keys(par[0]).forEach(function (v) { if (u === v || simBus(u, v, par[1]) > 0) found = true; }); }); });
          if (!found) okAll = false;
        }
        if (okAll && total > 0) res.push({ id: ix.p.id, nombre: ix.p.n, seccion: ix.p.sec, puntaje: total / qs.length, orden: ix.p.orden });
      });
      res.sort(function (a, b) { return b.puntaje - a.puntaje || a.orden - b.orden; });
      return res.slice(0, max || 20);
    }
    function simBus(u, v, soloPrefijo) {   // como sim(), pero la palabra escrita puede estar a medias (prefijo) y no aplica la guarda de vocabulario
      if (u === v) return 1;
      var L = Math.max(u.length, v.length);
      if (L <= 3 || u.length < 3) return 0;
      if (u.length >= 3 && v.indexOf(u) === 0) return 0.85;
      if (soloPrefijo) return 0;
      var d = dl(u, v);
      return d <= (L <= 8 ? 1 : 2) ? (d === 1 ? 0.9 : 0.8) : 0;
    }

    return { interpretar: interpretar, completar: completar, requisitos: requisitos, buscar: buscar, listaCategoria: listaCategoria, otrasPizzas: otrasPizzas,
             producto: function (id) { return porId[id] || null; }, info: info, mezclaOrigen: mezclaOrigen, soportaMitad: soportaMitad, precio: precio, salsas: salsas };
  }

  /* =====================================================================
     PARTE 2 y 3 · PANTALLAS (solo navegador)
     ===================================================================== */
  function iniciar(host) {
    if (typeof document === "undefined" || !host || !host.carta) return;
    var B = crear(host.carta, { modo: host.modo, dia: host.dia });
    root.PG_BUSQUEDA.motor = B;
    var SR = root.SpeechRecognition || root.webkitSpeechRecognition;
    estilos();
    buscadorInteligente(B);
    boton();

    function e(tag, cls, txt) { var x = document.createElement(tag); if (cls) x.className = cls; if (txt != null) x.textContent = txt; return x; }
    function soles(n) { return "S/ " + Number(n).toFixed(2); }
    function estilos() {
      var s = document.createElement("style");
      s.textContent =
        ".bq-fab{position:fixed;right:12px;bottom:calc(80px + env(safe-area-inset-bottom,0px));z-index:47;display:flex;align-items:center;justify-content:center;width:40px;height:40px;padding:0;border-radius:50%;border:2px solid var(--vino,#4a1519);background:var(--oro-claro,#c9a45c);color:var(--vino,#4a1519);box-shadow:0 3px 10px rgba(0,0,0,.35);cursor:pointer;opacity:0;visibility:hidden;transform:scale(.8);transition:opacity .25s,transform .25s,visibility 0s .25s}" +
        ".bq-fab.bq-ver{opacity:.95;visibility:visible;transform:none;transition-delay:0s}" +
        "body:has(.capa.on) .bq-fab,body:has(.bq-capa) .bq-fab{opacity:0;visibility:hidden;pointer-events:none}" +
        "@media (min-width:760px){.bq-fab{width:46px;height:46px;bottom:90px}}" +
        ".bq-fab svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}" +
        ".bq-fab:focus-visible,.bq-b:focus-visible,.bq-x:focus-visible{outline:3px solid var(--oro-claro,#c9a45c);outline-offset:2px}" +
        ".bq-capa{position:fixed;inset:0;z-index:65;background:rgba(20,8,8,.62);display:flex;align-items:flex-end;justify-content:center}" +
        ".bq-hoja{background:var(--crema-3,#f7f1e3);color:var(--tinta,#2a1b17);width:100%;max-width:640px;max-height:92vh;overflow:auto;border-radius:14px 14px 0 0;font:16px/1.4 var(--sans,system-ui)}" +
        ".bq-cab{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:14px 16px;background:var(--vino,#4a1519);color:var(--crema,#efe6d3)}" +
        ".bq-cab h2{margin:0;font:600 1.25rem var(--serif,Georgia,serif)}" +
        ".bq-x{min-width:44px;min-height:44px;border:0;background:none;color:inherit;font-size:26px;cursor:pointer}" +
        ".bq-cuerpo{padding:14px 16px 20px}" +
        ".bq-cuerpo textarea{width:100%;min-height:110px;padding:12px;border:1px solid var(--oro,#a9803f);border-radius:4px;background:#fff;font:16px/1.4 var(--sans,system-ui);color:inherit;resize:vertical;box-sizing:border-box}" +
        ".bq-ayuda{margin:6px 0 10px;color:var(--tinta-2,#5a463f);font-size:14px}" +
        ".bq-fila{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}" +
        ".bq-b{min-height:48px;padding:0 18px;border-radius:999px;border:1px solid var(--oro,#a9803f);background:var(--crema-3,#f7f1e3);color:var(--vino,#4a1519);font:700 15px var(--sans,system-ui);cursor:pointer;flex:1 1 140px}" +
        ".bq-b--p{background:var(--vino,#4a1519);color:var(--crema,#efe6d3)}" +
        ".bq-b[disabled]{opacity:.5;cursor:not-allowed}" +
        ".bq-b--rec{background:var(--rojo,#b6232a);color:#fff;border-color:var(--rojo,#b6232a)}" +
        ".bq-lin{border:1px solid rgba(169,128,63,.55);border-radius:6px;padding:10px 12px;margin:10px 0;background:#fff}" +
        ".bq-lin--rev{border-color:var(--rojo,#b6232a);border-width:2px}" +
        ".bq-lin h3{margin:0 0 6px;font:600 1.05rem var(--serif,Georgia,serif)}" +
        ".bq-lin label{display:block;font-size:13px;color:var(--tinta-2,#5a463f);margin:8px 0 2px}" +
        ".bq-lin select,.bq-lin input[type=text]{width:100%;min-height:44px;padding:0 10px;border:1px solid var(--oro,#a9803f);border-radius:4px;background:#fff;font:16px var(--sans,system-ui);color:inherit;box-sizing:border-box}" +
        ".bq-falta{border-color:var(--rojo,#b6232a)!important}" +
        ".bq-aviso{margin:6px 0 0;font-size:13.5px;color:var(--rojo,#b6232a)}" +
        ".bq-nota{margin:6px 0 0;font-size:13.5px;color:var(--tinta-2,#5a463f)}" +
        ".bq-cant{display:flex;align-items:center;gap:10px;margin-top:8px}" +
        ".bq-cant button{width:44px;height:44px;border-radius:50%;border:1px solid var(--oro,#a9803f);background:var(--crema-3,#f7f1e3);font-size:22px;color:var(--vino,#4a1519);cursor:pointer}" +
        ".bq-cant output{min-width:28px;text-align:center;font-weight:700}" +
        ".bq-quitar{margin-left:auto;background:none;border:0;color:var(--rojo,#b6232a);font:600 14px var(--sans,system-ui);min-height:44px;cursor:pointer;text-decoration:underline}" +
        ".bq-no{background:#fff7e0;border:1px solid var(--oro-claro,#c9a45c);padding:10px 12px;border-radius:6px;margin:10px 0}" +
        ".bq-total{display:flex;justify-content:space-between;font-weight:700;margin:12px 0 4px}" +
        ".bq-ok{color:var(--verde,#2f7a3a)}" +
        ".bq-pre{margin:8px 0 2px;font-weight:700}" +
        ".bq-orig{display:grid;gap:10px;margin:8px 0 4px}" +
        ".bq-opc{display:flex;gap:12px;align-items:stretch;width:100%;min-height:96px;padding:8px;border:2px solid rgba(169,128,63,.55);border-radius:8px;background:#fff;color:inherit;text-align:left;font:inherit;cursor:pointer}" +
        ".bq-opc:focus-visible{outline:3px solid var(--oro-claro,#c9a45c);outline-offset:2px}" +
        ".bq-opc[aria-pressed=true]{border-color:var(--verde,#2f7a3a);background:#f1f8ef}" +
        ".bq-foto{flex:0 0 84px;width:84px;min-height:80px;border-radius:6px;object-fit:cover;background:var(--crema,#efe6d3)}" +
        "div.bq-foto{display:flex;align-items:center;justify-content:center;color:var(--oro,#a9803f)}" +
        "div.bq-foto svg{width:36px;height:36px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round}" +
        ".bq-opc__t{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}" +
        ".bq-opc__n{font:600 1.02rem var(--serif,Georgia,serif)}" +
        ".bq-opc__s{font-size:13.5px;color:var(--tinta-2,#5a463f)}" +
        ".bq-opc__e{align-self:flex-start;font:700 12.5px var(--sans,system-ui);padding:3px 9px;border-radius:999px;background:var(--vino,#4a1519);color:var(--crema,#efe6d3)}" +
        ".bq-opc__e--t{background:var(--oro-claro,#c9a45c);color:var(--vino,#4a1519)}" +
        ".bq-opc__p{font-size:14px;font-weight:600}";
      document.head.appendChild(s);
    }

    /* ----- botón flotante ----- */
    function boton() {
      var b = e("button", "bq-fab"); b.type = "button";
      b.setAttribute("aria-label", "Pedido rápido: escribe o di tu pedido"); b.title = "Pedido rápido";
      b.setAttribute("aria-haspopup", "dialog");
      // ícono compacto: micrófono (con voz) o lápiz (sin voz); plegado por defecto, el cuadro se despliega al tocarlo
      b.innerHTML = SR ? '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l4-1 11-11-3-3L5 16l-1 4z"/></svg>';
      b.addEventListener("click", function () { abrir(""); });
      document.body.appendChild(b);
      // se muestra solo al salir de la portada (#inicio), igual que el botón de WhatsApp; sin IntersectionObserver queda visible
      var ini = document.getElementById("inicio");
      if (ini && window.IntersectionObserver) {
        new IntersectionObserver(function (es) { es.forEach(function (x) { b.classList.toggle("bq-ver", !x.isIntersecting); }); }).observe(ini);
      } else b.classList.add("bq-ver");
    }

    /* ----- ventana ----- */
    var capa = null, cuerpo, tituloEl, ultimoFoco = null, rec = null;
    function abrir(texto) {
      ultimoFoco = document.activeElement;
      capa = e("div", "bq-capa");
      var hoja = e("div", "bq-hoja"); hoja.setAttribute("role", "dialog"); hoja.setAttribute("aria-modal", "true"); hoja.setAttribute("aria-labelledby", "bq-t");
      var cab = e("div", "bq-cab"); tituloEl = e("h2", null, "Pedido rápido"); tituloEl.id = "bq-t";
      var x = e("button", "bq-x", "×"); x.type = "button"; x.setAttribute("aria-label", "Cerrar"); x.addEventListener("click", cerrar);
      cab.appendChild(tituloEl); cab.appendChild(x);
      cuerpo = e("div", "bq-cuerpo"); cuerpo.setAttribute("aria-live", "polite");
      hoja.appendChild(cab); hoja.appendChild(cuerpo); capa.appendChild(hoja);
      capa.addEventListener("click", function (ev) { if (ev.target === capa) cerrar(); });
      capa.addEventListener("keydown", function (ev) { if (ev.key === "Escape") cerrar(); });
      document.body.appendChild(capa);
      pantallaEntrada(texto || "");
    }
    function cerrar() {
      if (rec) { try { rec.abort(); } catch (er) { } rec = null; }
      if (capa && capa.parentNode) capa.parentNode.removeChild(capa);
      capa = null;
      if (ultimoFoco && ultimoFoco.focus) { try { ultimoFoco.focus(); } catch (er) { } }
    }
    function limpiar() { while (cuerpo.firstChild) cuerpo.removeChild(cuerpo.firstChild); }

    /* ----- pantalla 1: escribir o hablar ----- */
    function pantallaEntrada(texto) {
      limpiar(); tituloEl.textContent = "Pedido rápido";
      cuerpo.appendChild(e("p", "bq-ayuda", "Escribe o di lo que quieres. Ejemplo: \"dos pizzas hawaianas medianas y una inca kola de litro\". Antes de agregar nada, vas a poder revisarlo."));
      var ta = e("textarea"); ta.setAttribute("aria-label", "Tu pedido"); ta.maxLength = 600; ta.value = texto; ta.placeholder = "Mi pedido…";
      cuerpo.appendChild(ta);
      var estadoV = e("p", "bq-ayuda"); estadoV.setAttribute("role", "status"); cuerpo.appendChild(estadoV);
      var fila = e("div", "bq-fila");
      var mic = null;
      if (SR) {
        mic = e("button", "bq-b", "🎤 Hablar"); mic.type = "button";
        mic.addEventListener("click", function () { if (rec) { try { rec.stop(); } catch (er) { } return; } hablar(ta, mic, estadoV); });
        fila.appendChild(mic);
      }
      var ok = e("button", "bq-b bq-b--p", "Entender mi pedido"); ok.type = "button";
      ok.addEventListener("click", function () { revisar(ta.value); });
      fila.appendChild(ok);
      cuerpo.appendChild(fila);
      setTimeout(function () { try { ta.focus(); } catch (er) { } }, 30);
    }
    function hablar(ta, mic, estadoV) {
      var r;
      try { r = new SR(); } catch (er) { estadoV.textContent = "No se pudo activar el micrófono. Puedes escribir tu pedido."; return; }
      rec = r; r.lang = "es-PE"; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
      var base = ta.value ? ta.value.replace(/\s+$/, "") + " " : "", final = "";
      mic.textContent = "■ Detener"; mic.classList.add("bq-b--rec"); estadoV.textContent = "Escuchando… habla ahora.";
      r.onresult = function (ev) {
        var interino = "";
        for (var i = ev.resultIndex; i < ev.results.length; i++) { if (ev.results[i].isFinal) final += ev.results[i][0].transcript + " "; else interino += ev.results[i][0].transcript; }
        ta.value = (base + final + interino).slice(0, 600);
      };
      r.onerror = function (ev) {
        var c = ev && ev.error;
        estadoV.textContent = c === "not-allowed" || c === "service-not-allowed" ? "Necesitamos permiso del micrófono. Puedes escribir tu pedido." :
          c === "no-speech" ? "No te escuchamos. Intenta de nuevo o escribe tu pedido." : "No pudimos escuchar. Puedes escribir tu pedido.";
      };
      r.onend = function () {
        rec = null; mic.textContent = "🎤 Hablar"; mic.classList.remove("bq-b--rec");
        if (ta.value.replace(/\s/g, "")) { estadoV.textContent = "Listo. Revisa el texto y toca \"Entender mi pedido\"."; }
      };
      try { r.start(); } catch (er) { rec = null; mic.textContent = "🎤 Hablar"; mic.classList.remove("bq-b--rec"); estadoV.textContent = "No se pudo activar el micrófono. Puedes escribir tu pedido."; }
    }

    /* ----- pantalla 2: revisión editable (nunca agrega sin confirmar) ----- */
    var ESTADO = null;
    function revisar(texto) {
      var r = B.interpretar(texto);
      ESTADO = { texto: texto, r: r, lineas: r.lineas };
      pintarRevision();
    }
    function pintarRevision() {
      limpiar(); tituloEl.textContent = "Revisa tu pedido";
      var r = ESTADO.r, L = ESTADO.lineas;
      if (!L.length) {
        cuerpo.appendChild(e("p", null, "No encontramos platos en lo que escribiste."));
        noEntendido(r);
        var f0 = e("div", "bq-fila"); var vb = e("button", "bq-b bq-b--p", "Volver a escribir"); vb.type = "button"; vb.addEventListener("click", function () { pantallaEntrada(ESTADO.texto); });
        f0.appendChild(vb); cuerpo.appendChild(f0); return;
      }
      cuerpo.appendChild(e("p", "bq-ayuda", "Esto entendimos. Corrige lo que haga falta: todavía no se agregó nada."));
      r.avisos.forEach(function (a) { cuerpo.appendChild(e("p", "bq-aviso", a)); });
      L.forEach(function (l, ix) { cuerpo.appendChild(tarjeta(l, ix)); });
      noEntendido(r);
      var falta = [], total = 0;
      L.forEach(function (l) {
        var pid = host.puedePedir ? host.puedePedir(l.id) : true;
        if (l.faltan.length) falta.push((l.nombre || "un plato") + ": falta elegir"); else if (!l.pedible || (l.id && !pid)) falta.push((l.nombre || "un plato") + " no está disponible");
        if (l.precio != null) total += l.precio * l.cant;
      });
      var t = e("div", "bq-total"); t.appendChild(e("span", null, "Total estimado")); t.appendChild(e("span", null, soles(total))); cuerpo.appendChild(t);
      cuerpo.appendChild(e("p", "bq-ayuda", "El precio final lo confirmamos en tu pedido."));
      var msg = e("p", "bq-aviso"); msg.setAttribute("role", "alert");
      var abierto = host.acepta ? host.acepta() : true;
      if (!abierto) falta.push("Ahora no estamos recibiendo pedidos");
      msg.textContent = falta.length ? "Para agregar: " + falta.slice(0, 3).join(" · ") : "";
      cuerpo.appendChild(msg);
      var fila = e("div", "bq-fila");
      var atras = e("button", "bq-b", "← Editar texto"); atras.type = "button"; atras.addEventListener("click", function () { pantallaEntrada(ESTADO.texto); });
      var add = e("button", "bq-b bq-b--p", "Agregar al pedido"); add.type = "button";
      add.disabled = falta.length > 0; add.setAttribute("aria-disabled", falta.length ? "true" : "false");
      add.addEventListener("click", confirmar);
      fila.appendChild(atras); fila.appendChild(add); cuerpo.appendChild(fila);
    }
    function noEntendido(r) {
      if (!r.noEntendido.length) return;
      var n = e("div", "bq-no");
      n.appendChild(e("strong", null, "No entendimos esto:"));
      var ul = e("ul"); r.noEntendido.forEach(function (x) { ul.appendChild(e("li", null, "«" + x + "»")); }); n.appendChild(ul);
      n.appendChild(e("span", null, "No lo agregamos. Búscalo en la carta o vuelve a escribirlo."));
      cuerpo.appendChild(n);
    }
    function opt(sel, valor, texto, marcado) { var o = e("option", null, texto); o.value = valor; if (marcado) o.selected = true; sel.appendChild(o); }
    function campo(tarjetaEl, etiqueta, sel, falta) {
      var lab = e("label", null, etiqueta); tarjetaEl.appendChild(lab); sel.setAttribute("aria-label", etiqueta);
      if (falta) sel.classList.add("bq-falta"); tarjetaEl.appendChild(sel);
    }
    function tarjeta(l, ix) {
      var c = e("div", "bq-lin" + (l.revisar || l.faltan.length ? " bq-lin--rev" : ""));
      var comun = l.origen && l.alternativas.length && l.alternativas.every(function (a) { return a.nombre === l.alternativas[0].nombre; }) ? l.alternativas[0].nombre : "";
      c.appendChild(e("h3", null, l.nombre || comun || "¿Cuál quieres?"));
      if (l.texto) c.appendChild(e("p", "bq-nota", "Dijiste: «" + l.texto + "»"));
      // elegir producto (siempre editable: lista de alternativas o de la categoría)
      var alt = l.alternativas.slice();
      if (l.id && !alt.some(function (a) { return a.id === l.id; })) alt.unshift({ id: l.id, nombre: l.nombre });
      if (!l.id && !alt.length && l.categoria) alt = B.listaCategoria(l.categoria);
      if (l.salsaTienda && !l.id) {
        c.appendChild(preguntaSalsaTienda(l, ix));
        c.appendChild(e("p", "bq-pre", "O elige la pasta del restaurante que llevará esta salsa:"));
      }
      if (l.origen && alt.length > 1 && B.mezclaOrigen(alt)) {
        c.appendChild(preguntaOrigen(alt, l, ix));
      } else if (alt.length > 1 || !l.id) {
        var s = e("select");
        var mixto = B.mezclaOrigen(alt);   // restaurante y tienda en la misma lista: se indica de dónde es cada uno
        opt(s, "", "Elige…", !l.id); alt.forEach(function (a) { opt(s, a.id, a.nombre + (mixto && a.etiqueta ? " · " + a.etiqueta : ""), a.id === l.id); });
        s.addEventListener("change", function () { cambiarProducto(ix, s.value); });
        campo(c, "Plato", s, !l.id);
      }
      if (l.id) {
        var rq = B.requisitos(l.id, l.salsa);
        if (rq.tallas.length) {
          var st = e("select"); opt(st, "", "Elige tamaño…", !l.tam);
          rq.tallas.forEach(function (t) { if (l.mitad && t.n === rq.primerTam) return; opt(st, t.n, t.n + " · " + soles(t.p), t.n === l.tam); });
          st.addEventListener("change", function () { l.tam = st.value; recalcular(ix); });
          campo(c, "Tamaño", st, !l.tam);
        }
        if (rq.mitad && l.tam && l.tam !== rq.primerTam) {
          var sm = e("select"); opt(sm, "", "Un solo sabor", !l.mitad);
          B.otrasPizzas(l.id, l.tam).forEach(function (a) { opt(sm, a.id, a.nombre, a.id === l.mitad); });
          sm.addEventListener("change", function () { l.mitad = sm.value; recalcular(ix); });
          campo(c, "Mitad y mitad (opcional): segundo sabor", sm, false);
        }
        if (rq.salsa) {
          var ss = e("select"); opt(ss, "", "Elige salsa…", !l.salsa);
          rq.salsas.forEach(function (x) { opt(ss, x.id, x.n + (x.extra ? " · +" + soles(x.extra) : ""), x.id === l.salsa); });
          ss.addEventListener("change", function () { l.salsa = ss.value; recalcular(ix); });
          campo(c, "Salsa", ss, !l.salsa);
        }
        rq.grupos.forEach(function (g) {
          if (g.tipo === "varias") return;    // los adicionales se agregan desde la carta; aquí solo se respetan si los dijiste
          var sg = e("select"), cur = (l.ops[g.id] || [])[0] || "";
          opt(sg, "", g.req ? "Elige…" : "Ninguno", !cur);
          g.ops.forEach(function (o) { opt(sg, o.n, o.n + (o.p ? " · +" + soles(o.p) : ""), o.n === cur); });
          sg.addEventListener("change", function () { if (sg.value) l.ops[g.id] = [sg.value]; else delete l.ops[g.id]; recalcular(ix); });
          campo(c, g.n + (g.req ? "" : " (opcional)"), sg, g.req && !cur);
        });
        var extras = Object.keys(l.ops).filter(function (gid) { var rg = rq.grupos.filter(function (g) { return g.id === gid; })[0]; return rg && rg.tipo === "varias"; });
        extras.forEach(function (gid) { c.appendChild(e("p", "bq-nota", "Adicional: " + l.ops[gid].join(", "))); });
      }
      if (l.nota) {
        var ni = e("input"); ni.type = "text"; ni.maxLength = 120; ni.value = l.nota;
        ni.addEventListener("input", function () { l.nota = ni.value.replace(/[<>]/g, ""); });
        campo(c, "Nota para cocina", ni, false);
      }
      l.avisos.forEach(function (a) { c.appendChild(e("p", "bq-aviso", a)); });
      if (l.motivo) c.appendChild(e("p", "bq-aviso", l.motivo));
      if (l.id && host.puedePedir && !l.motivo && !host.puedePedir(l.id)) c.appendChild(e("p", "bq-aviso", "Este plato no se puede pedir ahora."));
      var cant = e("div", "bq-cant");
      var menos = e("button", null, "−"); menos.type = "button"; menos.setAttribute("aria-label", "Menos");
      var out = e("output", null, String(l.cant)); out.setAttribute("aria-live", "polite");
      var mas = e("button", null, "+"); mas.type = "button"; mas.setAttribute("aria-label", "Más");
      menos.addEventListener("click", function () { if (l.cant > 1) { l.cant--; l.cantImplicita = false; pintarRevision(); } });
      mas.addEventListener("click", function () { if (l.cant < 20) { l.cant++; l.cantImplicita = false; pintarRevision(); } });
      cant.appendChild(menos); cant.appendChild(out); cant.appendChild(mas);
      if (l.cantImplicita) cant.appendChild(e("span", "bq-nota", "(1 por defecto)"));
      if (l.precio != null) cant.appendChild(e("span", "bq-nota", soles(l.precio * l.cant)));
      var q = e("button", "bq-quitar", "Quitar"); q.type = "button"; q.setAttribute("aria-label", "Quitar " + (l.nombre || "este plato"));
      q.addEventListener("click", function () { ESTADO.lineas.splice(ix, 1); pintarRevision(); });
      cant.appendChild(q);
      c.appendChild(cant);
      return c;
    }
    /* "¿Para comer en el restaurante o para llevar y cocinar en casa?": tarjetas con foto, nombre, tamaño/precio y etiqueta. */
    function fotoSegura(u) { u = String(u || ""); return /^(fotos\/|https:\/\/)[^\s"'<>]+$/.test(u) ? u : ""; }
    function preguntaOrigen(alt, l, ix) {
      var cont = e("div");
      cont.appendChild(e("p", "bq-pre", "¿Para comer en el restaurante (caliente, lista para servir) o para llevar y cocinar en casa (precocida)?"));
      var lista = e("div", "bq-orig"); lista.setAttribute("role", "group"); lista.setAttribute("aria-label", "Elige dónde lo quieres");
      alt.slice().sort(function (a, b) { return (a.tienda ? 1 : 0) - (b.tienda ? 1 : 0); }).forEach(function (a) {
        lista.appendChild(tarjetaOpcion(a, a.id === l.id, function () { cambiarProducto(ix, a.id); }));
      });
      cont.appendChild(lista);
      return cont;
    }
    function tarjetaOpcion(a, marcada, alElegir) {
      var b = e("button", "bq-opc"); b.type = "button"; b.setAttribute("aria-pressed", marcada ? "true" : "false");
      var f = fotoSegura(a.foto), im;
      if (f) { im = e("img", "bq-foto"); im.src = f; im.alt = ""; im.loading = "lazy"; im.addEventListener("error", function () { if (im.parentNode) im.parentNode.replaceChild(placeholderFoto(), im); }); }
      else im = placeholderFoto();
      b.appendChild(im);
      var t = e("span", "bq-opc__t");
      t.appendChild(e("span", "bq-opc__e" + (a.tienda ? " bq-opc__e--t" : ""), a.etiqueta));
      t.appendChild(e("span", "bq-opc__n", a.nombre));
      if (a.sub) t.appendChild(e("span", "bq-opc__s", a.sub));
      t.appendChild(e("span", "bq-opc__s", a.tienda ? "Para cocinar en casa" : "Caliente, lista para servir"));
      var pr = a.precios.map(function (x) { return (x.n ? x.n + " · " : "") + soles(x.p); }).join("   ");
      if (pr) t.appendChild(e("span", "bq-opc__p", pr));
      b.appendChild(t);
      b.setAttribute("aria-label", a.etiqueta + ": " + a.nombre + (pr ? ", " + pr : ""));
      b.addEventListener("click", alElegir);
      return b;
    }
    function preguntaSalsaTienda(l, ix) {
      var cont = e("div");
      cont.appendChild(e("p", "bq-pre", "¿Quieres la salsa para llevar y calentar en casa (precocida), sin pasta del restaurante?"));
      var lista = e("div", "bq-orig");
      l.salsaTienda.forEach(function (a) { lista.appendChild(tarjetaOpcion(a, false, function () { cambiarProducto(ix, a.id); })); });
      cont.appendChild(lista);
      return cont;
    }
    function placeholderFoto() {
      var d = e("div", "bq-foto"); d.setAttribute("aria-hidden", "true");
      d.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/></svg>';
      return d;
    }
    function cambiarProducto(ix, id) {
      var l = ESTADO.lineas[ix];
      l.id = id; l.tam = ""; l.salsa = ""; l.ops = {}; l.mitad = ""; l.confianza = id ? 0.9 : 0; l.revisar = !id; l.avisos = []; l.alternativas = l.alternativas;
      if (id) { var p = B.producto(id); l.nombre = p.n; }
      recalcular(ix);
    }
    function recalcular(ix) { B.completar(ESTADO.lineas[ix]); pintarRevision(); }

    function confirmar() {
      var L = ESTADO.lineas, ok = 0, fallo = [];
      if (host.acepta && !host.acepta()) { pintarRevision(); return; }
      L.forEach(function (l) { B.completar(l); });
      if (L.some(function (l) { return l.faltan.length || !l.pedible || (host.puedePedir && !host.puedePedir(l.id)); })) { pintarRevision(); return; }
      L.forEach(function (l) {
        var hecho = false;
        try { hecho = host.agregar({ id: l.id, tam: l.tam, salsa: l.salsa, ops: l.ops, mitad: l.mitad, nota: l.nota, cant: l.cant }); } catch (er) { hecho = false; }
        if (hecho) ok++; else fallo.push(l.nombre);
      });
      if (fallo.length) {
        limpiar(); tituloEl.textContent = "Casi listo";
        cuerpo.appendChild(e("p", null, "Agregamos " + ok + " y no pudimos agregar: " + fallo.join(", ") + ". Búscalos en la carta."));
        var b = e("button", "bq-b bq-b--p", "Cerrar"); b.type = "button"; b.addEventListener("click", cerrar); cuerpo.appendChild(b);
      } else cerrar();
    }

    /* ----- búsqueda inteligente: se suma a la lupa de la carta (no la reemplaza) ----- */
    function buscadorInteligente(B2) {
      var intentos = 0;
      var t = setInterval(function () {
        var inp = document.getElementById("q");
        if (!inp && ++intentos < 60) return;
        clearInterval(t); if (!inp) return;
        var norm = function (s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, ""); };
        var mapa = {};
        host.carta.secciones.forEach(function (s) { (s.grupos || []).forEach(function (g) { (g.items || []).forEach(function (it) {
          mapa[norm([it.n, it.g, it.d, it.n_en, it.g_en, it.d_en].join(" "))] = it.id; }); }); });
        inp.addEventListener("input", function () {
          var c = norm(inp.value).trim(); if (!c) return;
          var ids = {}; B2.buscar(inp.value, 40).forEach(function (r) { ids[r.id] = 1; });
          var total = 0;
          document.querySelectorAll(".sec").forEach(function (sec) {
            var vis = 0;
            sec.querySelectorAll(".grupo").forEach(function (g) {
              var gv = 0;
              g.querySelectorAll(".it").forEach(function (it) {
                var id = mapa[it.getAttribute("data-q")];
                var mostrar = !it.classList.contains("oculto") || (id && ids[id]);
                it.classList.toggle("oculto", !mostrar);
                if (mostrar) { gv++; it.classList.add("ya"); }
              });
              g.classList.toggle("oculto", !gv); vis += gv;
            });
            sec.classList.toggle("oculto", !vis); total += vis;
          });
          var v = document.getElementById("vacio"); if (v) v.classList.toggle("hay", total === 0);
        });
      }, 150);
    }
  }

  root.PG_BUSQUEDA = { crear: crear, iniciar: iniciar, version: "1.0" };
})(typeof window !== "undefined" ? window : this);
