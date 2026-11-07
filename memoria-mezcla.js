/* Memória do progresso pelo e-mail da compra (14/10): o que vai para o servidor e como juntar dois lados.
 * O MESMO arquivo roda no app (window.MemoriaMezcla) e na função netlify/functions/memoria.mjs (require):
 * a regra de juntar mora num lugar só.
 *
 * Vai para o servidor SÓ: progresso (início, dias feitos, racha, Activación 7D, mensagens lidas, "Ir a día")
 * e o cadastro (nome, idade, há quanto tempo, horário) + marcas de "já viu" (vídeo, pop-up do Dia 1, questionário,
 * aviso de novidade). NUNCA: as respostas do questionário (molesta/objetivo, intentos, decisivo, miedos, ingreso),
 * o chat, os códigos dos upsells, a sessão do MOBPAY, o e-mail em texto.
 *
 * Juntar = fica o mais avançado: dias feitos somam, a racha soma, o início mais antigo vale.
 * Exceção: o "Ir a día" é escolha da pessoa; o mais recente decide o início e os dias marcados como "recuperado".
 */
(function (raiz) {
  'use strict';

  var DATA = /^\d{4}-\d{2}-\d{2}$/;
  var CAD = ['edad', 'tiempo', 'horario'];          // cadastro sem nada do questionário
  var MARCAS = ['cadastroOk', 'videoVisto', 'popupDia1', 'encuesta'];

  function txt(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F<>]/g, '').trim().slice(0, max); }
  function num(v, min, max) { v = Number(v); return isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : min; }
  function datas(lista, max) {
    var vistos = {}, out = [];
    (Array.isArray(lista) ? lista : []).forEach(function (d) { d = String(d || ''); if (DATA.test(d) && !vistos[d]) { vistos[d] = 1; out.push(d); } });
    return out.sort().slice(-max);
  }

  // Deixa só os campos conhecidos, com tipo e tamanho certos (vale para o que vem do aparelho e do servidor).
  function limpar(d) {
    d = d && typeof d === 'object' ? d : {};
    var out = { v: 1, nombre: txt(d.nombre, 30), perfil: {}, perfilTs: num(d.perfilTs, 0, 9e15) };
    var p = d.perfil && typeof d.perfil === 'object' ? d.perfil : {};
    CAD.forEach(function (k) { var v = txt(p[k], 60); if (v) out.perfil[k] = v; });
    MARCAS.forEach(function (k) { out[k] = !!d[k]; });
    out.inicio = DATA.test(String(d.inicio || '')) ? String(d.inicio) : null;
    out.inicioManual = !!d.inicioManual;
    out.iad = d.iad && typeof d.iad === 'object' && Number(d.iad.ts) > 0 ? { dia: num(d.iad.dia, 1, 21), ts: num(d.iad.ts, 0, 9e15) } : null;
    out.completados = {};
    var c = d.completados && typeof d.completados === 'object' ? d.completados : {};
    Object.keys(c).forEach(function (k) {
      var n = Number(k);
      if (!(n >= 1 && n <= 21) || Math.round(n) !== n) return;
      var e = c[k] && typeof c[k] === 'object' ? c[k] : {};
      var f = e.fecha === 'recuperado' ? 'recuperado' : DATA.test(String(e.fecha || '')) ? String(e.fecha) : 'recuperado';
      out.completados[n] = { fecha: f, seg: num(e.seg, 0, 86400) };
    });
    out.activos = datas(d.activos, 90);
    out.up1Dias = datas(d.up1Dias, 14);
    out.leidos = (Array.isArray(d.leidos) ? d.leidos : []).map(Number).filter(function (n, i, a) { return n >= 1 && n <= 21 && a.indexOf(n) === i; }).sort(function (a, b) { return a - b; });
    out.novedad = /^[A-Za-z0-9._-]{1,40}$/.test(String(d.novedad || '')) ? String(d.novedad) : '';
    return out;
  }

  // Tem algo que valha guardar? (quem só digitou o e-mail não cria registro)
  function temConteudo(d) {
    d = limpar(d);
    return !!(d.cadastroOk || d.nombre || Object.keys(d.completados).length || d.up1Dias.length || d.iad);
  }

  function mezclarDia(x, y) {
    if (!x) return y; if (!y) return x;
    var rx = x.fecha !== 'recuperado', ry = y.fecha !== 'recuperado';
    if (rx && !ry) return x;
    if (ry && !rx) return y;
    if (!rx && !ry) return x;
    return { fecha: x.fecha <= y.fecha ? x.fecha : y.fecha, seg: Math.max(x.seg || 0, y.seg || 0) };
  }

  // a = este lado (aparelho ou o que chegou), b = o outro (servidor ou o guardado).
  function mezclar(a, b) {
    a = limpar(a); b = limpar(b);
    var out = { v: 1 };
    // Cadastro: o mais recente manda; o que faltar vem do outro lado.
    var pa = (a.perfilTs || 0) >= (b.perfilTs || 0) ? a : b, pb = pa === a ? b : a;
    out.nombre = pa.nombre || pb.nombre;
    out.perfil = {};
    CAD.forEach(function (k) { var v = pa.perfil[k] || pb.perfil[k]; if (v) out.perfil[k] = v; });
    out.perfilTs = Math.max(a.perfilTs || 0, b.perfilTs || 0);
    MARCAS.forEach(function (k) { out[k] = !!(a[k] || b[k]); });
    // "Ir a día": o mais recente decide o início; sem ele, vale o início mais antigo (o dia mais avançado).
    var ia = a.iad ? a.iad.ts : 0, ib = b.iad ? b.iad.ts : 0;
    var lado = ia || ib ? (ia > ib ? a : ib > ia ? b : null) : null;
    out.iad = lado ? lado.iad : (a.iad || b.iad);
    if (lado && lado.inicio) { out.inicio = lado.inicio; out.inicioManual = lado.inicioManual; }
    else {
      var ini = [a.inicio, b.inicio].filter(Boolean).sort();
      out.inicio = ini[0] || null;
      out.inicioManual = out.inicio ? (out.inicio === a.inicio ? a.inicioManual : b.inicioManual) : false;
    }
    // Dias feitos: soma dos dois. Os "recuperado" seguem o último "Ir a día" (os de depois dele saem).
    out.completados = {};
    for (var n = 1; n <= 21; n++) {
      var e = mezclarDia(a.completados[n], b.completados[n]);
      if (e && e.fecha === 'recuperado' && out.iad && n >= out.iad.dia) e = null;
      if (e) out.completados[n] = e;
    }
    out.activos = datas(a.activos.concat(b.activos), 90);
    out.up1Dias = datas(a.up1Dias.concat(b.up1Dias), 14);
    out.leidos = a.leidos.concat(b.leidos).filter(function (x, i, l) { return l.indexOf(x) === i; }).sort(function (x, y) { return x - y; });
    out.novedad = a.novedad > b.novedad ? a.novedad : b.novedad;
    return limpar(out);   // mesma forma e ordem de campos de sempre (dá para comparar com JSON.stringify)
  }

  var API = { limpar: limpar, mezclar: mezclar, temConteudo: temConteudo, CAD: CAD, MARCAS: MARCAS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.MemoriaMezcla = API;
})(typeof window !== 'undefined' ? window : this);
