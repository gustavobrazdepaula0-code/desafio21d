/* Desafío 21 Días · app v2
 * Molde: o app do Gui (abas simples, cadastro em 5 passos, "montando", sessão "misión", a assistente Clara no app, PWA, "Ir a día").
 * O que é nosso: liberação de 1 dia por dia de calendário desde a compra, timer APRIETA/SUELTA, medalhas e racha,
 * a fase 3 "la señal", e a chave da IA só no servidor.
 * Dados: datos/config.js (dono), datos/programa.js, mensajes.js, upsells.js, bonos.js, cifrado.js (gerados pelo montar_v2.py).
 * Desde 14/10 quem fala em todo o app é a Clara (CONFIG.AGENTE): no chat, nas mensagens dos dias e no áudio de boas-vindas.
 */
(function () {
'use strict';

var C = window.CONFIG || {};
var P = window.PROGRAMA || { fases: [], dias: [], ejercicios: {}, lecciones: {}, tiempos: {} };
var M = window.MENSAJES || {};   // mensagens, cadastro, avisos (datos/mensajes.js)
var U = window.UPSELLS || {};
var B = window.BONOS || {};
var CIFRADO = window.UPP_CIFRADO || {};
var MZ = window.MemoriaMezcla || null;   // memória pelo e-mail (memoria-mezcla.js); sem ela, o app segue só com o aparelho

var KEY = 'tdc2';
var OLD_KEY = 'tdc_state';
var CODE_KEY = { up1: 'tdc_upp1_code', up2: 'tdc_upp2_code' };   // mesmas chaves do app antigo (migração)
var UPP_ID = { up1: 'upp1', up2: 'upp2' };                        // id do bloco cifrado
var EN_PROD = location.hostname === C.PROD_HOST;
var DEMO = /[?&]demo=([a-z,]+)/.exec(location.search);
DEMO = DEMO ? DEMO[1].split(',') : [];

/* =====================================================================
 * Utilidades
 * ===================================================================== */
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function fmt(s, vars) { return String(s == null ? '' : s).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : m; }); }
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function hoyStr(d) { d = d || new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function parseDia(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
function sumarDias(s, n) { var d = parseDia(s); d.setDate(d.getDate() + n); return hoyStr(d); }
function diasEntre(a, b) { return Math.round((parseDia(b) - parseDia(a)) / 86400000); }
var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
var SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
function fechaCorta(s) {
  if (s === sumarDias(hoyStr(), 1)) return 'mañana';
  if (s === hoyStr()) return 'hoy';
  var d = parseDia(s); return SEMANA[d.getDay()] + ' ' + d.getDate() + ' ' + MESES[d.getMonth()];
}
function fechaLarga(s) { var d = parseDia(s); return d.getDate() + ' de ' + ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][d.getMonth()]; }
function mmss(seg) { seg = Math.max(0, Math.round(seg)); return Math.floor(seg / 60) + ':' + pad2(seg % 60); }
function sinFlecha(s) { return String(s || '').replace(/\s*→\s*$/, ''); }
function tx(s) { return fmt(s, { nombre: esc(primerNombre()), email: esc((S && S.email) || 'el correo de tu compra') }); }
function primerNombre() { return String(S.nombre || '').trim().split(/\s+/)[0] || ''; }
function iniciales(n) { return String(n || '?').trim().split(/\s+/).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase() || '?'; }
function parrafos(arr) { return (Array.isArray(arr) ? arr : [arr]).filter(Boolean).map(function (p) { return '<p>' + p + '</p>'; }).join(''); }
function vibrar(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }
function scrollTop() { window.scrollTo(0, 0); }

/* =====================================================================
 * Estado (localStorage) + migração do app antigo
 * ===================================================================== */
var S = null;
function estadoNuevo() {
  return {
    v: 2, email: '', nombre: '', perfil: {}, cadastroOk: false, videoVisto: false,
    acceso: { modo: '', compra: null, consulta: 0 },
    inicio: null, inicioManual: false,
    completados: {}, activos: [], sesion: null,
    up: { up1: false, up2: false },
    leidos: [], msgTs: {}, chat: [], popupDia1: false,
    inst: { entrada: false, dia1: false },
    senal: {}, autoeval: null, oferta: {},
    sonido: true, encuesta: false, cadastroEnviado: false, bonoNuevo: false,
    perfilTs: 0, iad: null, novedad: '', sinTarjeta: false, ofSinTarjeta: false
  };
}
function cargar() {
  var raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  S = Object.assign(estadoNuevo(), raw || {});
  ['perfil', 'acceso', 'completados', 'up', 'msgTs', 'inst', 'senal', 'oferta'].forEach(function (k) { if (!S[k] || typeof S[k] !== 'object') S[k] = estadoNuevo()[k]; });
  ['activos', 'leidos', 'chat'].forEach(function (k) { if (!Array.isArray(S[k])) S[k] = []; });
  if (!raw) migrar();
}
function guardarLocal() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
function guardar() { guardarLocal(); memProgramar(); }

/* =====================================================================
 * Memória no servidor pelo e-mail da compra (14/10)
 * O aparelho continua sendo a primeira fonte: o app abre e funciona com o localStorage. A função `memoria`
 * guarda uma cópia do progresso e do cadastro (sem o questionário) e junta com o de outros aparelhos:
 * fica o mais avançado (memoria-mezcla.js, a mesma regra no app e no servidor). Se a função falhar, nada trava.
 * ===================================================================== */
var MEM = { ultimo: '', timer: null, voo: null, falhaAte: 0, listo: Promise.resolve() };
function memUrl() { return (C.API && C.API.memoria) || ''; }
function memAtiva() { return !!(MZ && memUrl() && S && S.email); }
function memSubset() {
  var p = S.perfil || {};
  return MZ.limpar({ nombre: S.nombre, perfil: { edad: p.edad, tiempo: p.tiempo, horario: p.horario }, perfilTs: S.perfilTs,
    cadastroOk: S.cadastroOk, videoVisto: S.videoVisto, popupDia1: S.popupDia1, encuesta: S.encuesta,
    inicio: S.inicio, inicioManual: S.inicioManual, iad: S.iad, completados: S.completados, activos: S.activos,
    up1Dias: S.up1Dias, leidos: S.leidos, novedad: S.novedad });
}
// Põe no estado o que veio juntado. Só os campos da memória: o resto do aparelho (questionário, chat, códigos) fica.
function memAplicar(d) {
  if (d.nombre) S.nombre = d.nombre;
  MZ.CAD.forEach(function (k) { if (d.perfil[k]) S.perfil[k] = d.perfil[k]; });
  S.perfilTs = d.perfilTs;
  MZ.MARCAS.forEach(function (k) { if (d[k]) S[k] = true; });
  // Com a data da compra vinda do MOBPAY, o calendário é dela (aplicarAcceso).
  if (d.inicio && !S.acceso.desde) { S.inicio = d.inicio; S.inicioManual = d.inicioManual; }
  S.iad = d.iad;
  S.completados = {}; Object.keys(d.completados).forEach(function (k) { S.completados[k] = d.completados[k]; });
  S.activos = d.activos.slice();
  S.up1Dias = d.up1Dias.slice();
  S.leidos = d.leidos.slice();
  S.novedad = d.novedad;
}
// Lê e grava num pedido só: manda o que o aparelho tem e recebe o resultado juntado. ms = tempo máximo de espera.
function memSync(ms) {
  if (!memAtiva()) return Promise.resolve(false);
  if (MEM.voo) return MEM.voo;
  clearTimeout(MEM.timer);
  var enviado = memSubset(), env = JSON.stringify(enviado);
  var p = api(memUrl(), { email: S.email, datos: enviado }, ms || 8000).then(function (r) {
    if (!r || r._status !== 200 || !r.ok) { MEM.falhaAte = Date.now() + 60000; return false; }
    var agora = memSubset();
    var m = r.datos ? MZ.mezclar(agora, r.datos) : agora;
    memAplicar(m); guardarLocal();
    MEM.ultimo = JSON.stringify(memSubset());
    if (JSON.stringify(agora) !== env) memProgramar();   // mudou algo enquanto o pedido ia e voltava
    return JSON.stringify(agora) !== MEM.ultimo;          // true = veio novidade de outro aparelho
  }).catch(function () { MEM.falhaAte = Date.now() + 60000; return false; });
  MEM.voo = p.then(function (x) { MEM.voo = null; return x; });
  return MEM.voo;
}
// Depois de cada guardar: se o que vai para a memória mudou, grava em 2,5 s (junta vários toques num pedido).
function memProgramar() {
  if (!memAtiva()) return;
  clearTimeout(MEM.timer);
  // Depois de uma falha (sem internet, função fora), espera 1 min antes de tentar de novo.
  MEM.timer = setTimeout(function () { if (JSON.stringify(memSubset()) !== MEM.ultimo) memSync(); }, Math.max(2500, MEM.falhaAte - Date.now()));
}
// Espera a primeira leitura da abertura, no máximo ms.
function memListo(ms) { return Promise.race([MEM.listo, new Promise(function (r) { setTimeout(r, ms || 3000); })]); }
// Voltou memória de outro aparelho com o app já aberto: redesenha onde ele está.
function memRedesenhar() {
  var em = function (id) { var el = $('s-' + id); return el && el.classList.contains('on'); };
  if ((em('login') || em('cadastro')) && S.cadastroOk && logado()) { seguirFlujo(); return; }
  if (PL) return;
  if (em('inicio')) renderInicio();
  else if (em('perfil')) renderPerfil();
  if ($('nav') && !$('nav').classList.contains('hidden')) renderNav();
}

// Quem já usava o app antigo entra direto (direito adquirido): nome, e-mail, início e dias feitos vêm junto.
function migrar() {
  var o = null;
  try { o = JSON.parse(localStorage.getItem(OLD_KEY) || 'null'); } catch (e) {}
  if (!o || !o.userName) return;
  S.nombre = o.userName || '';
  S.email = (o.userEmail || '').toLowerCase();
  S.inicio = o.journey_start || hoyStr();
  (o.completedDays || []).forEach(function (d) { S.completados[d] = { fecha: sumarDias(S.inicio, d - 1), seg: 0 }; });
  (o.active_days || []).forEach(function (d) { if (S.activos.indexOf(d) < 0) S.activos.push(d); });
  S.up1Dias = Array.isArray(o.upp1_days) ? o.upp1_days.slice() : [];
  S.cadastroOk = true; S.videoVisto = true; S.popupDia1 = true;
  S.acceso.modo = 'legado';
  if (o.intake_answers) { ['edad', 'molesta', 'intentos', 'decisivo', 'miedos', 'ingreso'].forEach(function (k) { if (o.intake_answers[k]) S.perfil[k] = o.intake_answers[k]; }); S.perfil.objetivo = S.perfil.molesta || ''; S.encuesta = true; S.cadastroEnviado = true; }
  guardar();
}

/* =====================================================================
 * Programa: dia de hoje, liberação, racha, medalhas
 * ===================================================================== */
function dias() { return P.dias || []; }
function diaData(n) { return dias().filter(function (d) { return d.dia === n; })[0]; }
function fase(n) { return (P.fases || []).filter(function (f) { return f.n === n; })[0] || { nombre: '' }; }
function faseDeDia(n) { var d = diaData(n); return d ? fase(d.fase) : { nombre: '' }; }
// Dia do calendário: Dia 1 = data da compra (ou do primeiro acesso), um dia novo por dia.
function diaHoy() {
  if (!S.inicio) return 1;
  return Math.max(1, Math.min(21, diasEntre(S.inicio, hoyStr()) + 1));
}
function abierto(n) { return n <= diaHoy(); }
function hecho(n) { return !!S.completados[n]; }
function fechaApertura(n) { return sumarDias(S.inicio || hoyStr(), n - 1); }
function totalHechos() { return Object.keys(S.completados).length; }
// Próximo dia a fazer: o menor dia aberto ainda não feito. Se todos os abertos estão feitos, null.
function siguiente() {
  for (var n = 1; n <= diaHoy(); n++) if (!hecho(n)) return n;
  return null;
}
function racha() {
  var set = {}; S.activos.forEach(function (d) { set[d] = 1; });
  var d = hoyStr(), n = 0;
  if (!set[d]) d = sumarDias(d, -1);
  while (set[d]) { n++; d = sumarDias(d, -1); }
  return n;
}
function medallas() {
  return (P.fases || []).map(function (f) {
    var a = f.dias[0], b = f.dias[1], tot = b - a + 1, ok = 0;
    for (var n = a; n <= b; n++) if (hecho(n)) ok++;
    return { f: f, ok: ok, tot: tot, ganada: ok === tot };
  });
}
function duracionPaso(p) {
  if (!p) return 0;
  if (p.tipo === 'secuencia') {
    var rep = (p.fases || []).reduce(function (a, f) { return a + (+f.seg || 0); }, 0);
    return rep * (p.reps || 1) * (p.series || 1) + (p.descanso || 0) * Math.max(0, (p.series || 1) - 1);
  }
  if (p.tipo === 'freno_aviso') return p.duracion_seg || 180;
  if (p.tipo === 'libre') return p.seg || 60;
  if (p.tipo === 'movilidad') return (p.series || 1) * (p.seg || 40);
  if (p.tipo === 'leccion') return 60;
  return 20;
}
function nombrePaso(p) {
  if (p.tipo === 'leccion') { var l = (P.lecciones || {})[p.leccion] || {}; return { t: l.titulo || 'Lectura', d: 'Lectura corta' }; }
  if (p.tipo === 'secuencia') {
    var ex = (P.ejercicios || {})[p.ejercicio] || {};
    var tp = p.tiempo && P.tiempos && P.tiempos[p.tiempo] ? 'Tiempo ' + p.tiempo + ' · ' + P.tiempos[p.tiempo].nombre : '';
    return { t: p.titulo || ex.nombre || 'Ejercicio', d: [p.reps ? p.reps + ' rep' : '', p.series > 1 ? p.series + ' series' : '', tp].filter(Boolean).join(' · ') };
  }
  if (p.tipo === 'freno_aviso') return { t: p.titulo || 'El Freno al aviso', d: (p.avisos || 6) + ' señales' };
  if (p.tipo === 'libre') return { t: p.titulo || 'Práctica guiada', d: p.indicacion ? String(p.indicacion).slice(0, 60) : 'Práctica guiada' };
  if (p.tipo === 'checkin') return { t: 'Check-in', d: p.pregunta || '' };
  if (p.tipo === 'movilidad') { var v = (C.MOVILIDAD || {})[p.video] || {}; return { t: v.name || 'Movilidad', d: 'Extra opcional · video' }; }
  if (p.tipo === 'autoevaluacion') return { t: 'Autoevaluación final', d: '5 preguntas' };
  return { t: p.titulo || 'Paso', d: '' };
}

/* =====================================================================
 * Navegação
 * ===================================================================== */
var TAB = 'inicio';
var SCR = ['login', 'cadastro', 'montando', 'inicio', 'up1', 'up2', 'chat', 'perfil', 'dia'];
function mostrar(id) {
  SCR.forEach(function (s) { var el = $('s-' + s); if (el) el.classList.toggle('on', s === id); });
  var conNav = ['inicio', 'up1', 'up2', 'chat', 'perfil', 'dia'].indexOf(id) > -1;
  $('nav').classList.toggle('hidden', !conNav);
  barraActiva();
  pildoraOferta();
  scrollTop();
}
function tab(t) {
  if (t === 'mariana') t = 'chat';   // links antigos (?ir=mariana, push)
  TAB = t;
  if (t === 'inicio') renderInicio();
  else if (t === 'up1' || t === 'up2') renderUp(t);
  else if (t === 'chat') renderChat();
  else if (t === 'perfil') renderPerfil();
  mostrar(t);
  renderNav();
}
function renderNav() {
  document.querySelectorAll('.nav-i').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === TAB); });
  var c = $('nav-center');
  if (TAB === 'inicio') {
    var n = siguiente() || diaHoy();
    c.innerHTML = '<b>' + n + '</b><span>DÍA</span>';
  } else {
    c.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg><span>INICIO</span>';
  }
  // bolinha verde nos upsells ainda não comprados; badge no chat (mensagens novas da Clara)
  ['up1', 'up2'].forEach(function (k) {
    var b = document.querySelector('.nav-i[data-tab="' + k + '"]');
    var dot = b.querySelector('.gdot');
    if (!S.up[k] && !dot) { dot = document.createElement('i'); dot.className = 'gdot'; b.appendChild(dot); }
    if (S.up[k] && dot) dot.remove();
  });
  $('nav-up1-lbl').textContent = (U.up1 && U.up1.tab) || 'Activación';
  $('nav-up2-lbl').textContent = (U.up2 && U.up2.tab) || 'Ejecución';
  if ($('nav-chat-lbl')) $('nav-chat-lbl').textContent = agente().nombre;
  var mb = document.querySelector('.nav-i[data-tab="chat"]');
  var bd = mb.querySelector('.badge'), n2 = noLeidos();
  if (n2 && !bd) { bd = document.createElement('i'); bd.className = 'badge'; mb.appendChild(bd); }
  if (bd) { if (n2) bd.textContent = n2; else bd.remove(); }
}
function centro() {
  if (TAB !== 'inicio') { tab('inicio'); return; }
  abrirDia(siguiente() || diaHoy());
}

/* =====================================================================
 * Folhas, leitor, toast
 * ===================================================================== */
function folha(html, mid) {
  $('sheet').innerHTML = html;
  $('ov').classList.toggle('mid', !!mid);
  $('ov').classList.add('on');
  document.body.classList.add('lock');
}
function fecharFolha() { $('ov').classList.remove('on'); document.body.classList.remove('lock'); }
function leitor(titulo, html) {
  $('reader-title').textContent = titulo;
  $('reader-body').innerHTML = html;
  $('reader-body').scrollTop = 0;
  $('reader').classList.add('on');
  document.body.classList.add('lock');
}
function fecharLeitor() { $('reader').classList.remove('on'); if (!$('ov').classList.contains('on')) document.body.classList.remove('lock'); }
var _toastT = null, _toastFn = null;
function toast(t1, t2, fn) {
  var el = $('toast');
  el.innerHTML = fotoAgente(38) + '<div class="grow"><div class="t1">' + esc(t1 || agente().nombre) + '</div><div class="t2">' + t2 + '</div></div><span class="xbtn" onclick="event.stopPropagation();App.toastCerrar()">×</span>';
  _toastFn = fn || null;
  el.classList.add('on');
  clearTimeout(_toastT); _toastT = setTimeout(toastCerrar, 6500);
}
function toastCerrar() { $('toast').classList.remove('on'); }
function toastClick() { toastCerrar(); if (_toastFn) _toastFn(); }

/* =====================================================================
 * Acesso pelo e-mail da compra
 * ===================================================================== */
var DOMINIOS = { 'gmail.con': 'gmail.com', 'gmail.co': 'gmail.com', 'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmail.cm': 'gmail.com',
  'gamil.com': 'gmail.com', 'hotmail.con': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotmial.com': 'hotmail.com', 'hotmail.co': 'hotmail.com',
  'outlook.con': 'outlook.com', 'outlok.com': 'outlook.com', 'yahoo.con': 'yahoo.com', 'yaho.com': 'yahoo.com', 'icloud.con': 'icloud.com', 'iclod.com': 'icloud.com' };
function limpaEmail(e) { return String(e || '').replace(/[​-‍﻿\s]/g, '').toLowerCase(); }
function emailValido(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }
function sugerencia(e) { var p = e.split('@'); return p.length === 2 && DOMINIOS[p[1]] ? p[0] + '@' + DOMINIOS[p[1]] : null; }

// Rota de acesso do MOBPAY (contrato em MOBPAY/docs/pedidos/2026-10-13-acesso-app-push-e-lista.md):
//   POST {base}acesso  { email } | { token } | header Authorization: Bearer <sessao>
//   200 → { ok, modo: 'suave'|'firme', produtos: { front|up1|up2: { ativo, desde, chave? } }, motivo, sessao }
//   400 email_invalido · 401 token_invalido · 429 limite
// Enquanto a rota não existir (rede, CORS, 404 ou 5xx), o app entra em modo suave local: deixa entrar e segue.
function baseMobpay() {
  var b = C.API.mobpay || '';
  if (!EN_PROD) { try { b = localStorage.getItem('tdc_api') || b; } catch (e) {} }   // mock local para teste
  return b;
}
function pedido(metodo, caminho, corpo, sessao, ms) {
  var ab = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var t = ab ? setTimeout(function () { ab.abort(); }, ms || 10000) : null;
  var h = { 'Content-Type': 'application/json' };
  if (sessao) h.Authorization = 'Bearer ' + sessao;
  return fetch(baseMobpay() + caminho, { method: metodo, headers: h, body: corpo ? JSON.stringify(corpo) : undefined, signal: ab ? ab.signal : undefined })
    .then(function (r) { clearTimeout(t); return r.json().catch(function () { return {}; }).then(function (j) { j._status = r.status; return j; }); });
}
function api(url, body, ms) {
  var ab = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var t = ab ? setTimeout(function () { ab.abort(); }, ms || 12000) : null;
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ab ? ab.signal : undefined })
    .then(function (r) { clearTimeout(t); return r.json().catch(function () { return {}; }).then(function (j) { j._status = r.status; return j; }); });
}
var SUAVE_LOCAL = { ok: true, modo: 'suave', local: true, produtos: { front: { ativo: true, desde: null } }, motivo: null };
// via: { email } | { token } | { sessao }
function consultarAcceso(via) {
  if (!baseMobpay()) return Promise.resolve(SUAVE_LOCAL);
  var corpo = via.email ? { email: via.email } : via.token ? { token: via.token } : null;
  return pedido('POST', 'acesso', corpo, via.sessao, 10000).then(function (r) {
    if (r._status === 200 && r.produtos) return r;
    if (r._status === 400) return { erro: 'email_invalido' };
    if (r._status === 401) return { erro: 'token_invalido' };
    if (r._status === 429) return { erro: 'limite' };
    return SUAVE_LOCAL;
  }).catch(function () { return SUAVE_LOCAL; });
}
function logado() { return !!(S.email || S.acceso.sessao); }
function frenteAtiva(r) { return !!(r && r.produtos && r.produtos.front && r.produtos.front.ativo); }
// Deixa entrar? No modo suave, sempre; no firme, só com o front ativo.
function liberado(r) { return r && r.ok !== false && (r.modo !== 'firme' || frenteAtiva(r)); }
function aplicarAcceso(r) {
  if (!r || r.erro) return;
  S.acceso.modo = r.local ? (S.acceso.modo === 'manual' ? 'manual' : 'suave') : (r.modo || 'suave');
  S.acceso.consulta = Date.now();
  if (r.sessao) S.acceso.sessao = r.sessao;
  var P0 = r.produtos || {};
  // Dia 1 = data da compra do front (decisão do Kess), contada no fuso do aparelho.
  if (P0.front && P0.front.ativo && P0.front.desde) {
    S.acceso.desde = P0.front.desde;
    S.inicio = hoyStr(new Date(P0.front.desde));
    S.inicioManual = false;
  }
  S.acceso.semCompra = !r.local && !frenteAtiva(r);
  // Front pago só fora do cartão: nunca viu o Up1 do funil de 1 clique (ofertaSinTarjeta).
  if (!r.local) S.sinTarjeta = !!(P0.front && P0.front.sinTarjeta);
  guardar();
  var precisaChave = false;
  ['up1', 'up2'].forEach(function (k) {
    var p = P0[k];
    if (p && p.ativo) {
      S.upCompra = S.upCompra || {}; S.upCompra[k] = true;
      if (p.chave && !S.up[k]) abrirUpsellConCodigo(k, p.chave, true).then(function (ok) { if (ok) { S.avisoUp = k; guardar(); if (TAB === 'inicio' && S.cadastroOk) avisoUpsell(); } });
      if (!p.chave && !S.up[k]) precisaChave = true;
    } else if (p && !p.ativo && S.up[k] && r.modo === 'firme' && !r.local && S.acceso.modo !== 'manual') {
      // reembolso do upsell no modo firme: fecha de novo
      S.up[k] = false; try { localStorage.removeItem(CODE_KEY[k]); } catch (e) {}
      UPP_DATA[UPP_ID[k]] = null; guardar(); renderNav();
    }
  });
  // A chave pode vir só na revalidação por sessão: pede uma vez.
  if (precisaChave && S.acceso.sessao && !r._reval) {
    consultarAcceso({ sessao: S.acceso.sessao }).then(function (r2) { if (r2 && !r2.erro && !r2.local) { r2._reval = true; aplicarAcceso(r2); } });
  }
}
// Reconfere a cada abertura (no máximo 1 vez por hora). No modo firme, reembolso do front tira a pessoa.
function revalidar(forcar) {
  if (!logado() || S.acceso.modo === 'manual') return;
  if (!forcar && Date.now() - (S.acceso.consulta || 0) < 3600000) return;
  var via = S.acceso.sessao ? { sessao: S.acceso.sessao } : S.email ? { email: S.email } : null;
  if (!via) return;
  consultarAcceso(via).then(function (r) {
    if (r.erro === 'token_invalido') {
      // sessão vencida: tenta pelo e-mail guardado; sem e-mail, volta para a entrada
      S.acceso.sessao = ''; guardar();
      if (S.email) consultarAcceso({ email: S.email }).then(aplicarAcceso);
      else { renderLogin(); mostrar('login'); }
      return;
    }
    if (r.erro) return;
    if (r.modo === 'firme' && !frenteAtiva(r) && !r.local) {
      S.email = ''; S.acceso.sessao = ''; S.acceso.modo = r.motivo === 'reembolso' ? 'reembolso' : 'revocado'; guardar();
      renderLogin(S.acceso.modo); mostrar('login');
      return;
    }
    aplicarAcceso(r);
  });
}
// Quem chega pelo botão do e-mail de entrega (?a=<token>) entra sem digitar nada.
function entrarConToken() {
  var t = null; try { t = sessionStorage.getItem('_tk'); sessionStorage.removeItem('_tk'); } catch (e) {}
  if (!t) return Promise.resolve(false);
  return consultarAcceso({ token: t }).then(function (r) {
    if (r.erro || r.local || !liberado(r)) return false;
    aplicarAcceso(r);
    if (!S.inicio) S.inicio = hoyStr();
    guardar();
    return true;
  });
}

function renderLogin(motivo) {
  var L = M.login || {};
  var el = $('s-login');
  el.innerHTML = '<div class="gate">'
    + '<div class="logo"><svg viewBox="0 0 44 44" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 8C22 8 14 12 14 20C14 25.5 17.5 30 22 32C26.5 30 30 25.5 30 20C30 12 22 8 22 8Z"/><path d="M22 14V28M18 18L22 14L26 18"/></svg></div>'
    + '<h1 class="h1 center" style="margin-bottom:10px;">' + (L.titulo || 'Desafío 21 Días') + '</h1>'
    + '<p class="muted center" style="margin-bottom:28px;">' + (L.subtitulo || 'Entra con el correo que usaste en tu compra.') + '</p>'
    + (motivo === 'reembolso' ? '<div class="warn">Tu compra fue reembolsada, por eso se cerró el acceso. Si crees que es un error, escríbenos y lo revisamos.</div>'
      : motivo === 'revocado' ? '<div class="warn">No encontramos una compra activa con ese correo. Si crees que es un error, escríbenos y lo revisamos.</div>' : '')
    + '<input class="field" id="lg-email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="' + esc(L.campo || 'Tu correo de compra') + '">'
    + '<div id="lg-hint"></div><div id="lg-err" class="err-msg"></div>'
    + '<button class="btn" id="lg-btn" style="margin-top:14px;" onclick="App.entrar()">' + (L.boton || 'ENTRAR A MI DESAFÍO →') + '</button>'
    + '<button class="textbtn" style="margin-top:14px;" onclick="App.escape()">' + (L.link_escape || '¿Compraste y no puedes entrar?') + ' <span class="link">Clic aquí</span></button>'
    + '</div>';
  var inp = $('lg-email');
  inp.addEventListener('input', function () {
    var e = limpaEmail(inp.value), s = sugerencia(e);
    $('lg-err').textContent = ''; inp.classList.remove('err');
    $('lg-hint').innerHTML = s ? '<div class="hint">¿Quisiste decir <button onclick="App.usarSugerencia(\'' + esc(s) + '\')">' + esc(s) + '</button>?</div>' : '';
  });
  inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') entrar(); });
}
function usarSugerencia(s) { $('lg-email').value = s; $('lg-hint').innerHTML = ''; }
function entrar() {
  var L = M.login || {};
  var inp = $('lg-email'), e = limpaEmail(inp.value);
  if (!emailValido(e)) { inp.classList.add('err'); $('lg-err').textContent = 'Revisa el correo: parece incompleto.'; return; }
  var btn = $('lg-btn'); btn.disabled = true; btn.textContent = 'Buscando tu compra…';
  consultarAcceso({ email: e }).then(function (r) {
    var solta = function () { btn.disabled = false; btn.innerHTML = L.boton || 'ENTRAR A MI DESAFÍO →'; };
    if (r.erro === 'limite') { solta(); $('lg-err').textContent = 'Demasiados intentos seguidos. Espera un minuto y vuelve a intentar.'; return; }
    if (r.erro === 'email_invalido') { solta(); inp.classList.add('err'); $('lg-err').textContent = 'Revisa el correo: parece incompleto.'; return; }
    if (!liberado(r)) {
      solta();
      inp.classList.add('err');
      $('lg-err').innerHTML = fmt(L.erro_nao_achou || 'No encontramos una compra con {email}. Revisa que sea el mismo correo de la compra.', { email: '<b>' + esc(e) + '</b>' })
        + '<br><button class="link" style="margin-top:8px;" onclick="App.escape()">¿Compraste y no puedes entrar? Clic aquí</button>';
      return;
    }
    S.email = e;
    // Conta de teste do Kess (18/10): entra pelo mesmo caminho de qualquer compra, só não passa pelo questionário inicial.
    if (e === 'admin@admin.com') { S.cadastroOk = true; S.encuesta = true; if (!S.nombre) S.nombre = 'Admin'; }
    if (!S.inicio) S.inicio = hoyStr();
    aplicarAcceso(r);
    guardarLocal();
    // Traz o progresso e o cadastro guardados com este e-mail (outro celular ou navegador) antes de seguir.
    MEM.listo = memSync(5000);
    MEM.listo.then(function () { solta(); guardar(); seguirFlujo(); });
  });
}
function escape() {
  var X = M.escape || {};
  folha('<div class="sheet-hd"><div class="grow">' + (X.titulo || 'Recuperar acceso') + '</div><button class="xbtn" onclick="App.fecharFolha()">×</button></div>'
    + '<p class="muted" style="margin-bottom:16px;line-height:1.6;">' + (X.texto || 'Escribe tu correo. Te dejamos entrar ahora al desafío y nuestro equipo revisa tu compra.') + '</p>'
    + '<input class="field" id="es-email" type="email" inputmode="email" autocapitalize="off" placeholder="' + esc(X.campo || 'Tu correo') + '">'
    + '<div id="es-err" class="err-msg"></div>'
    + '<button class="btn" style="margin-top:14px;" id="es-btn" onclick="App.escapeEnviar()">' + (X.boton || 'ENTRAR AHORA →') + '</button>', true);
  setTimeout(function () { var i = $('es-email'); if (i) i.value = $('lg-email') ? $('lg-email').value : ''; }, 0);
}
function escapeEnviar() {
  var X = M.escape || {};
  var e = limpaEmail($('es-email').value);
  if (!emailValido(e)) { $('es-err').textContent = 'Revisa el correo: parece incompleto.'; return; }
  $('es-btn').disabled = true;
  // Opção (a) do Kess: libera SÓ o desafio (front) na hora e manda o e-mail para a fila do suporte conferir.
  // Os upsells nunca abrem por aqui: só pela compra com o mesmo e-mail ou pelo código do e-mail de compra.
  var fila = baseMobpay() ? pedido('POST', 'acesso/conferir', { email: e }, null, 8000).catch(function () {}) : Promise.resolve();
  fila.then(function () {
    S.email = e; S.acceso.modo = 'manual'; S.acceso.consulta = Date.now();
    if (!S.inicio) S.inicio = hoyStr();
    guardarLocal();
    MEM.listo = memSync(5000);
    return MEM.listo;
  }).then(function () {
    guardar();
    $('sheet').innerHTML = '<div class="center" style="padding:10px 0;"><div style="font-size:44px;margin-bottom:10px;">✅</div>'
      + '<div class="h3" style="margin-bottom:8px;">' + (X.ok || '¡Listo! Ya puedes entrar.') + '</div>'
      + '<button class="btn" style="margin-top:16px;" onclick="App.fecharFolha();App.seguirFlujo()">CONTINUAR →</button></div>';
  });
}

/* =====================================================================
 * Boas-vindas: vídeo → cadastro em 5 passos → "montando tu desafío"
 * ===================================================================== */
function seguirFlujo() {
  if (!logado()) { renderLogin(S.acceso.modo === 'reembolso' || S.acceso.modo === 'revocado' ? S.acceso.modo : ''); mostrar('login'); return; }
  if (!S.videoVisto && C.AUDIO_BIENVENIDA) { renderBienvenida(); mostrar('cadastro'); return; }
  if (!S.cadastroOk) { CAD.paso = 0; renderCadastro(); mostrar('cadastro'); return; }
  tab('inicio');
  despuesDeEntrar();
}
function ytEmbed(id, vertical) {
  if (!id) return '';
  var src = id.indexOf('yt:') === 0 ? 'https://www.youtube.com/embed/' + id.slice(3) + '?playsinline=1&rel=0&modestbranding=1' : 'https://drive.google.com/file/d/' + id + '/preview';
  return '<div style="' + (vertical ? 'max-width:290px;margin:0 auto;' : '') + '"><div style="position:relative;width:100%;padding-top:' + (vertical ? '177.78%' : '56.25%') + ';border-radius:16px;overflow:hidden;background:#000;border:1px solid var(--line-2);">'
    + '<iframe src="' + src + '" style="position:absolute;inset:0;width:100%;height:100%;border:0;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div></div>';
}
// Boas-vindas (14/10): o áudio da Clara no lugar do vídeo, antes do cadastro.
function renderBienvenida() {
  $('s-cadastro').innerHTML = '<div style="padding:28px 20px 30px;">'
    + '<div class="kicker center">Bienvenido' + (S.nombre ? ', ' + esc(primerNombre()) : '') + '</div>'
    + '<h1 class="h2 center" style="margin:8px 0 6px;">Antes de empezar, escucha este audio de ' + esc(agente().nombre) + '</h1>'
    + '<p class="muted small center" style="margin-bottom:18px;">Dura menos de 1 minuto. Al terminar, respondes unas preguntas rápidas.</p>'
    + '<div class="bienv">' + fotoAgente(88) + '<div class="bienv-n" style="margin-bottom:14px;">' + esc(agente().nombre) + '</div>' + audioHtml('bv') + '</div>'
    + '<button class="btn" style="margin-top:20px;" onclick="App.videoListo()">CONTINUAR →</button></div>';
}
function videoListo() { var a = $('au-bv'); if (a) a.pause(); S.videoVisto = true; guardar(); seguirFlujo(); }

var CAD = { paso: 0 };
// Cadastro = os 5 passos do molde do Gui + as perguntas do questionário original (Kess: "era bem importante").
// "objetivo" vira a pergunta original "molesta" (mesma coluna da planilha); o e-mail só é pedido se ele entrou pelo link.
function pasosCadastro() {
  var base = (M.cadastro && M.cadastro.pasos && M.cadastro.pasos.length) ? M.cadastro.pasos : pasosPadrao();
  var Q = C.CUESTIONARIO || {};
  var out = base.map(function (p) { return p.id === 'objetivo' && Q.molesta ? Q.molesta : p; });
  (Q.extra || []).forEach(function (q) { out.push(q); });
  if (!S.email) out.push({ id: 'email', titulo: 'Tu correo', pregunta: '¿Cuál es el correo de tu compra?', tipo: 'email', placeholder: 'Tu correo de compra' });
  return out;
}
function pasosPadrao() {
  return [
    { id: 'nombre', titulo: 'Tu nombre', pregunta: '¿Cómo te llamo?', tipo: 'texto' },
    { id: 'edad', titulo: 'Tu edad', pregunta: '¿Cuántos años tienes?', tipo: 'opciones', opciones: ['Menos de 40', '40 a 49', '50 a 59', '60 o más'] },
    { id: 'tiempo', titulo: 'Desde cuándo', pregunta: '¿Hace cuánto lo notas?', tipo: 'opciones', opciones: ['Menos de 6 meses', '6 meses a 2 años', 'Más de 2 años'] },
    { id: 'objetivo', titulo: 'Tu objetivo', pregunta: '¿Qué quieres recuperar primero?', tipo: 'opciones', opciones: ['Firmeza', 'Durar más', 'Dormir la noche entera'] },
    { id: 'horario', titulo: 'Tu momento', pregunta: '¿A qué hora prefieres tu sesión?', tipo: 'opciones', opciones: ['En la mañana', 'En la tarde', 'En la noche'] }
  ];
}
function renderCadastro() {
  var ps = pasosCadastro(), i = CAD.paso, p = ps[i], tot = ps.length;
  var val = p.id === 'nombre' ? (S.nombre || '') : (S.perfil[p.id] || '');
  var bar = ''; for (var k = 0; k < tot; k++) bar += '<i class="' + (k <= i ? 'on' : '') + '"></i>';
  var body = '';
  if (p.tipo === 'email') {
    body = '<input class="field" id="cd-in" type="email" inputmode="email" autocapitalize="off" placeholder="' + esc(p.placeholder || 'Tu correo') + '" value="' + esc(S.email || '') + '" style="margin-top:22px;">'
      + '<div class="small muted" style="margin-top:8px;">Queda solo entre nosotros.</div>'
      + '<button class="btn" style="margin-top:16px;" onclick="App.cadSiguiente()">CONFIRMAR →</button>';
  } else if (p.tipo === 'texto') {
    body = '<input class="field" id="cd-in" type="text" maxlength="30" autocomplete="given-name" placeholder="' + esc(p.placeholder || 'Tu nombre') + '" value="' + esc(val) + '" style="margin-top:22px;">'
      + '<button class="btn" style="margin-top:16px;" onclick="App.cadSiguiente()">CONFIRMAR →</button>';
  } else {
    body = '<div class="opts">' + (p.opciones || []).map(function (o) {
      return '<button class="opt' + (o === val ? ' sel' : '') + '" onclick="App.cadElegir(this)" data-v="' + esc(o) + '"><span>' + esc(o) + '</span><span class="dot"></span></button>';
    }).join('') + '</div>';
  }
  $('s-cadastro').innerHTML = '<div style="padding:26px 22px 30px;">'
    + '<div class="steps-bar">' + bar + '</div>'
    + '<div class="paso-tag">Paso ' + pad2(i + 1) + ' de ' + pad2(tot) + ' · ' + esc(p.titulo || '') + '</div>'
    + '<h1 class="h1">' + fmt(p.pregunta, { nombre: esc(primerNombre()) }) + '</h1>'
    + body
    + (i > 0 ? '<button class="textbtn" style="margin-top:10px;" onclick="App.cadAtras()">← Atrás</button>' : '')
    + '</div>';
  var inp = $('cd-in');
  if (inp) { setTimeout(function () { inp.focus(); }, 60); inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') cadSiguiente(); }); }
  scrollTop();
}
function cadElegir(btn) {
  var p = pasosCadastro()[CAD.paso];
  if (S.perfil[p.id] !== btn.getAttribute('data-v')) S.perfilTs = Date.now();
  S.perfil[p.id] = btn.getAttribute('data-v');
  if (p.id === 'molesta') S.perfil.objetivo = S.perfil.molesta;
  guardar();
  document.querySelectorAll('.opt').forEach(function (b) { b.classList.toggle('sel', b === btn); });
  setTimeout(cadSiguiente, 220);
}
function cadSiguiente() {
  var ps = pasosCadastro(), p = ps[CAD.paso];
  if (p.tipo === 'email') {
    var em = limpaEmail($('cd-in').value);
    if (!emailValido(em)) { $('cd-in').classList.add('err'); return; }
    S.email = em; guardar();
    MEM.listo = memSync(5000);   // entrou pelo link sem e-mail: agora dá para buscar o progresso guardado
  } else if (p.tipo === 'texto') {
    var v = String($('cd-in').value || '').trim().replace(/\s+/g, ' ');
    if (v.length < 2) { $('cd-in').classList.add('err'); return; }
    v = v.charAt(0).toUpperCase() + v.slice(1);
    if (S.nombre !== v) S.perfilTs = Date.now();
    S.nombre = v; guardar();
  } else if (!S.perfil[p.id]) return;
  if (CAD.paso < ps.length - 1) { CAD.paso++; renderCadastro(); return; }
  montando();
}
function cadAtras() { if (CAD.paso > 0) { CAD.paso--; renderCadastro(); } }

// Tela de ~20 s. Cada linha descreve algo que o app faz de verdade com as respostas.
function montando() {
  var MO = (M.cadastro && M.cadastro.montando) || {};
  var grad = sumarDias(S.inicio || hoyStr(), 20);
  var vars = { nombre: esc(primerNombre()), fecha_graduacion: fechaLarga(grad), horario: esc(String(S.perfil.horario || 'tu horario').toLowerCase()),
    edad: esc(S.perfil.edad || ''), tiempo: esc(String(S.perfil.tiempo || '').toLowerCase()), objetivo: esc(String(S.perfil.objetivo || '').toLowerCase()) };
  var lineas = (MO.lineas && MO.lineas.length ? MO.lineas : [
    'Armando tu calendario de 21 días: hoy es tu Día 1.',
    'Tu graduación queda para el {fecha_graduacion}.',
    'Preparando tu sesión de hoy: unos 5 minutos.',
    'Ordenando las 4 fases para que no te saltes ningún paso.',
    'Guardando tu momento del día: {horario}.',
    'Tu punto de partida: {edad}, {tiempo}.'
  ]).map(function (l) { return fmt(l, vars); });
  $('s-montando').innerHTML = '<div class="mont">'
    + '<div class="ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" stroke="#201A2C" stroke-width="8" fill="none"/><circle id="mo-c" cx="50" cy="50" r="44" stroke="#8B5CF6" stroke-width="8" fill="none" stroke-linecap="round" stroke-dasharray="276.5" stroke-dashoffset="276.5" style="transition:stroke-dashoffset .4s"/></svg><div class="pct" id="mo-p">0%</div></div>'
    + '<h1 class="h2">' + fmt(MO.titulo || 'Preparando tu desafío, {nombre}…', vars) + '</h1>'
    + '<div class="mont-lines">' + lineas.map(function (l, k) { return '<div class="mont-line" id="mo-l' + k + '"><span class="ic"></span><span>' + l + '</span></div>'; }).join('') + '</div>'
    + '<div class="aviso">⚠ ' + esc(MO.aviso || 'No salgas de esta pantalla, espera a que termine') + '</div>'
    + '<div id="mo-fin"></div></div>';
  mostrar('montando');
  enviarCadastro();
  var total = 20000, t0 = Date.now(), n = lineas.length;
  var it = setInterval(function () {
    var f = Math.min(1, (Date.now() - t0) / total);
    $('mo-p').textContent = Math.round(f * 100) + '%';
    $('mo-c').setAttribute('stroke-dashoffset', String(276.5 * (1 - f)));
    var cur = Math.min(n - 1, Math.floor(f * n));
    for (var k = 0; k < n; k++) { var el = $('mo-l' + k); if (!el) continue; el.className = 'mont-line' + (k < cur || f >= 1 ? ' on' : k === cur ? ' run' : ''); if (k < cur || f >= 1) el.querySelector('.ic').textContent = '✓'; }
    if (f >= 1) {
      clearInterval(it);
      S.cadastroOk = true; S.bonoNuevo = true;
      novedadVistaPorNuevo();   // quem acabou de chegar não vê o aviso de novidade desta versão
      guardar();
      $('mo-fin').innerHTML = '<p class="muted" style="margin:22px 0 16px;line-height:1.6;">' + fmt(MO.final || '¡Listo, {nombre}! Tu desafío está armado.', vars) + '</p>'
        + '<button class="btn" onclick="App.seguirFlujo()">VER MI DESAFÍO →</button>';
      var av = document.querySelector('#s-montando .aviso'); if (av) av.style.display = 'none';
      setTimeout(function () { $('mo-fin').scrollIntoView({ behavior: 'smooth', block: 'end' }); }, 50);
    }
  }, 200);
}
function enviarCadastro() {
  if (!EN_PROD || !C.ENCUESTA_URL || S.cadastroEnviado) return;
  var pais = ''; try { pais = sessionStorage.getItem('_gck') || ''; } catch (e) {}
  var P2 = S.perfil;
  var d = { oferta: 'TDC', origen: 'app-v2', fecha: new Date().toISOString(), nombre: S.nombre, email: S.email, pais: pais,
    edad: P2.edad || '', molesta: P2.molesta || P2.objetivo || '', intentos: P2.intentos || '', decisivo: P2.decisivo || '',
    miedos: P2.miedos || '', ingreso: P2.ingreso || '', tiempo: P2.tiempo || '', horario: P2.horario || '' };
  S.encuesta = true; guardar();
  try { fetch(C.ENCUESTA_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(d) }).then(function () { S.cadastroEnviado = true; guardar(); }).catch(function () {}); } catch (e) {}
}

/* =====================================================================
 * Início
 * ===================================================================== */
function llamas(n) { var s = ''; for (var i = 1; i <= 5; i++) s += i <= n ? '🔥' : '<span style="opacity:.25">🔥</span>'; return '<span class="fl">' + s + '</span>'; }
function renderInicio() {
  var hoy = diaHoy(), sig = siguiente(), med = medallas();
  var pct = Math.round(totalHechos() / 21 * 100);
  var fz = faseDeDia(sig || hoy);
  var standalone = esStandalone();
  var h = '';
  h += '<div class="top">'
    + '<div class="avatar">' + esc(iniciales(S.nombre)) + '<i class="on-dot"></i></div>'
    + '<div class="grow"><div class="hello">Hola, ' + esc(primerNombre() || 'campeón') + '</div><div class="sub">Día ' + hoy + ' de 21 · Fase ' + esc(fz.nombre) + '</div></div>'
    + botonSino()
    + (standalone ? '' : '<button class="icon-btn" onclick="App.instalar()" aria-label="Instalar app"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14"/></svg><i class="pulse"></i></button>')
    + '<button class="icon-btn" onclick="App.tab(\'perfil\')" aria-label="Perfil"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg></button>'
    + '</div>';
  h += '<div class="stats">'
    + '<div class="stat"><div class="k">Racha</div><div class="v">🔥 ' + racha() + ' <small>' + (racha() === 1 ? 'día' : 'días') + '</small></div></div>'
    + '<div class="stat"><div class="k">Hechos</div><div class="v">' + totalHechos() + '<small>/21</small></div></div>'
    + '<div class="stat"><div class="k">Medallas</div><div class="v">' + med.filter(function (m) { return m.ganada; }).length + '<small>/' + med.length + '</small></div></div>'
    + '</div>';
  // Missão de hoje
  if (sig) {
    var d = diaData(sig) || {}, ses = S.sesion && S.sesion.dia === sig;
    var atras = hoy - sig;
    h += '<div class="mision">'
      + '<span class="tag">● ' + (ses ? 'Sesión en curso' : atras > 0 ? 'Pendiente' : 'Misión de hoy') + ' · Día ' + pad2(sig) + '</span>'
      + '<div class="t">' + esc(d.titulo || ('Día ' + sig)) + '</div>'
      + '<div class="meta">Fase ' + esc(faseDeDia(sig).nombre) + ' · ' + (d.minutos || 5) + ' min · ' + llamas(d.dificultad || 1) + '</div>'
      + (atras > 0 ? '<div class="small muted" style="margin:-8px 0 14px;position:relative;z-index:1;">' + tx(M.racha_perdida || 'Sin culpa: retoma donde quedaste. Un día por sesión.') + '</div>' : '')
      + '<button class="btn" onclick="App.' + (ses ? 'retomar()' : 'abrirDia(' + sig + ')') + '">' + (ses ? '▶ CONTINUAR SESIÓN' : '▶ INICIAR SESIÓN') + '</button>'
      + '</div>';
  } else {
    var prox = hoy < 21 ? hoy + 1 : null;
    h += '<div class="mision"><span class="tag done">✓ Día ' + pad2(hoy) + ' cumplido</span>'
      + '<div class="t">' + (prox ? '¡Hoy ya cumpliste!' : '¡Te graduaste!') + '</div>'
      + '<div class="meta">' + (prox ? 'El Día ' + prox + ' se abre ' + fechaCorta(fechaApertura(prox)) + '. Descansar también entrena.' : 'Completaste los 21 días del desafío.') + '</div>'
      + '<button class="btn ghost" onclick="App.abrirDia(' + hoy + ')">Repetir la sesión de hoy</button></div>';
  }
  h += '<div class="prog"><div class="bar"><i style="width:' + pct + '%"></i></div><div class="ends"><span>DÍA 01</span><span>' + pct + '%</span><span>DÍA 21</span></div></div>';
  // Clara (mensagens do dia e chat)
  var ult = ultimoMensaje(), nl = noLeidos();
  h += '<div class="mari-card" onclick="App.tab(\'chat\')">'
    + fotoAgente(46)
    + '<div class="grow"><div class="h3" style="font-size:14px;">' + esc(agente().nombre) + ' ' + (nl ? '<span class="badge">' + nl + '</span>' : '') + '</div>'
    + '<div class="small muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(ult) + '</div></div><span class="chev">›</span></div>';
  // Lição da fase 3
  if (hoy >= 13 && P.lecciones && P.lecciones['senal-maestro']) {
    h += '<div class="card" style="margin:14px 18px 0;border-color:rgba(239,68,68,.35);background:linear-gradient(140deg,rgba(239,68,68,.12),var(--surface));" onclick="App.leccion(\'senal-maestro\')">'
      + '<div class="row"><div style="font-size:28px;">🚦</div><div class="grow"><div class="kicker" style="color:#FCA5A5;">Fase 3 · abierta</div><div class="h3">' + esc(P.lecciones['senal-maestro'].titulo) + '</div></div><span class="chev">›</span></div></div>';
  }
  // Linha do tempo
  h += '<div class="sec-title"><span class="kicker">Tu camino · 21 días</span><button class="link" onclick="App.irADia()">Ir a día</button></div>';
  h += '<div class="fases">' + (P.fases || []).map(function (f) { return '<span class="fase-chip' + (f.n === (diaData(sig || hoy) || {}).fase ? ' on' : '') + '">' + f.n + ' · ' + esc(f.nombre) + ' <span class="muted">' + f.dias[0] + '-' + f.dias[1] + '</span></span>'; }).join('') + '</div>';
  h += '<div class="dias">';
  for (var n = 1; n <= 21; n++) {
    var cls = hecho(n) ? 'ok' : n === sig ? 'hoy' : abierto(n) ? 'abierto' : 'lock';
    h += '<button class="dia ' + cls + '" onclick="App.tocarDia(' + n + ')">' + (hecho(n) ? '✓' : n) + (cls === 'lock' ? '<span class="lk">🔒</span>' : '<small>DÍA</small>') + '</button>';
  }
  h += '</div>';
  // Medalhas
  h += '<div class="sec-title"><span class="kicker">Tus medallas</span></div><div class="list">'
    + med.map(function (m) {
      var md = m.f.medalla || {};
      return '<div class="li"><div class="em" style="' + (m.ganada ? '' : 'opacity:.35;') + '">' + (md.emoji || '🏅') + '</div><div class="grow"><div class="tt">' + esc(md.nombre || m.f.nombre) + '</div>'
        + '<div class="ds">' + (m.ganada ? esc(md.desc || '¡Ganada!') : 'Fase ' + m.f.n + ' · ' + m.ok + ' de ' + m.tot + ' días') + '</div>'
        + '<div style="height:5px;border-radius:5px;background:var(--surface-2);margin-top:8px;overflow:hidden;"><i style="display:block;height:100%;width:' + Math.round(m.ok / m.tot * 100) + '%;background:' + (m.ganada ? 'var(--green)' : 'var(--purple)') + ';"></i></div></div></div>';
    }).join('') + '</div>';
  // Bônus
  h += '<div class="sec-title"><span class="kicker">Tus bonos</span></div><div class="list">' + listaBonos() + '</div>';
  // Upsells
  h += '<div class="sec-title"><span class="kicker">Para ir más rápido</span></div>';
  ['up1', 'up2'].forEach(function (k) {
    var u = U[k] || {};
    h += '<div class="upcard ' + (k === 'up1' ? 'u1' : 'u2') + '" onclick="App.tab(\'' + k + '\')">'
      + '<div class="kicker" style="color:' + (k === 'up1' ? 'var(--up1)' : 'var(--up2)') + ';">' + (S.up[k] ? '✓ Ya es tuyo' : 'Protocolo exclusivo') + (S.up[k] ? '' : '<span class="pill-new">NUEVO</span>') + '</div>'
      + '<div class="ttl">' + esc(u.nombre || (k === 'up1' ? 'Activación 7D' : 'Ejecución Perfecta')) + '</div>'
      + '<div class="small muted" style="margin-bottom:14px;">' + esc((u.hero && u.hero.subtitulo) || '') + '</div>'
      + '<button class="btn sm ' + k + '">' + (S.up[k] ? 'ABRIR →' : 'VER ' + esc((u.nombre || '').toUpperCase()) + ' →') + '</button></div>';
  });
  h += '<div class="foot">Uso personal. No incluye diagnóstico ni tratamiento médico.<br><button class="link" style="font-size:11px;margin-top:6px;" onclick="App.ayuda()">Ayuda y preguntas frecuentes</button></div>';
  $('s-inicio').innerHTML = h;
}
function listaBonos() {
  var items = [
    // [id, emoji, título, subtítulo, PDF para baixar (opcional), nome do arquivo baixado]
    ['programa', '📘', 'Guía del desafío', 'La teoría detrás de los 21 días', 'desafio_21_dias_programa.pdf', 'Desafio-21-Dias-Guia.pdf'],
    ['despertar', '🌅', 'Despertar de 5 Minutos', 'Bono 1 · rutina al despertar', 'bono_1_despertar_de_5_minutos.pdf', 'Bono-1-Despertar-de-5-Minutos.pdf'],
    ['combustible', '🥩', 'Combustible Masculino', 'Bono 2 · qué comer y qué cortar', 'bono_2_combustible_masculino.pdf', 'Bono-2-Combustible-Masculino.pdf'],
    ['noches', '🌙', 'Noche Completa', 'Bono 3 · dormir la noche entera', 'bono_3_noche_completa.pdf', 'Bono-3-Noche-Completa.pdf'],
    ['ella', '🤫', 'Lo que ella nunca te dirá', 'Bono 4 · lo que siente, lo que les cuenta a sus amigas y lo que de verdad quiere de ti', 'bono_4_lo_que_ella_nunca_te_dira.pdf', 'Bono-4-Lo-que-ella-nunca-te-dira.pdf'],
    ['reinicio', '🔄', 'Reinicio: Adiós al Porno', 'Bono 5 · el plan de 21 días']
  ];
  return items.map(function (b) {
    var nuevo = b[0] === 'reinicio' && S.bonoNuevo;
    return '<button class="li" onclick="App.bono(\'' + b[0] + '\')"><div class="em">' + b[1] + '</div><div class="grow"><div class="tt">' + b[2] + (nuevo ? '<span class="pill-new">NUEVO</span>' : '') + '</div><div class="ds">' + b[3] + '</div></div>'
      + (b[4] ? '<a class="dl" href="' + b[4] + '" download="' + (b[5] || b[4]) + '" onclick="event.stopPropagation()">PDF</a>' : '<span class="chev">›</span>') + '</button>';
  }).join('');
}
function bono(id) {
  if (id === 'reinicio') { S.bonoNuevo = false; guardar(); window.open(C.BONO_CADASTRO.url, '_blank'); renderInicio(); return; }
  var b = B[id]; if (!b) return;
  leitor(b.title || b.titulo || '', b.html || '');
}
function tocarDia(n) {
  if (abierto(n)) { abrirDia(n); return; }
  var t = fmt(M.dia_bloqueado || 'El Día {dia} se abre {fecha}. Un día nuevo por cada día: así el músculo descansa y responde mejor.', { dia: n, fecha: fechaCorta(fechaApertura(n)) });
  folha('<div class="center"><div style="font-size:40px;margin-bottom:8px;">🔒</div><div class="h3" style="margin-bottom:8px;">Día ' + n + ' · ' + esc((diaData(n) || {}).titulo || '') + '</div><p class="muted" style="line-height:1.6;margin-bottom:18px;">' + t + '</p>'
    + '<button class="btn ghost" onclick="App.fecharFolha()">Entendido</button></div>', true);
}
function leccion(id) {
  var l = (P.lecciones || {})[id]; if (!l) return;
  leitor(l.titulo, htmlLeccion(l));
}
function htmlLeccion(l) {
  var ps = (l.parrafos || []).map(tx), corte = l.escala && l.escala.length ? (l.escala_despues_de || ps.length) : ps.length;
  var h = parrafos(ps.slice(0, corte));
  if (l.escala && l.escala.length) {
    var cores = { '1-5': '#34D399', '6-7': '#FBBF24', '8-9': '#F97316', '10': '#EF4444' };
    h += '<div class="escala">' + l.escala.map(function (e) { return '<div><b style="background:' + (cores[e.n] || '#A78BFA') + '">' + esc(e.n) + '</b><span><strong>' + esc(e.zona || '') + '.</strong> ' + esc(e.texto || '') + '</span></div>'; }).join('') + '</div>';
    h += parrafos(ps.slice(corte));
  }
  if (l.pasos && l.pasos.length) h += '<div class="escala">' + l.pasos.map(function (p, i) { return '<div><b style="background:#A78BFA">' + (p.n || i + 1) + '</b><span>' + (typeof p === 'string' ? esc(p) : '<strong>' + esc(p.titulo || '') + '.</strong> ' + esc(p.texto || '')) + '</span></div>'; }).join('') + '</div>';
  if (l.notas) h += parrafos((Array.isArray(l.notas) ? l.notas : [l.notas]).map(function (n) { return '<span class="muted">' + esc(n) + '</span>'; }));
  return h;
}

/* =====================================================================
 * Vídeos do dia: miniatura nítida e grande, logo de cara (pedido do Kess, 13/10)
 * ===================================================================== */
function ytId(id) { return String(id || '').indexOf('yt:') === 0 ? String(id).slice(3) : ''; }
function videosDelDia(n) {
  var out = [], d = diaData(n) || { pasos: [] };
  (d.pasos || []).forEach(function (p) {
    var v = p.tipo === 'movilidad' ? (C.MOVILIDAD || {})[p.video] : null;
    if (v && v.id && !out.some(function (x) { return x.id === v.id; })) out.push({ id: v.id, name: v.name, sub: (p.series || 2) + ' series de ' + (p.seg || 40) + ' s · movilidad de cadera' });
  });
  return out;
}
function thumbHtml(v, grande) {
  var y = ytId(v.id);
  var img = y ? '<img src="https://i.ytimg.com/vi/' + y + '/maxresdefault.jpg" onerror="this.onerror=null;this.src=\'https://i.ytimg.com/vi/' + y + '/hqdefault.jpg\'" alt="" loading="lazy">' : '';
  return '<button class="vthumb' + (grande ? ' big' : '') + '" onclick="event.stopPropagation();App.verVideo(\'' + esc(v.id) + '\',\'' + esc(String(v.name).replace(/'/g, '')) + '\',' + (v.vertical ? 1 : 0) + ')">' + img
    + '<span class="vplay"><svg viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg></span>'
    + '<span class="vlbl"><b>' + esc(v.name) + '</b>' + (v.sub ? '<small>' + esc(v.sub) + '</small>' : '') + '</span></button>';
}
function videosHtml(n, titulo) {
  var vs = videosDelDia(n);
  if (!vs.length) return '';
  return '<div class="vbox"><div class="kicker" style="margin-bottom:10px;">' + esc(titulo || 'Video de hoy') + '</div>' + thumbHtml(vs[0], true)
    + (vs.length > 1 ? '<div class="vrow">' + vs.slice(1).map(function (v) { return thumbHtml(v, false); }).join('') + '</div>' : '') + '</div>';
}
function verVideo(id, nombre, vertical) {
  leitor(nombre || 'Video', ytEmbed(id, !!vertical) + '<p class="small muted" style="margin-top:14px;text-align:center;">Toca ▶ para ver. Puedes repetirlo cuantas veces quieras.</p>');
}

/* =====================================================================
 * Dia: briefing da "misión"
 * ===================================================================== */
var DIA = 0;
function abrirDia(n) {
  if (!abierto(n)) { tocarDia(n); return; }
  DIA = n;
  var d = diaData(n) || { pasos: [] }, f = faseDeDia(n);
  var pasos = d.pasos || [];
  var totalSeg = pasos.reduce(function (a, p) { return a + (p.opcional ? 0 : duracionPaso(p)); }, 0);
  var ses = S.sesion && S.sesion.dia === n;
  var h = '<div class="brief">'
    + '<div class="brief-top"><button class="xbtn" onclick="App.tab(\'inicio\')">‹</button><div class="grow"></div>'
    + (hecho(n) ? '<span class="tiempo-tag" style="background:rgba(52,211,153,.15);color:var(--green);">✓ Cumplido</span>' : '<span class="tiempo-tag">Fase ' + (d.fase || '') + ' · ' + esc(f.nombre) + '</span>') + '</div>'
    + '<div class="kicker">Misión del día</div><div class="big">DÍA ' + pad2(n) + '</div>'
    + '<div class="h2" style="margin-top:6px;">' + esc(d.titulo || '') + '</div>'
    + '<div class="brief-meta"><div><div class="k">Duración</div><div class="v">' + Math.max(1, Math.round(totalSeg / 60)) + ' min</div></div>'
    + '<div><div class="k">Pasos</div><div class="v">' + pasos.filter(function (p) { return !p.opcional; }).length + '</div></div>'
    + '<div><div class="k">Nivel</div><div class="v" style="font-size:12px;margin-top:6px;">' + llamas(d.dificultad || 1) + '</div></div></div>'
    + (d.resumen ? '<div class="resumen"><div class="kicker" style="margin-bottom:6px;">Resumen de hoy</div>' + esc(d.resumen) + '</div>' : '')
    + '<div class="kicker" style="color:var(--text-2);margin-bottom:10px;">Tu sesión, paso a paso</div>'
    + pasos.map(function (p, i) { var nm = nombrePaso(p); return '<div class="paso-li' + (p.opcional ? ' opc' : '') + '"><span class="n">' + pad2(i + 1) + '</span><div class="grow"><div class="tt">' + esc(nm.t) + (p.opcional ? ' <span class="muted tiny">(opcional)</span>' : '') + '</div><div class="ds">' + esc(nm.d) + '</div></div><span class="tm">' + mmss(duracionPaso(p)) + '</span></div>'; }).join('')
    + (S.up.up2 ? fichasUp2(d) : '')
    + '<div style="height:16px"></div>'
    + '<button class="btn" onclick="App.iniciarSesion(' + n + ')">' + (ses ? '▶ CONTINUAR DONDE QUEDÉ' : hecho(n) ? '↻ REPETIR SESIÓN' : '▶ INICIAR SESIÓN') + '</button>'
    + (ses ? '<button class="textbtn" onclick="App.iniciarSesion(' + n + ',true)">Empezar de cero</button>' : '')
    + '</div>';
  $('s-dia').innerHTML = h;
  TAB = 'dia'; mostrar('dia'); renderNav();
  if (n === 1 && !S.popupDia1 && !hecho(1)) setTimeout(popupDia1, 450);
}
// Up2 (18/10): só lista exercício que tem ficha na guia (o Freno al aviso não tem) e aceita passo livre com exercício (Funcionales, dias 17 e 18).
function tieneFichaUp2(id) { return !!(UPP_DATA.upp2 && String(UPP_DATA.upp2.pagina || '').indexOf('id="ep-f-' + id + '"') > -1); }
function pasoConFicha(p) { return (p.tipo === 'secuencia' || p.tipo === 'libre') && p.ejercicio && tieneFichaUp2(p.ejercicio); }
function fichasUp2(d) {
  var ids = [];
  (d.pasos || []).forEach(function (p) { if (pasoConFicha(p) && ids.indexOf(p.ejercicio) < 0) ids.push(p.ejercicio); });
  if (!ids.length) return '';
  return '<div class="card" style="margin-top:14px;border-color:rgba(79,142,247,.35);"><div class="kicker" style="color:#7eb8ff;margin-bottom:8px;">Ejecución Perfecta · tus fichas</div>'
    + ids.map(function (id) { var ex = (P.ejercicios || {})[id] || {}; return '<button class="li" style="margin-top:8px;" onclick="App.fichaUp2(\'' + id + '\')"><div class="em">📋</div><div class="grow"><div class="tt">' + esc(ex.nombre || id) + '</div></div><span class="chev">›</span></button>'; }).join('') + '</div>';
}
function popupDia1() {
  var D = M.popup_dia1 || {};
  S.popupDia1 = true; guardar();
  folha('<div class="row" style="margin-bottom:14px;">' + fotoAgente(46) + '<div class="grow"><div class="h3">' + esc(agente().nombre) + '</div><div class="tiny" style="color:var(--green);font-weight:700;">● En línea</div></div></div>'
    + '<div class="bub" style="margin-bottom:18px;">' + (D.titulo ? '<p><strong>' + tx(D.titulo) + '</strong></p>' : '') + parrafos((D.texto && D.texto.map ? D.texto.map(tx) : D.texto) || ['Vamos a empezar con calma. Es el mismo ejercicio que ya probaste en el video: aprieta un segundo, suelta un segundo.']) + '</div>'
    + '<button class="btn" onclick="App.fecharFolha()">' + esc(D.boton || '¡Vamos! →') + '</button>', true);
}

/* =====================================================================
 * Player da sessão
 * ===================================================================== */
var PL = null;   // { dia, paso, t0, timer, ... }
var AC = null;   // AudioContext
function audio() {
  if (AC) return AC;
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; }
  return AC;
}
function beep(f, ms, vol) {
  if (!S.sonido) return;
  var a = audio(); if (!a) return;
  try {
    if (a.state === 'suspended') a.resume();
    var o = a.createOscillator(), g = a.createGain();
    o.frequency.value = f; o.type = 'sine';
    g.gain.setValueAtTime(vol || 0.18, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + ms / 1000);
    o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + ms / 1000 + 0.02);
  } catch (e) {}
}
var _wl = null;
function pantallaEncendida(on) {
  try {
    if (on && navigator.wakeLock && !_wl) navigator.wakeLock.request('screen').then(function (w) { _wl = w; }).catch(function () {});
    if (!on && _wl) { _wl.release(); _wl = null; }
  } catch (e) {}
}
function iniciarSesion(n, deCero) {
  audio();
  var d = diaData(n); if (!d) return;
  if (!S.sesion || S.sesion.dia !== n || deCero) S.sesion = { dia: n, paso: 0, t0: Date.now(), seg: 0 };
  guardar();
  PL = { dia: n, d: d, paso: S.sesion.paso, timer: null, primera: !hecho(n) };
  $('player').classList.add('on');
  document.body.classList.add('lock');
  pantallaEncendida(true);
  renderPaso();
}
// Cartão do vídeo do dia dentro da tela do cronômetro (pedido do Kess, 13/10): toca, abre por cima, vê a execução e continua.
function videoEnSesion() {
  var v = videosDelDia(PL.dia)[0];
  if (!v) return '';
  var y = ytId(v.id);
  return '<button class="vmini" onclick="App.videoSesion()">'
    + (y ? '<span class="vmini-img"><img src="https://i.ytimg.com/vi/' + y + '/mqdefault.jpg" alt=""><i><svg viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg></i></span>' : '')
    + '<span class="grow"><b>Ver cómo se hace</b><small>' + esc(v.name) + '</small></span><span class="chev">›</span></button>';
}
function videoSesion() {
  var v = videosDelDia(PL.dia)[0]; if (!v) return;
  if (PL.corriendo && !PL.pausa) timerToggle();   // pausa o tempo enquanto ele assiste
  leitor(v.name, ytEmbed(v.id) + '<p class="small muted" style="margin:14px 0;text-align:center;">Mira cómo se hace y vuelve a tu sesión.</p>'
    + '<button class="btn" onclick="App.fecharLeitor()">Volver a mi sesión</button>');
}
function retomar() { if (S.sesion) { DIA = S.sesion.dia; iniciarSesion(S.sesion.dia); } }
function plHeader(titulo) {
  var tot = PL.d.pasos.length, i = PL.paso;
  return '<div class="pl-hd"><button class="xbtn" onclick="App.salirSesion()">×</button><div class="grow"><div class="t1">Día ' + pad2(PL.dia) + ' · ' + esc(PL.d.titulo || '') + '</div><div class="t2">Paso ' + (i + 1) + ' de ' + tot + (titulo ? ' · ' + esc(titulo) : '') + '</div></div>'
    + '<button class="round" style="width:42px;height:42px;" onclick="App.sonido()">' + (S.sonido ? '🔊' : '🔇') + '</button></div>'
    + '<div class="pl-bar"><i style="width:' + Math.round(i / tot * 100) + '%"></i></div>';
}
function pararTimer() { if (PL && PL.timer) { clearInterval(PL.timer); PL.timer = null; } }
function renderPaso() {
  pararTimer();
  var p = PL.d.pasos[PL.paso];
  if (!p) { terminarSesion(); return; }
  S.sesion.paso = PL.paso; guardar();
  var nm = nombrePaso(p);
  var el = $('player');
  if (p.opcional && !PL.extraOk) {
    // A sessão principal acabou: o dia já conta. A mobilidade em vídeo é extra.
    marcarHecho(PL.dia);
    var extras = PL.d.pasos.slice(PL.paso).filter(function (x) { return x.opcional; });
    var segx = extras.reduce(function (a, x) { return a + duracionPaso(x); }, 0);
    el.innerHTML = plHeader('Extra') + '<div class="pl-body"><div class="done-wrap" style="padding-top:10px;"><div class="trofeo">✅</div><div class="kicker" style="color:var(--green);">Sesión principal cumplida</div>'
      + '<div class="h2" style="margin:8px 0 10px;">¿Quieres el extra de movilidad?</div><p class="muted" style="line-height:1.6;">' + extras.length + ' video' + (extras.length > 1 ? 's' : '') + ' de cadera, unos ' + Math.max(1, Math.round(segx / 60)) + ' minutos. Ayuda a soltar la zona, pero es opcional.</p></div></div>'
      + '<div class="pl-foot"><button class="btn" onclick="App.extraSi()">Hacer el extra →</button><button class="textbtn" onclick="App.extraNo()">Terminar aquí</button></div>';
    return;
  }
  if (p.tipo === 'leccion') {
    var l = (P.lecciones || {})[p.leccion] || { titulo: 'Lectura', parrafos: [] };
    el.innerHTML = plHeader('Lectura') + '<div class="pl-body"><div class="kicker">Lectura de hoy</div><div class="lec"><div class="h2" style="margin-top:8px;">' + esc(l.titulo) + '</div>' + htmlLeccion(l) + '</div></div>'
      + '<div class="pl-foot"><button class="btn" onclick="App.pasoSiguiente()">Entendido, sigamos →</button></div>';
    return;
  }
  if (p.tipo === 'checkin') {
    el.innerHTML = plHeader('Check-in') + '<div class="pl-body"><div class="kicker">Check-in</div><div class="h1" style="margin-top:8px;">' + esc(p.pregunta) + '</div><div class="ck-opts">'
      + (p.opciones || ['Sí', 'Casi', 'No practiqué']).map(function (o) { return '<button class="opt" onclick="App.checkin(\'' + esc(o) + '\')"><span>' + esc(o) + '</span><span class="dot"></span></button>'; }).join('') + '</div>'
      + (p.ayuda ? '<p class="small muted" style="margin-top:14px;line-height:1.5;">' + esc(p.ayuda) + '</p>' : '') + '</div>';
    return;
  }
  if (p.tipo === 'autoevaluacion') { renderAutoeval(p); return; }
  if (p.tipo === 'movilidad') {
    var v = (C.MOVILIDAD || {})[p.video] || {};
    el.innerHTML = plHeader('Extra opcional') + '<div class="pl-body"><span class="tiempo-tag" style="align-self:flex-start;">Extra opcional · movilidad</span><div class="ex-name">' + esc(v.name || 'Movilidad') + '</div>'
      + '<div class="ex-ind">' + (p.series || 2) + ' series de ' + (p.seg || 40) + ' segundos. Mira el video y sigue el movimiento.</div>' + (v.id ? '<div class="video16">' + ytEmbed(v.id).replace(/^<div[^>]*><div[^>]*>/, '').replace(/<\/div><\/div>$/, '') + '</div>' : '')
      + '<div id="mv-t" class="center" style="margin-top:12px;"></div></div>'
      + '<div class="pl-foot"><div class="ctrls"><button class="btn ghost" onclick="App.pasoSiguiente()">Saltar</button><button class="btn" id="mv-b" onclick="App.movilidadTimer()">▶ Serie 1 · ' + (p.seg || 40) + ' s</button></div></div>';
    PL.mv = { serie: 1 };
    return;
  }
  // secuencia, freno_aviso, libre: timer guiado
  var ex = (P.ejercicios || {})[p.ejercicio] || {};
  var tag = p.tiempo && P.tiempos && P.tiempos[p.tiempo] ? 'Tiempo ' + p.tiempo + ' · ' + P.tiempos[p.tiempo].nombre : p.tipo === 'freno_aviso' ? 'Tiempo 3 · El Freno' : 'Práctica guiada';
  PL.seg = construirLinea(p);
  PL.idx = -1; PL.restante = 0; PL.corriendo = false; PL.pausa = false;
  el.innerHTML = plHeader(nm.t) + '<div class="pl-body">'
    + '<span class="tiempo-tag" style="align-self:flex-start;">' + esc(tag) + '</span>'
    + '<div class="ex-name">' + esc(nm.t) + '</div>'
    + '<div class="ex-ind">' + esc(p.indicacion || ex.corto || '') + '</div>'
    + videoEnSesion()
    + (ex.como && ex.como.length ? '<button class="link" style="align-self:flex-start;margin-top:8px;font-size:13px;" onclick="App.verTecnica(\'' + esc(p.ejercicio) + '\')">Ver la técnica</button>' : '')
    + '<div class="orb-wrap"><div class="orb" id="orb"><div class="lab" id="orb-l">Listo</div><div class="num" id="orb-n">' + mmss(PL.seg.total) + '</div><div class="fz" id="orb-f"></div></div>'
    + '<div class="reps" id="reps"></div></div></div>'
    + '<div class="pl-foot"><div class="ctrls">'
    + '<button class="round" onclick="App.pasoSiguiente()" aria-label="Saltar"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="m5 4 10 8-10 8zM19 5v14"/></svg></button>'
    + '<button class="btn" id="pl-go" onclick="App.timerToggle()">▶ EMPEZAR</button></div></div>';
  pintarReps();
}
// Linha do tempo de um passo: lista de segmentos { accion, seg, texto, fuerza, rep, serie }.
function construirLinea(p) {
  var seg = [];
  if (p.tipo === 'secuencia') {
    var series = p.series || 1, reps = p.reps || 1;
    for (var s = 1; s <= series; s++) {
      for (var r = 1; r <= reps; r++) (p.fases || []).forEach(function (f) { seg.push({ accion: f.accion, seg: +f.seg || 1, texto: f.texto, fuerza: f.fuerza, rep: r, reps: reps, serie: s, series: series }); });
      if (s < series && p.descanso) seg.push({ accion: 'descanso', seg: p.descanso, texto: 'Descansa', serie: s, series: series });
    }
  } else if (p.tipo === 'freno_aviso') {
    // O app faz o papel do diretor: contrações suaves no ritmo e, em momentos sorteados, "¡Señal!" → pisa o Freno.
    var D = p.duracion_seg || 180, N = p.avisos || 6, fr = p.freno_seg || 5, su = p.suelta_seg || 6, re = p.respira_seg || 4;
    var TX = p.textos || {}, iv = p.intervalo_seg || [10, 22];
    var rf = p.ritmo_fases && p.ritmo_fases.length ? p.ritmo_fases : [{ accion: 'aprieta', seg: 2, fuerza: 25, texto: 'Suave' }, { accion: 'suelta', seg: 2, texto: 'Suelta' }];
    var ritmo = function (dur) {
      var t = 0, i = 0;
      while (t < dur) { var f = rf[i % rf.length], d2 = Math.min(+f.seg || 2, dur - t); seg.push({ accion: f.accion, seg: d2, texto: f.texto, fuerza: f.fuerza, ritmo: true }); t += d2; i++; }
      return t;
    };
    var usado = 0;
    for (var k = 0; k < N; k++) {
      var gap = Math.round(iv[0] + Math.random() * (iv[1] - iv[0]));
      usado += ritmo(gap);
      seg.push({ accion: 'senal', seg: 1, texto: TX.senal || '¡Señal!', aviso: k + 1, avisos: N });
      seg.push({ accion: 'aprieta', seg: fr, texto: TX.freno || 'Pisa el Freno', fuerza: 100, aviso: k + 1, avisos: N, freno: true });
      seg.push({ accion: 'suelta_lento', seg: su, texto: TX.suelta || 'Suelta lento', aviso: k + 1, avisos: N });
      seg.push({ accion: 'respira', seg: re, texto: TX.respira || 'Respira', aviso: k + 1, avisos: N });
      usado += 1 + fr + su + re;
    }
    ritmo(Math.max(4, D - usado));
  } else if (p.pauta && p.pauta.length) {
    // prática guiada com pauta (ex.: respiração 4/6, contrações caminhando)
    var Dl = p.seg || 60, tl = 0;
    while (tl < Dl) { for (var q = 0; q < p.pauta.length && tl < Dl; q++) { var pf = p.pauta[q], dl = Math.min(+pf.seg || 1, Dl - tl); seg.push({ accion: pf.accion, seg: dl, texto: pf.texto, fuerza: pf.fuerza }); tl += dl; } }
  } else {
    seg.push({ accion: 'libre', seg: p.seg || 60, texto: p.texto_pantalla || p.titulo || 'Practica' });
  }
  seg.total = seg.reduce(function (a, b) { return a + b.seg; }, 0);
  return seg;
}
var ROT = { aprieta: 'Aprieta', sosten: 'Sostén', sube: 'Sube', baja: 'Baja', suelta: 'Suelta', suelta_lento: 'Suelta lento', respira: 'Respira', descanso: 'Descansa', senal: '¡Señal!', libre: 'Practica' };
var CLS = { aprieta: 'a', sosten: 'a', sube: 'a', baja: 's', suelta: 's', suelta_lento: 's', respira: 'r', descanso: 'r', senal: 'senal', libre: 'a' };
function pintarReps() {
  var s = PL.seg[Math.max(0, PL.idx)] || PL.seg[0] || {};
  var h = '';
  if (s.series) h += '<span>Serie <b>' + s.serie + '</b>/' + s.series + '</span>';
  if (s.reps) h += '<span>Rep <b>' + (s.rep || 1) + '</b>/' + s.reps + '</span>';
  if (s.avisos) h += '<span>Señal <b>' + (s.aviso || 0) + '</b>/' + s.avisos + '</span>';
  var rest = PL.seg.slice(Math.max(0, PL.idx + 1)).reduce(function (a, b) { return a + b.seg; }, 0) + Math.max(0, PL.restante);
  h += '<span>Quedan <b>' + mmss(PL.idx < 0 ? PL.seg.total : rest) + '</b></span>';
  $('reps').innerHTML = h;
}
function entrarSegmento(i) {
  PL.idx = i;
  var s = PL.seg[i];
  if (!s) { finSegmentos(); return; }
  PL.restante = s.seg; PL.ini = performance.now(); PL.durMs = s.seg * 1000;
  var orb = $('orb'); orb.className = 'orb ' + (CLS[s.accion] || 'a');
  $('orb-l').textContent = s.texto || ROT[s.accion] || '';
  $('orb-f').textContent = s.fuerza ? 'Fuerza ' + s.fuerza + '%' : '';
  if (s.accion === 'senal') { beep(1180, 380, 0.3); setTimeout(function () { beep(1180, 380, 0.3); }, 420); vibrar([220, 80, 220]); }
  else if (CLS[s.accion] === 'a') { beep(s.ritmo ? 620 : 740, 140); vibrar(s.ritmo ? 25 : 70); }
  else if (s.accion === 'descanso') { beep(440, 260); vibrar([40, 60, 40]); }
  else { beep(520, 110); vibrar(25); }
  pintarReps();
}
function tick() {
  if (!PL || PL.pausa) return;
  var el = performance.now() - PL.ini, rest = (PL.durMs - el) / 1000;
  PL.restante = rest;
  $('orb-n').textContent = Math.max(1, Math.ceil(rest));
  if (rest <= 0) entrarSegmento(PL.idx + 1);
}
function timerToggle() {
  audio();
  if (!PL.corriendo) {
    PL.corriendo = true; PL.pausa = false;
    $('pl-go').innerHTML = '❚❚ PAUSA';
    entrarSegmento(0);
    PL.timer = setInterval(tick, 100);
    return;
  }
  if (!PL.pausa) { PL.pausa = true; PL.pausadoEn = performance.now(); $('pl-go').innerHTML = '▶ SEGUIR'; $('orb').classList.add('pausa'); }
  else { PL.pausa = false; PL.ini += performance.now() - PL.pausadoEn; $('pl-go').innerHTML = '❚❚ PAUSA'; $('orb').classList.remove('pausa'); }
}
function finSegmentos() {
  pararTimer();
  beep(880, 160); setTimeout(function () { beep(1100, 220); }, 180); vibrar([60, 60, 120]);
  $('orb').className = 'orb s'; $('orb-l').textContent = '¡Bien hecho!'; $('orb-n').textContent = '✓'; $('orb-f').textContent = '';
  $('pl-go').innerHTML = 'SIGUIENTE →'; $('pl-go').onclick = pasoSiguiente;
  setTimeout(function () { if (PL && PL.idx >= PL.seg.length) pasoSiguiente(); }, 1800);
}
function pasoSiguiente() {
  if (!PL) return;
  pararTimer();
  PL.paso++;
  if (PL.paso >= PL.d.pasos.length) { terminarSesion(); return; }
  renderPaso();
}
function movilidadTimer() {
  var p = PL.d.pasos[PL.paso], segs = p.seg || 40, tot = p.series || 2;
  var b = $('mv-b'); if (PL.mvRun) return;
  PL.mvRun = true; var t = segs; b.disabled = true;
  $('mv-t').innerHTML = '<div class="h1">' + t + '</div>';
  beep(740, 120);
  PL.timer = setInterval(function () {
    t--; $('mv-t').innerHTML = '<div class="h1">' + Math.max(0, t) + '</div>';
    if (t <= 0) {
      pararTimer(); PL.mvRun = false; beep(880, 200); vibrar(80);
      if (PL.mv.serie >= tot) { b.disabled = false; b.textContent = 'TERMINAR →'; b.onclick = pasoSiguiente; return; }
      PL.mv.serie++; b.disabled = false; b.textContent = '▶ Serie ' + PL.mv.serie + ' · ' + segs + ' s (descansa 20 s antes)';
    }
  }, 1000);
}
function extraSi() { PL.extraOk = true; renderPaso(); }
function extraNo() { terminarSesion(); }
function checkin(v) { S.senal[PL.dia] = v; guardar(); pasoSiguiente(); }
function renderAutoeval(p) {
  var qs = p.preguntas || [];
  PL.ae = PL.ae || {};
  $('player').innerHTML = plHeader('Autoevaluación') + '<div class="pl-body"><div class="kicker">Autoevaluación final</div><div class="h2" style="margin:8px 0 16px;">Del 1 al 5, ¿cómo estás hoy?</div>'
    + qs.map(function (q, i) {
      return '<div class="card" style="margin-bottom:10px;"><div class="small" style="margin-bottom:10px;line-height:1.5;">' + esc(q) + '</div><div style="display:flex;gap:6px;">'
        + [1, 2, 3, 4, 5].map(function (v) { return '<button class="opt' + (PL.ae[i] === v ? ' sel' : '') + '" style="justify-content:center;padding:12px 0;" onclick="App.autoeval(' + i + ',' + v + ')">' + v + '</button>'; }).join('') + '</div></div>';
    }).join('') + '</div><div class="pl-foot"><button class="btn" ' + (Object.keys(PL.ae).length < qs.length ? 'disabled' : '') + ' onclick="App.autoevalListo()">GUARDAR →</button></div>';
}
function autoeval(i, v) { PL.ae[i] = v; renderAutoeval(PL.d.pasos[PL.paso]); }
function autoevalListo() { S.autoeval = { fecha: hoyStr(), r: PL.ae }; guardar(); pasoSiguiente(); }
function verTecnica(id) {
  var ex = (P.ejercicios || {})[id]; if (!ex) return;
  var h = '<div class="sheet-hd"><div class="grow">' + esc(ex.nombre) + '</div><button class="xbtn" onclick="App.fecharFolha()">×</button></div>'
    + '<ol style="padding-left:20px;color:#D9D6E3;line-height:1.7;font-size:15px;">' + (ex.como || []).map(function (c) { return '<li style="margin-bottom:6px;">' + esc(c) + '</li>'; }).join('') + '</ol>'
    + (ex.senal_bien ? '<div class="card" style="margin-top:14px;"><div class="kicker" style="color:var(--green);margin-bottom:6px;">Vas bien si…</div><div class="small" style="line-height:1.6;">' + esc(ex.senal_bien) + '</div></div>' : '')
    + (ex.errores && ex.errores.length ? '<div class="card"><div class="kicker" style="color:var(--red);margin-bottom:6px;">Errores comunes</div>' + ex.errores.map(function (e) { return '<div class="small" style="line-height:1.6;margin-bottom:4px;">• ' + esc(e) + '</div>'; }).join('') + '</div>' : '')
    + (S.up.up2 && tieneFichaUp2(id) ? '<button class="btn up2" style="margin-top:14px;" onclick="App.fecharFolha();App.fichaUp2(\'' + id + '\')">Ficha completa de Ejecución Perfecta</button>' : '');
  folha(h);
}
function salirSesion() {
  folha('<div class="center"><div class="h3" style="margin-bottom:8px;">¿Pausar la sesión?</div><p class="muted small" style="margin-bottom:18px;line-height:1.6;">Queda guardada. La retomas desde este paso con el botón de abajo.</p>'
    + '<button class="btn" onclick="App.fecharFolha()">Seguir entrenando</button><button class="textbtn" onclick="App.fecharFolha();App.cerrarPlayer()">Salir y continuar después</button></div>', true);
}
function cerrarPlayer() {
  pararTimer(); pantallaEncendida(false);
  $('player').classList.remove('on'); $('player').innerHTML = '';
  document.body.classList.remove('lock');
  PL = null;
  tab('inicio');
}
function marcarHecho(n) {
  var seg = S.sesion && S.sesion.dia === n ? Math.round((Date.now() - S.sesion.t0) / 1000) : 0;
  if (!S.completados[n]) S.completados[n] = { fecha: hoyStr(), seg: seg };
  if (S.activos.indexOf(hoyStr()) < 0) S.activos.push(hoyStr());
  guardar();
}
function terminarSesion() {
  pararTimer(); pantallaEncendida(false);
  var n = PL.dia, primera = PL.primera;
  var seg = S.sesion ? Math.round((Date.now() - S.sesion.t0) / 1000) : 0;
  marcarHecho(n);
  S.sesion = null; guardar();
  var SC = M.sesion_cumplida || {};
  var vari = SC.variaciones || [];
  var frase = vari.length ? vari[(n - 1) % vari.length] : '';
  var med = medallas().filter(function (m) { return m.f.dias[1] === n && m.ganada; })[0];
  var prox = n < 21 ? (abierto(n + 1) ? 'El Día ' + (n + 1) + ' ya está abierto.' : 'El Día ' + (n + 1) + ' se abre ' + fechaCorta(fechaApertura(n + 1)) + '.') : '¡Completaste los 21 días!';
  $('player').innerHTML = '<div class="pl-body"><div class="done-wrap">'
    + '<div class="trofeo">' + (med ? ((med.f.medalla || {}).emoji || '🏅') : '🏆') + '</div>'
    + '<div class="kicker" style="color:var(--green);">Día ' + pad2(n) + ' completado</div>'
    + '<div class="h1" style="margin:8px 0 10px;">' + tx(SC.titulo || '¡Sesión cumplida!') + '</div>'
    + (frase ? '<p class="muted" style="line-height:1.6;max-width:320px;">' + tx(frase) + '</p>' : '')
    + (med ? '<div class="card" style="margin-top:16px;border-color:rgba(251,191,36,.4);"><div class="kicker" style="color:var(--amber);">¡Nueva medalla!</div><div class="h3" style="margin-top:4px;">' + esc((med.f.medalla || {}).nombre || med.f.nombre) + '</div></div>' : '')
    + '<div class="done-stats"><div><div class="v">' + mmss(seg) + '</div><div class="k">Tiempo</div></div><div><div class="v">🔥 ' + racha() + '</div><div class="k">Racha</div></div><div><div class="v">' + totalHechos() + '/21</div><div class="k">Días</div></div></div>'
    + '<p class="small muted" style="margin-bottom:18px;">' + prox + '</p>'
    + '<button class="btn" onclick="App.cerrarPlayer();App.despuesDeSesion(' + n + ',' + (primera ? 1 : 0) + ')">VOLVER AL INICIO</button></div></div>';
  beep(660, 150); setTimeout(function () { beep(880, 150); }, 160); setTimeout(function () { beep(1320, 260); }, 320);
  vibrar([80, 60, 80, 60, 160]);
}
function despuesDeSesion(n, primera) {
  // No pico: aviso da Clara e, depois do Dia 1, o pedido de instalar.
  setTimeout(function () {
    if (noLeidos()) toast(agente().nombre, '💬 Te dejó un mensaje 👇', function () { tab('chat'); });
  }, 700);
  if (primera && n === 1 && !esStandalone() && !S.inst.dia1) setTimeout(function () { S.inst.dia1 = true; guardar(); instalar('dia1'); }, 2600);
  else if (pushPuedePedir()) setTimeout(function () { if (!$('ov').classList.contains('on')) pedirPush('sesion'); }, 2600);
  else setTimeout(ofertaCheck, 2600);
}
function barraActiva() {
  var el = $('activa');
  var vis = S && S.sesion && !PL && ['inicio', 'up1', 'up2', 'chat', 'perfil'].indexOf(TAB) > -1 && $('s-' + TAB) && $('s-' + TAB).classList.contains('on');
  if (!vis) { el.classList.add('hidden'); return; }
  var d = diaData(S.sesion.dia) || { pasos: [] }, p = d.pasos[S.sesion.paso];
  el.innerHTML = '<div class="ico">⏱</div><div class="grow"><div class="t1">Día ' + pad2(S.sesion.dia) + ' <span class="tag">ACTIVA</span></div><div class="t2">' + esc(p ? nombrePaso(p).t : '') + ' · paso ' + (S.sesion.paso + 1) + ' de ' + d.pasos.length + '</div></div>'
    + '<div class="go"><svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M7 4v16l13-8z"/></svg></div>';
  el.classList.remove('hidden');
}

/* =====================================================================
 * Ir a día (recuperar progresso)
 * ===================================================================== */
var IAD = 1;
function irADia() {
  IAD = siguiente() || diaHoy();
  pintarIrADia();
}
function pintarIrADia() {
  folha('<div class="sheet-hd"><div class="grow">↻ Ir a día</div><button class="xbtn" onclick="App.fecharFolha()">×</button></div>'
    + '<p class="muted small" style="line-height:1.6;">Si cambiaste de celular o de navegador, elige el día en que estabas. La app sigue desde ahí.</p>'
    + '<div class="picker"><button onclick="App.iadMover(-1)">‹</button><div class="v">DÍA ' + pad2(IAD) + '<small>DE 21 · ' + esc(faseDeDia(IAD).nombre.toUpperCase()) + '</small></div><button onclick="App.iadMover(1)">›</button></div>'
    + '<div class="warn">' + (S.acceso.desde ? 'Los días antes del ' + IAD + ' quedan completados. Tu calendario sigue la fecha de tu compra.' : 'Los días antes del ' + IAD + ' quedan completados. El Día ' + IAD + ' queda abierto hoy, y desde ahí se abre uno nuevo por día.') + '</div>'
    + '<div class="ctrls"><button class="btn ghost" onclick="App.fecharFolha()">Cancelar</button><button class="btn" onclick="App.iadConfirmar()">Ir a este día</button></div>');
}
function iadMover(d) { IAD = Math.max(1, Math.min(S.acceso.desde ? diaHoy() : 21, IAD + d)); pintarIrADia(); }
function iadConfirmar() {
  var hoy = hoyStr();
  // Com a data da compra (MOBPAY), o calendário é dela: o "Ir a día" só marca os dias anteriores como feitos.
  if (!S.acceso.desde) { S.inicio = sumarDias(hoy, -(IAD - 1)); S.inicioManual = true; }
  S.iad = { dia: IAD, ts: Date.now() };   // escolha da pessoa: na memória, o "Ir a día" mais recente decide
  for (var n = 1; n <= 21; n++) {
    if (n < IAD && !S.completados[n]) S.completados[n] = { fecha: 'recuperado', seg: 0 };
    if (n >= IAD && S.completados[n] && S.completados[n].fecha === 'recuperado') delete S.completados[n];
  }
  S.sesion = null; guardar();
  fecharFolha(); tab('inicio');
}

/* =====================================================================
 * Upsells: conteúdo (cifrado) ou página de venda
 * ===================================================================== */
var UPP_DATA = { upp1: null, upp2: null };
function codigoGuardado(k) { try { return localStorage.getItem(CODE_KEY[k]) || ''; } catch (e) { return ''; } }
function guardarCodigo(k, c) { try { localStorage.setItem(CODE_KEY[k], c); } catch (e) {} }
// UPP_CRIPTO (mesmo trecho do app antigo; o cifrar_upsells.mjs o testa)
function uppNormalize(v) { return String(v == null ? '' : v).trim().toUpperCase(); }
function uppB64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
function uppInflate(src) {
  var LB = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
  var LE = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
  var DB = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
  var DE = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
  var ORD = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];
  var out = [], pos = 0, cur = 0, cnt = 0;
  function bit() { if (!cnt) { if (pos >= src.length) throw new Error('inflate'); cur = src[pos++]; cnt = 8; } var b = cur & 1; cur >>= 1; cnt--; return b; }
  function bits(n) { var v = 0; for (var i = 0; i < n; i++) v |= bit() << i; return v; }
  function table(lens, n) { var count = new Uint16Array(16), offs = new Uint16Array(16), sym = new Uint16Array(n), i; for (i = 0; i < n; i++) count[lens[i]]++; count[0] = 0;
    for (i = 1; i < 16; i++) offs[i] = offs[i - 1] + count[i - 1]; for (i = 0; i < n; i++) if (lens[i]) sym[offs[lens[i]]++] = i; return { count: count, sym: sym }; }
  function decode(t) { var code = 0, first = 0, index = 0; for (var len = 1; len < 16; len++) { code |= bit(); var c = t.count[len]; if (code - c < first) return t.sym[index + (code - first)];
    index += c; first += c; first <<= 1; code <<= 1; } throw new Error('inflate'); }
  var last, type, lt, dt, lens, i, n, sym, len, dist, rep, val, start;
  do {
    last = bit(); type = bits(2);
    if (type === 0) { cnt = 0; len = src[pos] | (src[pos + 1] << 8); pos += 4; for (i = 0; i < len; i++) out.push(src[pos++]); continue; }
    if (type === 1) { lens = new Uint8Array(288); for (i = 0; i < 144; i++) lens[i] = 8; for (; i < 256; i++) lens[i] = 9; for (; i < 280; i++) lens[i] = 7; for (; i < 288; i++) lens[i] = 8;
      lt = table(lens, 288); lens = new Uint8Array(30); for (i = 0; i < 30; i++) lens[i] = 5; dt = table(lens, 30); }
    else if (type === 2) { var hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4; lens = new Uint8Array(19); for (i = 0; i < hclen; i++) lens[ORD[i]] = bits(3);
      var ct = table(lens, 19); lens = new Uint8Array(hlit + hdist);
      for (n = 0; n < hlit + hdist;) { sym = decode(ct); if (sym < 16) { lens[n++] = sym; continue; } val = 0;
        if (sym === 16) { val = lens[n - 1]; rep = 3 + bits(2); } else if (sym === 17) rep = 3 + bits(3); else rep = 11 + bits(7); while (rep--) lens[n++] = val; }
      lt = table(lens.subarray(0, hlit), hlit); dt = table(lens.subarray(hlit), hdist); }
    else throw new Error('inflate');
    for (;;) { sym = decode(lt); if (sym < 256) out.push(sym); else if (sym === 256) break;
      else { sym -= 257; len = LB[sym] + bits(LE[sym]); sym = decode(dt); dist = DB[sym] + bits(DE[sym]); start = out.length - dist; for (i = 0; i < len; i++) out.push(out[start + i]); } }
  } while (!last);
  return new Uint8Array(out);
}
function uppDecrypt(blocks, id, code) {
  var b = blocks && blocks[id];
  if (!b) return Promise.reject(new Error('sin-bloque'));
  var cs = (typeof crypto !== 'undefined') && crypto.subtle;
  if (!cs) return Promise.reject(new Error('sin-cripto'));
  var enc = new TextEncoder();
  return cs.importKey('raw', enc.encode(uppNormalize(code)), 'PBKDF2', false, ['deriveKey'])
    .then(function (base) { return cs.deriveKey({ name: 'PBKDF2', salt: uppB64(b.s), iterations: b.it, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']); })
    .then(function (key) { return cs.decrypt({ name: 'AES-GCM', iv: uppB64(b.iv), additionalData: enc.encode('tdc:' + id) }, key, uppB64(b.ct)); })
    .then(function (buf) { var bytes = new Uint8Array(buf); if (b.z === 'deflate-raw') bytes = uppInflate(bytes); return JSON.parse(new TextDecoder().decode(bytes)); });
}
// UPP_CRIPTO_FIM
var VIDEO_UP = {};
function abrirUpsellConCodigo(k, code, silencioso) {
  return uppDecrypt(CIFRADO, UPP_ID[k], code).then(function (data) {
    UPP_DATA[UPP_ID[k]] = data;
    var v = data.videos || {}; for (var x in v) VIDEO_UP[x] = v[x];
    guardarCodigo(k, uppNormalize(code));
    var nuevo = !S.up[k];
    S.up[k] = true; guardar();
    renderNav();
    if (nuevo && !silencioso) bienvenidaUp(k);
    if (TAB === k) renderUp(k);
    return true;
  }, function () { return false; });
}
function cargarUpsellsGuardados() {
  return Promise.all(['up1', 'up2'].map(function (k) { var c = codigoGuardado(k); return c ? abrirUpsellConCodigo(k, c, true) : Promise.resolve(false); }));
}
function bienvenidaUp(k) {
  var u = U[k] || {};
  folha('<div class="center"><div style="font-size:46px;margin-bottom:8px;">' + (k === 'up1' ? '⚡' : '🎯') + '</div><div class="kicker" style="color:' + (k === 'up1' ? 'var(--up1)' : 'var(--up2)') + ';">Desbloqueado</div>'
    + '<div class="h2" style="margin:6px 0 10px;">' + esc(u.nombre || '') + '</div><p class="muted small" style="line-height:1.6;margin-bottom:18px;">Ya está en tu app, en la pestaña de abajo. Empieza por arriba: ahí está lo de hoy.</p>'
    + '<button class="btn ' + k + '" onclick="App.fecharFolha();App.tab(\'' + k + '\')">ABRIR AHORA →</button></div>', true);
}
var UPP_BLOQUES = {
  progreso: function () { return up1ProgresoHtml(); },
  dias: function () { return up1DiasHtml(); },
  videoIntro: function () { return VIDEO_UP['upp2-intro'] ? '<button onclick="App.videoUp(\'upp2-intro\')" class="btn sm ghost" style="margin:-8px 0 20px;">▶ Ver la introducción en video</button>' : ''; },
  videoSemana: function (key) { return VIDEO_UP[key] ? '<button onclick="App.videoUp(\'' + key + '\')" class="btn sm ghost" style="margin-bottom:12px;">▶ Ver el video</button>' : ''; },
  videoClase: function (key) { return VIDEO_UP[key] ? '<button onclick="App.videoUp(\'' + key + '\')" class="btn sm ghost" style="margin-bottom:12px;">▶ Ver la clase en video</button>' : ''; },
  hoy: function () { return up2HoyHtml(); },
  cursoVideo: function (lugar, audio) { return cursoVideoHtml(lugar, audio); },
  practica: function () { return ''; }
};
function uppFill(tpl) {
  return String(tpl || '').replace(/\{\{(\w+)((?::[^:}]*)*)\}\}/g, function (m, name, args) {
    var f = UPP_BLOQUES[name]; return f ? f.apply(null, args ? args.slice(1).split(':') : []) : '';
  });
}
function renderUp(k) {
  var el = $('s-' + k);
  if (S.up[k] && UPP_DATA[UPP_ID[k]]) {
    el.innerHTML = '<div class="up-content" id="' + UPP_ID[k] + '-content">' + uppFill(UPP_DATA[UPP_ID[k]].pagina) + '</div>';
    return;
  }
  if (S.up[k] && codigoGuardado(k)) { el.innerHTML = '<div class="center muted" style="padding:80px 20px;">Abriendo tu protocolo…</div>'; abrirUpsellConCodigo(k, codigoGuardado(k), true); return; }
  el.innerHTML = paginaVenta(k);
}
function videoUp(key) {
  var id = VIDEO_UP[key]; if (!id) return;
  folha('<div class="sheet-hd"><div class="grow">Video</div><button class="xbtn" onclick="App.fecharFolha()">×</button></div>' + ytEmbed(id));
}
// Curso em vídeo do Up2 (C.CURSO_VIDEO, 27/10): o fecho depois da aula 8.4 do "Bueno en la Cama" e o cartão no fim do índice.
// Sem link, nada aparece. O caminho do áudio do fecho vem do conteúdo cifrado ({{cursoVideo:fin:audio/...}}), não do config.
function cursoVideoHtml(lugar, audio) {
  var V = C.CURSO_VIDEO || {};
  if (!V.url) return '';
  if (lugar === 'fin') {
    var f = V.fecho || {};
    return '<div style="height:1px;background:var(--line-2);margin:28px 0 6px;"></div><h2>' + esc(f.titulo) + '</h2>'
      + (audio ? '<audio controls preload="none" controlslist="nodownload" src="' + esc(audio) + '" style="width:100%;margin:2px 0 18px;color-scheme:dark;"></audio>' : '')
      + (f.parrafos || []).map(function (x) { return '<p>' + esc(x) + '</p>'; }).join('')
      + '<button class="btn up2" style="margin-top:8px;" onclick="App.cursoVideo()">' + esc(f.boton) + ' →</button>';
  }
  var t = V.tarjeta || {};
  return '<div style="font-size:11px;font-weight:700;letter-spacing:2px;color:#7eb8ff;text-transform:uppercase;margin:4px 0 12px;">' + esc(t.grupo) + '</div>'
    + '<div class="pdf-card" role="button" tabindex="0" onclick="App.cursoVideo()" style="cursor:pointer;margin-bottom:22px;"><div class="pdf-icon">' + esc(t.emoji) + '</div>'
    + '<div class="pdf-info"><div class="pdf-title">' + esc(t.titulo) + '</div><div class="pdf-sub">' + esc(t.linea) + '</div></div><div class="pdf-arrow">→</div></div>';
}
function cursoVideo() { var u = (C.CURSO_VIDEO || {}).url; if (u) window.open(u, '_blank', 'noopener'); }
// Up1 · Activación 7D (os 7 dias vêm cifrados)
function up1Prog() {
  S.up1Dias = S.up1Dias || [];
  var done = Math.min(S.up1Dias.length, 7), doneToday = S.up1Dias.indexOf(hoyStr()) > -1;
  return { done: done, doneToday: doneToday, current: Math.min(done + 1, 7), complete: done >= 7 };
}
function up1ProgresoHtml() {
  var p = up1Prog(), dots = '';
  for (var i = 1; i <= 7; i++) {
    var dd = i <= p.done, dc = !p.complete && i === p.current;
    dots += '<div style="width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;flex-shrink:0;'
      + (dd ? 'background:linear-gradient(135deg,#b91c1c,#7f1d1d);color:#fff;' : dc ? 'background:rgba(249,115,22,.18);border:2px solid #f97316;color:#f97316;' : 'background:var(--surface-2);color:var(--text-2);') + '">' + (dd ? '✓' : i) + '</div>';
  }
  var label = p.complete ? '🏆 ¡Protocolo de 7 días completado!' : 'Día ' + p.current + ' de 7' + (p.doneToday ? ' · check-in de hoy hecho ✓' : '');
  return '<div class="card" style="margin-bottom:16px;"><div class="h3 center" style="font-size:14px;margin-bottom:12px;">' + label + '</div><div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap;">' + dots + '</div>'
    + (p.complete ? '<div class="small muted center" style="margin-top:12px;line-height:1.6;">Retoma el desafío de 21 días donde estabas. Puedes repetir cualquier día de este protocolo cuando quieras un empujón extra.</div>' : '') + '</div>';
}
function up1DiasHtml() {
  var dd = (UPP_DATA.upp1 && UPP_DATA.upp1.dias) || [];
  return '<div class="kicker" style="color:#f97316;margin:4px 0 14px;">Tu protocolo · los 7 días</div>' + dd.map(up1DiaCard).join('');
}
function up1Pasos(list) { return (list || []).map(function (s) { return '<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:8px;"><div style="width:6px;height:6px;border-radius:50%;background:#f97316;flex-shrink:0;margin-top:8px;"></div><div style="font-size:14px;line-height:1.55;"><strong>' + s.n + '</strong> · ' + s.d + '</div></div>'; }).join(''); }
function up1DiaCard(d) {
  var p = up1Prog(), isDone = d.day <= p.done, isCur = !p.complete && d.day === p.current, act = isCur && !p.doneToday, open = isCur;
  var action = isDone ? '<div style="background:rgba(74,222,128,.1);border:1px solid rgba(74,222,128,.3);border-radius:12px;padding:12px;text-align:center;font-size:13px;font-weight:800;color:#4ade80;">DÍA ' + d.day + ' COMPLETADO ✓</div>'
    : act ? '<button class="btn up1" onclick="App.up1Checkin(' + d.day + ')">✓ HICE LAS 2 SESIONES DEL DÍA ' + d.day + '</button><div class="tiny muted center" style="margin-top:8px;">Marca el check-in solo cuando hayas hecho la sesión de la mañana y la de la noche.</div>'
    : isCur ? '<div class="small muted center" style="padding:12px;background:var(--surface-2);border-radius:12px;">🌙 Se desbloquea mañana: el descanso también entrena</div>'
    : '<div class="small muted center" style="padding:12px;background:var(--surface-2);border-radius:12px;">🔒 Se activa cuando completes el día ' + (d.day - 1) + '</div>';
  var combo = up1ComboHtml(d.combo);
  return '<div class="card" style="margin-bottom:12px;padding:0;overflow:hidden;' + (isCur ? 'border-color:rgba(249,115,22,.55);' : isDone ? 'border-color:rgba(74,222,128,.35);' : '') + '">'
    + '<div onclick="App.up1Toggle(' + d.day + ')" class="row" style="padding:14px 16px;cursor:pointer;"><div style="width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;flex-shrink:0;'
    + (isDone ? 'background:#16a34a;' : isCur ? 'background:#f97316;' : 'background:var(--surface-2);color:var(--text-2);') + '">' + (isDone ? '✓' : d.day) + '</div>'
    + '<div class="grow"><div class="h3" style="font-size:14px;">Día ' + d.day + ' · ' + d.title + '</div><div class="tiny muted">' + d.focus + '</div></div><span class="chev">▾</span></div>'
    + '<div id="up1-b-' + d.day + '" style="padding:0 16px 16px;display:' + (open ? 'block' : 'none') + ';">'
    + (d.videoKey && VIDEO_UP[d.videoKey] ? '<button class="btn sm ghost" style="margin-bottom:12px;" onclick="App.videoUp(\'' + d.videoKey + '\')">▶ Ver el video del Día ' + d.day + '</button>' : '')
    + '<div style="background:rgba(249,115,22,.07);border-radius:12px;padding:14px;margin-bottom:10px;"><div class="kicker" style="color:#f97316;margin-bottom:10px;">🌅 Mañana · ~5 min</div>' + up1Pasos(d.morning) + '</div>'
    + combo
    + '<div style="background:rgba(139,92,246,.07);border-radius:12px;padding:14px;margin-bottom:12px;"><div class="kicker" style="margin-bottom:10px;">🌙 Noche · ~' + d.nightMin + ' min</div>' + up1Pasos(d.night) + '</div>'
    + (d.why ? '<div style="background:rgba(249,115,22,.08);border:1px solid rgba(249,115,22,.25);border-radius:12px;padding:13px;margin-bottom:12px;"><div class="kicker" style="color:#f97316;margin-bottom:5px;">⚡ ¿Por qué funciona esta combinación?</div><div class="small muted" style="line-height:1.6;">' + d.why + '</div></div>' : '')
    + action + '</div></div>';
}
// Circuito do dia em vídeo: os mesmos vídeos de movilidad do programa (C.MOVILIDAD), em miniatura grande como no Día.
// Na v1 os vídeos vinham embutidos aqui; a v2 tinha deixado só os nomes (Kess, 20/10: o Up1 ficou sem como executar).
function up1ComboHtml(combo) {
  var itens = (combo || []).map(function (it) { var v = (C.MOVILIDAD || {})[it.ex]; return v && v.id ? { v: v, s: it.s } : null; }).filter(Boolean);
  if (!itens.length) return '';
  var total = itens.reduce(function (a, i) { return a + i.s; }, 0);
  return '<div style="background:rgba(185,28,28,.07);border:1px solid rgba(185,28,28,.22);border-radius:12px;padding:14px;margin-bottom:10px;">'
    + '<div class="kicker" style="color:#ef4444;margin-bottom:6px;">🎬 Circuito en video · modo intensivo</div>'
    + '<div class="small muted" style="line-height:1.55;margin-bottom:12px;">Los mismos ejercicios del programa, pero combinados más fuerte. Haz cada serie de 40 segundos con poco descanso entre ellas. Hoy: <strong style="color:var(--text);">' + itens.length + ' ejercicios · ' + total + ' series</strong>.</div>'
    + itens.map(function (i) { return '<div style="margin-bottom:12px;">' + thumbHtml({ id: i.v.id, name: i.v.name, sub: i.s + ' series × 40 s' }, true) + '</div>'; }).join('')
    + '</div>';
}
function up1Toggle(n) { var b = $('up1-b-' + n); if (b) b.style.display = b.style.display === 'none' ? 'block' : 'none'; }
function up1Checkin(n) { var p = up1Prog(); if (p.complete || p.doneToday || n !== p.current) return; S.up1Dias.push(hoyStr()); guardar(); renderUp('up1'); }
// Up2 · Ejecución Perfecta (guia em <template id="ep-...">)
function up2Open(id) {
  var t = document.getElementById('ep-' + id);
  if (!t) return;
  var grupo = t.getAttribute('data-grupo');
  var lista = Array.prototype.filter.call(document.querySelectorAll('#upp2-content template[id^="ep-"]'), function (x) { return x.getAttribute('data-grupo') === grupo; });
  var i = lista.indexOf(t), ant = lista[i - 1], sig = lista[i + 1];
  var nav = '<div style="display:flex;gap:10px;margin-top:28px;">'
    + (ant ? '<button class="btn sm ghost" style="flex:1;text-align:left;" onclick="App.up2Open(\'' + ant.id.slice(3) + '\')">← ' + ant.getAttribute('data-titulo') + '</button>' : '')
    + (sig ? '<button class="btn sm up2" style="flex:1;" onclick="App.up2Open(\'' + sig.id.slice(3) + '\')">Siguiente: ' + sig.getAttribute('data-titulo') + ' →</button>' : '') + '</div>'
    + '<button class="textbtn" onclick="App.fecharLeitor()">Volver al índice</button>';
  leitor(t.getAttribute('data-titulo') || 'Ejecución Perfecta', t.innerHTML + nav);
}
function fichaUp2(id) {
  if (!document.getElementById('upp2-content')) { renderUp('up2'); }
  var tmp = document.createElement('div');
  if (!document.getElementById('ep-f-' + id) && UPP_DATA.upp2) { tmp.innerHTML = uppFill(UPP_DATA.upp2.pagina); tmp.id = 'upp2-content'; tmp.style.display = 'none'; document.body.appendChild(tmp); }
  up2Open('f-' + id);
  if (tmp.parentNode) tmp.parentNode.removeChild(tmp);
}
function up2HoyHtml() {
  var n = siguiente() || diaHoy(), d = diaData(n) || { pasos: [] };
  var fichas = n === 1 ? [['musculo', 'Encuentra el músculo correcto']] : [];
  (d.pasos || []).forEach(function (p) { if (pasoConFicha(p) && P.ejercicios[p.ejercicio] && !fichas.some(function (f) { return f[0] === 'f-' + p.ejercicio; })) fichas.push(['f-' + p.ejercicio, P.ejercicios[p.ejercicio].nombre]); });
  return '<div class="card" style="border-color:rgba(79,140,247,0.35);margin-bottom:22px;"><div class="kicker" style="color:#7eb8ff;margin-bottom:6px;">Hoy te toca · Día ' + n + ' · ' + esc(faseDeDia(n).nombre) + '</div>'
    + '<div class="small muted" style="line-height:1.6;margin-bottom:12px;">Lee la ficha antes de tu sesión. Te toma un minuto.</div>'
    + fichas.map(function (f) { return '<button class="li" style="margin-top:8px;border-color:rgba(79,140,247,.35);" onclick="App.up2Open(\'' + f[0] + '\')"><div class="em">📋</div><div class="grow"><div class="tt">' + esc(f[1]) + '</div></div><span class="chev">›</span></button>'; }).join('') + '</div>';
}
// Página de venda (molde do Gui, sem escassez inventada)
// Lugares do Derick AI (CONFIG.DERICK): só aparecem ligados e com texto. O Claude não escreve esses textos.
function derick() { return C.DERICK || {}; }
function escasezHtml(lugar) {
  var E = derick().escasez || {};
  if (!E.activo || !E.texto || (E.en || []).indexOf(lugar) < 0) return '';
  S.escasezIni = S.escasezIni || Date.now(); guardar();
  var total = E.total || 50, n = Math.min(total - 1, (E.inicio || 0) + Math.floor((Date.now() - S.escasezIni) / ((E.sube_cada_horas || 6) * 3600000)));
  return '<div class="card" style="margin:12px 0;padding:12px 14px;border-color:rgba(251,191,36,.4);"><div class="small" style="font-weight:800;color:var(--amber);margin-bottom:8px;">' + esc(fmt(E.texto, { n: n, total: total })) + '</div>'
    + '<div style="height:7px;border-radius:7px;background:var(--surface-2);overflow:hidden;"><i style="display:block;height:100%;width:' + Math.round(n / total * 100) + '%;background:linear-gradient(90deg,#FBBF24,#F97316);"></i></div></div>';
}
function textoDerick(grupo, chave) { var g = derick()[grupo] || {}; return g.activo && g[chave] ? String(g[chave]) : ''; }

function paginaVenta(k) {
  var u = U[k] || {}, cls = k === 'up1' ? 'u1' : 'u2', hero = u.hero || {};
  var cta = function (txt) { return '<button class="btn ' + k + '" onclick="App.comprar(\'' + k + '\',\'pagina\')">' + esc(sinFlecha(txt || hero.cta || 'Quiero desbloquear')) + ' →</button>'; };
  var urg = textoDerick('urgencia', k);
  // Caixa do código: no Up2 fica no topo, para quem já comprou achar logo (Kess, 27/10); no Up1 segue no fim.
  var arriba = k === 'up2';
  var caja = '<div class="code-box' + (arriba ? ' arriba' : '') + '"><div class="small muted" style="margin-bottom:10px;">' + esc((arriba && u.codigo_topo) || '¿Ya lo compraste y no se abrió? Ingresa el código de tu correo de compra.') + '</div>'
    + '<input class="field" id="cod-' + k + '" placeholder="Código de acceso" autocapitalize="characters" style="text-align:center;letter-spacing:2px;font-size:16px;">'
    + '<div class="err-msg" id="cod-err-' + k + '"></div><button class="btn sm ghost" style="margin-top:10px;" onclick="App.codigo(\'' + k + '\')">Abrir con mi código</button></div>';
  var h = '<div class="sale">' + (arriba ? caja : '') + (urg ? '<div class="warn" style="margin:16px 18px 0;font-weight:800;">⏱ ' + esc(urg) + '</div>' : '') + '<div class="sale-hero ' + cls + '"><span class="lockpill">🔒 ' + esc((hero.kicker || 'Acceso bloqueado').split('·')[0].trim()) + '</span>'
    + '<div class="h1">' + esc(hero.titulo || u.nombre || '') + '</div><p>' + esc(hero.subtitulo || '') + '</p>' + cta() + '<div class="tiny muted" style="margin-top:10px;">' + esc(u.precio || '') + ' · ' + esc(u.precio_nota || 'pago único') + '</div></div>';
  if (u.como_funciona && u.como_funciona.length) h += '<div class="sale-sec"><div class="h2">Así funciona</div><div class="pasos3">' + u.como_funciona.map(function (t, i) { return '<div><b style="background:' + (k === 'up1' ? 'rgba(249,115,22,.2);color:#FDBA74' : 'rgba(79,142,247,.2);color:#93C5FD') + ';">' + (i + 1) + '</b><span>' + esc(t) + '</span></div>'; }).join('') + '</div></div>';
  if (u.dato) h += '<div class="sale-sec"><div class="dato ' + cls + '"><div class="n">' + esc(u.dato.numero) + '</div><p class="muted" style="margin-top:12px;line-height:1.6;font-size:14px;">' + esc(u.dato.texto) + '</p></div></div>';
  if (u.dolores) h += '<div class="sale-sec"><div class="h2">' + esc(u.dolores.titulo || '¿Te pasa esto?') + '</div><div class="check-list x">' + (u.dolores.items || []).map(function (t) { return '<div>' + esc(t) + '</div>'; }).join('') + '</div><div style="margin-top:14px;">' + cta() + '</div></div>';
  if (u.solucion) h += '<div class="sale-sec"><div class="h2">' + esc(u.solucion.titulo || '') + '</div><div class="check-list v">' + (u.solucion.beneficios || []).map(function (t) { return '<div>' + esc(t) + '</div>'; }).join('') + '</div></div>';
  var prom = textoDerick('promesa_upsell', k);
  if (prom) h += '<div class="sale-sec"><div class="card"><p class="small" style="line-height:1.6;">' + esc(prom) + '</p></div></div>';
  var esc1 = escasezHtml(k);
  if (esc1) h += '<div class="sale-sec">' + esc1 + '</div>';
  if (u.adentro && u.adentro.length) h += '<div class="sale-sec"><div class="h2">Lo que hay adentro</div><div class="list" style="padding:0;">' + u.adentro.map(function (t) { return '<div class="li" style="padding:12px 14px;"><div class="grow small" style="line-height:1.5;">' + esc(t) + '</div></div>'; }).join('') + '</div></div>';
  if (u.para_quien) h += '<div class="sale-sec"><div class="card"><div class="kicker" style="margin-bottom:6px;">¿Para quién es?</div><div class="small" style="line-height:1.6;">' + esc(u.para_quien) + '</div></div></div>';
  h += '<div class="sale-sec"><div class="price"><div class="kicker">Pago único</div><div class="p">' + esc(u.precio || '') + '</div><div class="small muted" style="margin:6px 0 16px;">Se libera aquí mismo, en esta pestaña.</div>' + cta() + '</div></div>';
  var gar = garantiaTexto(u);
  if (gar) h += '<div class="sale-sec"><div class="card center"><div style="font-size:30px;">🛡️</div><div class="small" style="line-height:1.6;margin-top:6px;">' + esc(gar) + '</div></div></div>';
  if (u.faq && u.faq.length) h += '<div class="sale-sec"><div class="h2">Preguntas frecuentes</div>' + u.faq.map(function (f, i) { return '<div class="faq-i" id="fq-' + k + i + '"><button class="faq-q" onclick="App.faq(\'fq-' + k + i + '\')"><span>' + esc(f.q) + '</span><span>▾</span></button><div class="faq-a">' + esc(f.a) + '</div></div>'; }).join('') + '</div>';
  if (u.cierre) h += '<div class="sale-sec"><div class="card" style="text-align:center;"><div class="h2" style="margin-bottom:8px;">' + esc(u.cierre.titulo || '') + '</div><p class="muted small" style="line-height:1.6;margin-bottom:16px;">' + esc(u.cierre.texto || '') + '</p>' + cta(u.cierre.cta) + '</div></div>';
  h += '<div class="sale-sec"><div class="warn">📧 ' + esc(u.aviso_email || 'Compra con el mismo correo con el que entras a la app. Se libera solo aquí.') + '</div></div>';
  if (!arriba) h += caja;
  return h + '</div>';
}
// Garantia do Up1: vitalícia, com reembolso à mão (Kess, 26/10). O texto vem do upsells.json; sem ele, a página não cita prazo.
function garantiaTexto(u) {
  if (u.garantia && u.garantia.indexOf('{{') < 0) return u.garantia;
  return u.garantia_sugerida || '';
}
function faq(id) { $(id).classList.toggle('on'); }
function codigo(k) {
  var v = uppNormalize($('cod-' + k).value); if (!v) return;
  $('cod-err-' + k).textContent = 'Comprobando…';
  abrirUpsellConCodigo(k, v, false).then(function (ok) { if (!ok) $('cod-err-' + k).textContent = 'Código incorrecto. Revisa el correo de tu compra.'; });
}
function linkCompra(k, sup) {
  var base = (U[k] && U[k].checkout) || C.CHECKOUT[k];
  var q = 'src=app-' + sup + '&utm_source=app_membros&utm_medium=' + encodeURIComponent(sup) + '&utm_campaign=' + C.CAMPANHA[k];
  return base + (base.indexOf('?') > -1 ? '&' : '?') + q;
}
function comprar(k, sup) {
  var u = U[k] || {};
  folha('<div class="center"><div style="font-size:40px;margin-bottom:6px;">📧</div><div class="h2" style="margin-bottom:10px;">¡Atención!</div>'
    + '<p class="muted" style="line-height:1.6;margin-bottom:8px;">Usa el mismo correo con el que entras a la app. Así ' + esc(u.nombre || 'el protocolo') + ' se abre solo, aquí.</p>'
    + '<div class="card" style="margin:12px 0 18px;font-weight:800;word-break:break-all;">' + esc(S.email || 'El mismo correo de tu compra') + '</div>'
    + '<button class="btn ' + k + '" onclick="App.irCompra(\'' + k + '\',\'' + esc(sup) + '\')">Entendido, ir a la compra →</button>'
    + '<button class="textbtn" onclick="App.fecharFolha()">Ahora no</button></div>', true);
}
function irCompra(k, sup) { fecharFolha(); window.open(linkCompra(k, sup), '_blank'); }

/* =====================================================================
 * Clara: mensagens do calendário + chat (servidor)
 * ===================================================================== */
function mensajes() { return (M.mensajes || []).slice().sort(function (a, b) { return a.dia - b.dia; }); }
function vencidos() { var h = diaHoy(); return mensajes().filter(function (m) { return m.dia <= h; }); }
function noLeidos() { return vencidos().filter(function (m) { return S.leidos.indexOf(m.dia) < 0; }).length; }
// Cartão da Clara no Início: a última mensagem do dia (ou a saudação).
function ultimoMensaje() {
  var v = vencidos(), m = v[v.length - 1];
  if (m) return String(tx(m.titulo || (m.cuerpo || [''])[0])).replace(/<[^>]+>/g, '');
  return String(saludoAgente() || 'Estoy aquí para tus dudas del desafío.').replace(/<[^>]+>/g, '');
}
function upsellParaMensaje(m) {
  var pref = m.preferencia || ['up1', 'up2'];
  for (var i = 0; i < pref.length; i++) if (!S.up[pref[i]] && m.venta && m.venta[pref[i]]) return pref[i];
  return null;
}
function renderChat() {
  var hoy = diaHoy();
  vencidos().forEach(function (m) { if (!S.msgTs[m.dia]) S.msgTs[m.dia] = Date.now(); if (S.leidos.indexOf(m.dia) < 0) S.leidos.push(m.dia); });
  guardar();
  var items = [];
  var sal = saludoAgente();
  items.push({ ts: 0, html: burbujaAgente((sal ? parrafos([sal]) : '') + (C.AUDIO_BIENVENIDA ? '<div class="bub-audio">' + audioHtml('ch') + '</div>' : '')) });
  vencidos().forEach(function (m) {
    var k = upsellParaMensaje(m);
    var body = '<div class="when">Día ' + m.dia + '</div>' + (m.titulo ? '<p><strong>' + tx(m.titulo) + '</strong></p>' : '') + parrafos((m.cuerpo || []).map(tx));
    var promD = textoDerick('promesa_mensajes', m.dia);
    if (promD) body += '<p>' + tx(esc(promD)) + '</p>';
    if (k) body += ventaHtml(m, k) + '<button class="btn sm ' + k + '" onclick="App.comprar(\'' + k + '\',\'clara_d' + m.dia + '\')">' + esc(sinFlecha((m.cta && m.cta[k]) || 'Ver ' + ((U[k] || {}).nombre || ''))) + ' →</button>';
    items.push({ ts: S.msgTs[m.dia] || m.dia, html: burbujaAgente(body) });
  });
  S.chat.forEach(function (c, i) {
    if (c.r === 'user') items.push({ ts: c.ts || i, html: '<div class="msg me"><div class="bub">' + esc(c.t).replace(/\n/g, '<br>') + '</div></div>' });
    else {
      var extra = c.oferta && !S.up[c.oferta] ? '<button class="btn sm ' + c.oferta + '" onclick="App.comprar(\'' + c.oferta + '\',\'chat\')">Ver ' + esc((U[c.oferta] || {}).nombre || '') + ' →</button>' : '';
      items.push({ ts: c.ts || i, html: burbujaAgente(parrafos(String(c.t).split(/\n{2,}/).map(function (x) { return esc(x).replace(/\n/g, '<br>'); })) + extra) });
    }
  });
  items.sort(function (a, b) { return a.ts - b.ts; });
  var chips = ['¿Cómo encuentro el músculo?', 'Me salté un día', '¿Cómo instalo la app?', 'No siento nada'];
  var A = agente();
  $('s-chat').innerHTML = '<div class="chat"><div class="chat-hd">' + fotoAgente(42) + '<div class="grow"><div class="t1">' + esc(A.nombre) + '</div><div class="t2">● En línea' + (A.rol ? ' · ' + esc(A.rol) : '') + '</div></div></div>'
    + '<div class="msgs" id="msgs">' + items.map(function (x) { return x.html; }).join('') + '<div id="typing"></div></div>'
    + '<div class="chips">' + chips.map(function (c) { return '<button class="chip" onclick="App.chip(this)">' + esc(c) + '</button>'; }).join('') + '</div></div>'
    + '<div class="composer"><textarea id="ch-in" rows="1" maxlength="600" placeholder="Escribe tu duda…"></textarea><button id="ch-b" onclick="App.enviarChat()" aria-label="Enviar"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg></button></div>';
  var ta = $('ch-in');
  ta.addEventListener('input', function () { ta.style.height = 'auto'; ta.style.height = Math.min(110, ta.scrollHeight) + 'px'; });
  ta.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); enviarChat(); } });
  renderNav();
  setTimeout(function () { window.scrollTo(0, document.body.scrollHeight); }, 30);
}
// A Clara, assistente virtual de IA (CONFIG.AGENTE): o nome mora só lá. Fala no chat, nas mensagens dos dias e no áudio.
function agente() { var A = C.AGENTE || {}; return { nombre: A.nombre || 'Clara', rol: A.rol || '', avatar: A.avatar || '', saludo: A.saludo || '' }; }
function fotoAgente(px) {
  var A = agente();
  return '<div class="ag-ph" style="width:' + px + 'px;height:' + px + 'px;font-size:' + Math.round(px * 0.4) + 'px;">' + (A.avatar ? '<img src="' + esc(A.avatar) + '" alt="">' : esc(A.nombre.charAt(0).toUpperCase())) + '<i class="on-dot"></i></div>';
}
// Venda da mensagem do dia. Com áudio em CONFIG.AUDIO_VENTA (Kess, 27/10), o parágrafo vira o áudio da Clara e fica escrita só a
// frase do e-mail, que é de cada comprador; sem áudio, o parágrafo como antes.
function ventaHtml(m, k) {
  var t = m.venta[k], au = ((C.AUDIO_VENTA || {})[k] || {})[m.dia];
  if (!au) return '<p>' + tx(t) + '</p>';
  var i = t.indexOf('Usa al pagar');
  return '<div class="bub-audio">' + audioHtml(k + 'd' + m.dia, au.src, au.seg) + '</div>'
    + (i >= 0 ? '<p class="small muted" style="margin-top:10px;">' + tx(t.slice(i)) + '</p>' : '');
}
function burbujaAgente(inner) {
  var A = agente();
  return '<div class="msg sys"><div class="ph ag">' + (A.avatar ? '<img src="' + esc(A.avatar) + '" alt="">' : esc(A.nombre.charAt(0).toUpperCase())) + '</div><div class="bub">' + inner + '</div></div>';
}
function saludoAgente() {
  var A = agente(); if (!A.saludo) return '';
  var t = primerNombre() ? A.saludo : A.saludo.replace(/,?\s*\{nombre\}/g, '');
  return fmt(esc(t), { nombre: esc(primerNombre()), agente: esc(A.nombre) });
}
// Player de áudio da Clara (boas-vindas e venda das mensagens), no formato de áudio enviado no chat (Kess, 27/10, com o print da Maya do Gui): play grande, barra
// com a bolinha, tempo corrido à esquerda e total à direita; tocar na barra pula para o ponto. k = sufixo dos ids (o áudio aparece
// antes do cadastro, no chat, no Perfil e na venda dos dias); src e seg vazios = o áudio de boas-vindas.
var ICO_PLAY = '<svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M7 4v16l13-8z"/></svg>';
var ICO_PAUSA = '<svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';
function audioHtml(k, src, seg) {
  k = k || 'ch';
  seg = seg || C.AUDIO_BIENVENIDA_SEG || 51;
  return '<div class="audio-b"><button class="play" id="au-b-' + k + '" onclick="App.audioPlay(\'' + k + '\')" aria-label="Escuchar">' + ICO_PLAY + '</button>'
    + '<div class="ab-mid"><div class="track" onclick="App.audioIr(event,\'' + k + '\')"><i id="au-t-' + k + '"></i><b id="au-k-' + k + '"></b></div>'
    + '<div class="ab-tm"><span id="au-tm-' + k + '">0:00</span><span>' + mmss(seg) + '</span></div></div></div>'
    + '<audio id="au-' + k + '" preload="none" data-seg="' + seg + '" src="' + esc(src || C.AUDIO_BIENVENIDA) + '"></audio>';
}
function audioPlay(k) {
  k = k || 'ch';
  var a = $('au-' + k); if (!a) return;
  if (!a.paused) { a.pause(); return; }
  document.querySelectorAll('audio').forEach(function (x) { if (x !== a) x.pause(); });
  a.ontimeupdate = function () {
    var p = Math.min(100, a.currentTime / (a.duration || +a.getAttribute('data-seg') || 51) * 100), t = $('au-t-' + k), kn = $('au-k-' + k), tm = $('au-tm-' + k);
    if (t) t.style.width = p + '%'; if (kn) kn.style.left = p + '%'; if (tm) tm.textContent = mmss(a.currentTime);
  };
  a.onplay = function () { var b = $('au-b-' + k); if (b) b.innerHTML = ICO_PAUSA; };
  a.onpause = a.onended = function () { var b = $('au-b-' + k); if (b) b.innerHTML = ICO_PLAY; };
  a.play();
}
function audioIr(ev, k) {
  var a = $('au-' + k), tr = ev.currentTarget; if (!a || !tr) return;
  var r = tr.getBoundingClientRect(), p = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
  var ir = function () { a.currentTime = p * (a.duration || +a.getAttribute('data-seg') || 51); };
  if (a.readyState >= 1) ir(); else a.addEventListener('loadedmetadata', ir, { once: true });
  if (a.paused) audioPlay(k);
}
function verAudio() {
  leitor('Audio de bienvenida', '<div class="bienv" style="margin-top:20px;">' + fotoAgente(88) + '<div class="bienv-n" style="margin-bottom:14px;">' + esc(agente().nombre) + '</div>' + audioHtml('pf') + '</div>');
}
function chip(b) { $('ch-in').value = b.textContent; enviarChat(); }
var _enviando = false;
function contexto() {
  var hoy = diaHoy(), sig = siguiente();
  return { nombre: primerNombre(), dia_actual: hoy, proximo_dia: sig, fase: faseDeDia(sig || hoy).nombre, dias_completados: Object.keys(S.completados).map(Number).sort(function (a, b) { return a - b; }),
    racha: racha(), tiene_up1: !!S.up.up1, tiene_up2: !!S.up.up2, instalada: esStandalone(),
    cadastro: { edad: S.perfil.edad || '', tiempo: S.perfil.tiempo || '', objetivo: S.perfil.objetivo || '', horario: S.perfil.horario || '' } };
}
function enviarChat() {
  if (_enviando) return;
  var ta = $('ch-in'), t = String(ta.value || '').trim();
  if (!t) return;
  ta.value = ''; ta.style.height = 'auto';
  S.chat.push({ r: 'user', t: t.slice(0, 600), ts: Date.now() }); guardar();
  _enviando = true;
  renderChat();
  $('typing').innerHTML = burbujaAgente('<span class="typing"><i></i><i></i><i></i></span>');
  window.scrollTo(0, document.body.scrollHeight);
  var hist = S.chat.slice(-12).map(function (c) { return { r: c.r, t: c.t }; });
  var t0 = Date.now();
  api(C.API.chat, { mensajes: hist, contexto: contexto() }, 40000).then(function (r) {
    var texto = r && r.texto ? r.texto : null;
    if (!texto) texto = 'Ahora mismo no puedo responderte por aquí. Escríbeme a ' + C.SOPORTE_EMAIL + ' y te ayudamos paso a paso.';
    // um mínimo de "digitando" para não parecer robótico
    var espera = Math.max(0, 1600 - (Date.now() - t0));
    setTimeout(function () {
      S.chat.push({ r: 'assistant', t: texto, oferta: r && r.oferta ? r.oferta : null, ts: Date.now() });
      if (S.chat.length > 80) S.chat = S.chat.slice(-80);
      guardar(); _enviando = false;
      if (TAB === 'chat') renderChat();
    }, espera);
  }).catch(function () {
    S.chat.push({ r: 'assistant', t: 'Se cortó la conexión. Inténtalo de nuevo en un momento.', ts: Date.now() });
    guardar(); _enviando = false; if (TAB === 'chat') renderChat();
  });
}

/* =====================================================================
 * Perfil, ajuda, pesquisa
 * ===================================================================== */
function renderPerfil() {
  var ps = pasosCadastro().filter(function (p) { return p.id !== 'nombre'; });
  var h = '<div class="brief-top" style="padding:16px 18px 0;"><button class="xbtn" onclick="App.tab(\'inicio\')">‹</button></div>'
    + '<div class="pf-head"><div class="avatar">' + esc(iniciales(S.nombre)) + '</div><div class="h2">' + esc(S.nombre || '') + '</div><div class="small muted">' + esc(S.email || '') + '</div></div>'
    + '<div class="pad"><div class="card"><div class="kv"><span>Día de hoy</span><span>' + diaHoy() + ' de 21</span></div><div class="kv"><span>Días hechos</span><span>' + totalHechos() + '</span></div>'
    + ps.map(function (p) { return '<div class="kv"><span>' + esc(p.titulo || p.id) + '</span><span>' + esc(S.perfil[p.id] || '—') + '</span></div>'; }).join('')
    + '<div class="kv" style="border:0;"><span>Acceso</span><span>' + ({ verificado: 'Verificado', manual: 'En revisión', suave: 'Activo', legado: 'Activo' }[S.acceso.modo] || 'Activo') + '</span></div></div></div>'
    + '<div class="sec-title"><span class="kicker">Opciones</span></div><div class="list">'
    + '<button class="li" onclick="App.irADia()"><div class="em">↻</div><div class="grow"><div class="tt">Ir a día</div><div class="ds">Recupera tu avance si cambiaste de celular</div></div><span class="chev">›</span></button>'
    + (esStandalone() ? '' : '<button class="li" onclick="App.instalar()"><div class="em">📲</div><div class="grow"><div class="tt">Instalar la app</div><div class="ds">El ícono en tu pantalla de inicio</div></div><span class="chev">›</span></button>')
    + '<button class="li" onclick="App.editarCadastro()"><div class="em">✏️</div><div class="grow"><div class="tt">Mis respuestas</div><div class="ds">Nombre, edad, objetivo y horario</div></div><span class="chev">›</span></button>'
    + '<button class="li" onclick="App.sonido();App.tab(\'perfil\')"><div class="em">' + (S.sonido ? '🔊' : '🔇') + '</div><div class="grow"><div class="tt">Sonido de la sesión</div><div class="ds">' + (S.sonido ? 'Activado' : 'Desactivado') + ' (la vibración sigue)</div></div></button>'
    + (preguntasEncuesta().length ? '<button class="li" onclick="App.encuesta()"><div class="em">📝</div><div class="grow"><div class="tt">Tu cuestionario</div><div class="ds">Unas preguntas para ' + esc(agente().nombre) + ', menos de 1 minuto</div></div><span class="chev">›</span></button>' : '')
    + (C.AUDIO_BIENVENIDA ? '<button class="li" onclick="App.verAudio()"><div class="em">🎧</div><div class="grow"><div class="tt">Audio de bienvenida</div><div class="ds">' + esc(agente().nombre) + ' te explica el desafío</div></div><span class="chev">›</span></button>' : '')
    + '<button class="li" onclick="App.ayuda()"><div class="em">❓</div><div class="grow"><div class="tt">Ayuda</div><div class="ds">Preguntas frecuentes y contacto</div></div><span class="chev">›</span></button>'
    + '</div><div class="foot">Desafío 21 Días · v' + esc(C.VERSION || '2') + '</div>';
  $('s-perfil').innerHTML = h;
}
function editarCadastro() { CAD.paso = 0; S.cadastroOk = true; renderCadastro(); mostrar('cadastro'); CAD.editar = true; }
function ayuda() {
  folha('<div class="sheet-hd"><div class="grow">Ayuda</div><button class="xbtn" onclick="App.fecharFolha()">×</button></div>'
    + (C.FAQS || []).map(function (f, i) { return '<div class="faq-i" id="fa' + i + '"><button class="faq-q" onclick="App.faq(\'fa' + i + '\')"><span>' + esc(f.q) + '</span><span>▾</span></button><div class="faq-a">' + esc(f.a) + '</div></div>'; }).join('')
    + '<div style="height:10px"></div><button class="btn" onclick="App.fecharFolha();App.tab(\'chat\')">💬 Escribe tu duda en el chat</button>'
    + '<a class="btn ghost" style="margin-top:10px;text-decoration:none;" href="mailto:' + esc(C.SOPORTE_EMAIL) + '?subject=' + encodeURIComponent('Ayuda · Desafío 21 Días') + '">✉️ Escribir al soporte</a>');
}
var ENC = {};
// Questionário para quem entrou antes de ele voltar ao cadastro (ou pelo Perfil). Mesmas perguntas e colunas.
function preguntasEncuesta() {
  var Q = C.CUESTIONARIO || {}, out = [];
  if (Q.molesta && !S.perfil.molesta) out.push(Q.molesta);
  (Q.extra || []).forEach(function (q) { if (!S.perfil[q.id]) out.push(q); });
  return out;
}
function encuesta(entrada) {
  var qs = preguntasEncuesta();
  if (!qs.length) { S.encuesta = true; guardar(); return; }
  folha('<div class="sheet-hd"><div class="grow">' + (entrada ? 'Unas preguntas para ' + esc(agente().nombre) : 'Tu cuestionario') + '</div><button class="xbtn" onclick="App.fecharFolha()">×</button></div>'
    + '<p class="small muted" style="margin-bottom:16px;line-height:1.6;">Toca una respuesta en cada una. Te toma menos de un minuto y queda solo entre nosotros.</p>'
    + qs.map(function (q) { return '<div style="margin-bottom:16px;"><div class="small" style="font-weight:700;margin-bottom:8px;">' + esc(q.pregunta) + '</div><div class="opts" style="margin-top:0;gap:7px;">'
      + q.opciones.map(function (o) { return '<button class="opt' + (ENC[q.id] === o ? ' sel' : '') + '" style="padding:12px 14px;font-size:14px;" onclick="App.encElegir(\'' + q.id + '\',this)" data-v="' + esc(o) + '"><span>' + esc(o) + '</span><span class="dot"></span></button>'; }).join('') + '</div></div>'; }).join('')
    + '<div class="err-msg" id="enc-err"></div><button class="btn" onclick="App.encEnviar()">ENVIAR</button>');
}
function encElegir(id, b) { ENC[id] = b.getAttribute('data-v'); b.parentNode.querySelectorAll('.opt').forEach(function (x) { x.classList.toggle('sel', x === b); }); }
function encEnviar() {
  var qs = preguntasEncuesta(), falta = qs.filter(function (q) { return !ENC[q.id]; });
  if (falta.length) { $('enc-err').textContent = 'Te falta responder ' + falta.length + (falta.length > 1 ? ' preguntas.' : ' pregunta.'); return; }
  qs.forEach(function (q) { S.perfil[q.id] = ENC[q.id]; });
  if (S.perfil.molesta && !S.perfil.objetivo) S.perfil.objetivo = S.perfil.molesta;
  S.cadastroEnviado = false; guardar();
  enviarCadastro();
  $('sheet').innerHTML = '<div class="center" style="padding:16px 0;"><div style="font-size:42px;">🙏</div><div class="h3" style="margin:8px 0 16px;">¡Gracias! Ya está guardado.</div><button class="btn" onclick="App.fecharFolha();App.tab(\'inicio\')">Listo</button></div>';
}
function sonido() { S.sonido = !S.sonido; guardar(); if (PL) { var b = document.querySelector('.pl-hd .round'); if (b) b.textContent = S.sonido ? '🔊' : '🔇'; } }

/* =====================================================================
 * Push no celular (Web Push com VAPID, sem Firebase; base: FellasApp, liberado pelo Kess em 13/10)
 * O MOBPAY guarda a inscrição, faz o calendário e manda no máximo 1 aviso por dia.
 * No iPhone, só com o app na tela inicial (iOS 16.4+).
 * ===================================================================== */
function pushSoportado() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && location.protocol === 'https:'; }
function pushDisponible() { return !!(baseMobpay() && S.acceso.sessao); }
function plataforma() { return esIOS() ? 'ios' : /android/i.test(navigator.userAgent) ? 'android' : 'desktop'; }
function b64aBytes(b) { var pad = '='.repeat((4 - b.length % 4) % 4), raw = atob((b + pad).replace(/-/g, '+').replace(/_/g, '/')); var u = new Uint8Array(raw.length); for (var i = 0; i < raw.length; i++) u[i] = raw.charCodeAt(i); return u; }
function pushEstado() {
  if (esIOS() && !esStandalone()) return 'ios-instalar';
  if (!pushSoportado()) return 'no';
  if (Notification.permission === 'denied') return 'bloqueado';
  return S.push && S.push.on && Notification.permission === 'granted' ? 'on' : 'off';
}
// Pede a permissão PRIMEIRO, colado no toque (exigência do iOS), e só depois busca a chave e inscreve.
function pushActivar() {
  if (!pushSoportado() || !pushDisponible()) return Promise.resolve('no');
  return Notification.requestPermission().then(function (perm) {
    if (perm !== 'granted') { S.push = Object.assign(S.push || {}, { on: false, negado: perm === 'denied' }); guardar(); return perm === 'denied' ? 'bloqueado' : 'off'; }
    return navigator.serviceWorker.ready.then(function (reg) {
      return pedido('GET', 'push', null, null, 8000).then(function (k) {
        if (!k || !k.chave) throw new Error('sin-chave');
        return reg.pushManager.getSubscription().then(function (sub) {
          return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64aBytes(k.chave) });
        });
      });
    }).then(function (sub) {
      var j = sub.toJSON(), fuso = '';
      try { fuso = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
      return pedido('POST', 'push', { endpoint: sub.endpoint, keys: j.keys, fuso: fuso, plataforma: plataforma() }, S.acceso.sessao, 10000).then(function (r) {
        if (r._status >= 300) throw new Error('mobpay ' + r._status);
        S.push = { on: true, em: Date.now() }; guardar(); renderNavPush();
        return 'on';
      });
    }).catch(function () { return 'erro'; });
  });
}
function pushDesactivar() {
  if (!pushSoportado()) return Promise.resolve();
  return navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
    if (!sub) return;
    return pedido('DELETE', 'push', { endpoint: sub.endpoint }, S.acceso.sessao, 8000).catch(function () {}).then(function () { return sub.unsubscribe(); });
  }).then(function () { S.push = { on: false, apagado: Date.now() }; guardar(); renderNavPush(); });
}
// Quando pedir: depois de uma sessão cumprida (o pico), no máximo 3 vezes, com 72 h entre elas.
function pushPuedePedir() {
  if (!pushDisponible() || pushEstado() !== 'off') return false;
  var pd = S.pushPedidos || [];
  return pd.length < 3 && (!pd.length || Date.now() - pd[pd.length - 1] > 72 * 3600000);
}
function pedirPush(origen) {
  var PP = M.push || {};
  var est = pushEstado();
  if (est === 'ios-instalar') { instalar('push'); return; }
  if (origen !== 'sino') { S.pushPedidos = (S.pushPedidos || []).concat([Date.now()]); guardar(); }
  var h = '<div class="sheet-hd">' + fotoAgente(42) + '<div class="grow">' + tx(PP.titulo || '¿Te aviso cuando tu día esté listo?') + '</div><button class="xbtn" onclick="App.fecharFolha()">×</button></div>';
  if (est === 'bloqueado') {
    h += '<p class="muted" style="line-height:1.6;margin-bottom:16px;">' + esc(PP.bloqueado || 'Los avisos están bloqueados en este navegador. Puedes activarlos en los ajustes del sitio, en el candado junto a la dirección.') + '</p><button class="btn ghost" onclick="App.fecharFolha()">Entendido</button>';
  } else {
    h += '<p class="muted" style="line-height:1.6;">' + tx(PP.texto || 'Te mando un aviso corto cuando se abre tu sesión del día, con los mensajes de ' + agente().nombre + ' para tu camino.') + '</p>'
      + '<div class="bullets">' + (PP.garantias || ['Te aviso cuando se abre tu día', 'Mensajes de ' + agente().nombre + ' para tu camino', 'Máximo 1 aviso por día. Cero spam.']).map(function (g) { return '<div>' + esc(g) + '</div>'; }).join('') + '</div>'
      + '<button class="btn" id="push-b" onclick="App.pushSi()">🔔 ' + esc(PP.boton || 'Activar avisos') + '</button>'
      + '<button class="textbtn" onclick="App.fecharFolha()">' + esc(PP.despues || 'Ahora no') + '</button>';
  }
  folha(h);
}
function pushSi() {
  var b = $('push-b'); if (b) { b.disabled = true; b.textContent = 'Activando…'; }
  pushActivar().then(function (r) {
    if (r === 'on') { $('sheet').innerHTML = '<div class="center" style="padding:14px 0;"><div style="font-size:44px;">🔔</div><div class="h3" style="margin:8px 0 6px;">¡Listo! Te aviso cuando tu día esté listo.</div><p class="small muted" style="margin-bottom:16px;">Máximo 1 aviso por día.</p><button class="btn" onclick="App.fecharFolha()">Seguir</button></div>'; }
    else if (r === 'bloqueado' || r === 'off') fecharFolha();
    else { if (b) { b.disabled = false; b.textContent = '🔔 Intentar de nuevo'; } }
  });
}
function sino() {
  var est = pushEstado();
  if (est === 'on') {
    folha('<div class="center"><div style="font-size:40px;">🔔</div><div class="h3" style="margin:8px 0 6px;">Avisos activados</div><p class="small muted" style="line-height:1.6;margin-bottom:16px;">Te aviso cuando se abre tu día. Máximo 1 aviso por día.</p>'
      + '<button class="btn ghost" onclick="App.fecharFolha()">Dejarlos activados</button><button class="textbtn" onclick="App.fecharFolha();App.pushNo()">Desactivar avisos</button></div>', true);
    return;
  }
  pedirPush('sino');
}
function renderNavPush() { if (TAB === 'inicio' && $('s-inicio').classList.contains('on')) renderInicio(); }
function botonSino() {
  if (!pushDisponible() || pushEstado() === 'no') return '';
  var on = pushEstado() === 'on';
  return '<button class="icon-btn" onclick="App.sino()" aria-label="Avisos"><svg viewBox="0 0 24 24" fill="' + (on ? '#fff' : 'none') + '" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>' + (on ? '' : '<i class="pulse"></i>') + '</button>';
}

/* =====================================================================
 * Quem entra de novo no meio do desafio (outro celular, outro navegador ou o app recém-instalado no iPhone)
 * ===================================================================== */
function recuperarSiHace() {
  if (S.recuperarVisto || totalHechos() || diaHoy() < 2) return false;
  S.recuperarVisto = true; guardar();
  var n = diaHoy();
  folha('<div class="sheet-hd"><div class="grow">Hoy es tu Día ' + n + '</div><button class="xbtn" onclick="App.fecharFolha()">×</button></div>'
    + '<p class="muted" style="line-height:1.6;margin-bottom:16px;">¿Ya hiciste días del desafío en otro celular o en otro navegador? Marca dónde estabas y sigues desde ahí.</p>'
    + '<button class="btn" onclick="App.fecharFolha();App.irADia()">Sí, marcar mis días</button>'
    + '<button class="textbtn" onclick="App.fecharFolha()">No, empiezo por el Día 1</button>', true);
  return true;
}

/* =====================================================================
 * Instalar na tela inicial (PWA)
 * ===================================================================== */
var _bip = null;
window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); _bip = e; });
function esStandalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true; }
function esIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
function navegadorInterno() { return /FBAN|FBAV|FB_IAB|Instagram|Line\/|GSA\/|; wv\)|WhatsApp|Snapchat|TikTok|musical_ly|Bytedance/i.test(navigator.userAgent); }
function instalar(origen) {
  var I = M.instalar || {}, cfg = (origen === 'dia1' ? I.pos_dia1 : origen === 'push' ? { titulo: 'Primero, agrega la app a tu pantalla', texto: 'En iPhone, los avisos solo llegan con la app en tu pantalla de inicio. Agrégala y actívalos desde ahí, con un toque en la campanita.' } : I.entrada) || {};
  var h = '<div class="sheet-hd">' + fotoAgente(42) + '<div class="grow">' + tx(cfg.titulo || 'Instala tu app') + '</div><button class="xbtn" onclick="App.fecharFolha()">×</button></div>';
  h += '<p class="muted" style="line-height:1.6;">' + tx(cfg.texto || 'Deja el ícono en tu pantalla de inicio y entra directo a tu día.') + '</p>';
  if (cfg.garantias && cfg.garantias.length) h += '<div class="bullets">' + cfg.garantias.map(function (g) { return '<div>' + esc(g) + '</div>'; }).join('') + '</div>';
  if (navegadorInterno()) {
    var NI = I.navegador_interno || {};
    h += '<div class="warn" style="margin-top:14px;"><strong>' + esc(NI.titulo || 'Ábrela en tu navegador') + '</strong><br>' + esc(NI.texto || 'Estás dentro de otra app. Copia el enlace y pégalo en ' + (esIOS() ? 'Safari' : 'Chrome') + ' para poder instalarla.') + '</div>'
      + '<button class="btn" onclick="App.copiarLink(this)">' + esc(NI.boton_copiar || 'Copiar enlace') + '</button>';
  } else if (esIOS()) {
    var pasos = I.ios_pasos && I.ios_pasos.length ? I.ios_pasos : ['Abre esta página en Safari o en Chrome.', 'Toca el botón Compartir, abajo.', 'Elige "Agregar a inicio".', 'Toca "Agregar". ¡Listo!'];
    var icons = ['<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6" stroke-opacity="0"/><path d="M12 7v10M7 12h10" stroke-opacity="0"/><path d="m14.5 9.5-5 2 2 2z" fill="currentColor"/></svg>',
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3m0 0L8 7m4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>',
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>',
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L20 7"/></svg>'];
    h += '<div class="ios-steps">' + pasos.map(function (p, i) { return '<div class="ios-step"><b class="n">' + (i + 1) + '</b><span class="grow">' + esc(p) + '</span>' + (icons[i] || '') + '</div>'; }).join('') + '</div>'
      + '<button class="btn" onclick="App.fecharFolha()">Entendido, ya lo hago</button>';
  } else if (_bip) {
    h += '<div style="height:16px"></div><button class="btn" onclick="App.instalarYa()">' + esc(cfg.boton || 'INSTALAR APP') + '</button>';
  } else {
    var pa = I.android_pasos && I.android_pasos.length ? I.android_pasos : ['Abre esta página en Chrome.', 'Toca el menú ⋮ arriba a la derecha.', 'Elige "Instalar app" o "Agregar a pantalla principal".'];
    h += '<div class="ios-steps">' + pa.map(function (p, i) { return '<div class="ios-step"><b class="n">' + (i + 1) + '</b><span class="grow">' + esc(p) + '</span></div>'; }).join('') + '</div><button class="btn" onclick="App.fecharFolha()">Entendido, ya lo hago</button>';
  }
  h += '<button class="textbtn" onclick="App.fecharFolha()">' + esc(cfg.despues || 'Ahora no') + '</button>';
  folha(h);
}
function instalarYa() { if (!_bip) return; _bip.prompt(); _bip.userChoice.then(function () { _bip = null; fecharFolha(); }); }
function copiarLink(b) {
  var url = C.APP_URL || location.origin;
  if (!EN_PROD) url = location.origin;
  var ok = function () { b.textContent = '✓ Enlace copiado'; };
  try { navigator.clipboard.writeText(url).then(ok, function () { prompt('Copia este enlace:', url); }); } catch (e) { prompt('Copia este enlace:', url); }
}

/* =====================================================================
 * Oferta de cierre (dias 15 e 20) com prazo real
 * ===================================================================== */
function ofertaActiva() {
  var O = C.OFERTA_CIERRE || {};
  var demo = DEMO.indexOf('oferta') > -1;
  if (!demo && (!O.activo || !O.link)) return null;
  if (O.upsell && (S.up[O.upsell] || (S.upCompra && S.upCompra[O.upsell])) && !demo) return null;
  var dia = diaHoy();
  var d = (O.dias || [15, 20]).filter(function (x) { return x === dia; })[0] || (demo ? 15 : null);
  if (!d) return null;
  var reg = S.oferta[d];
  if (reg && reg.vence && Date.now() > reg.vence) return null;
  return { dia: d, O: O, reg: reg };
}
function ofertaCheck() {
  var a = ofertaActiva(); if (!a) return;
  if (!a.reg) { S.oferta[a.dia] = { vence: Date.now() + (a.O.horas || 24) * 3600000 }; guardar(); abrirOferta(); }
  pildoraOferta();
}
var _pillT = null;
function pildoraOferta() {
  var el = $('oferta-pill'); if (!el) return;
  var a = S && ofertaActiva();
  clearInterval(_pillT);
  if (!a || !a.reg || !$('nav') || $('nav').classList.contains('hidden') || TAB === 'chat') { el.classList.add('hidden'); return; }
  var X = (U.oferta_cierre || {});
  var pinta = function () { var r = Math.max(0, a.reg.vence - Date.now()); if (!r) { el.classList.add('hidden'); clearInterval(_pillT); return; }
    var reloj = Math.floor(r / 3600000) + ':' + pad2(Math.floor(r / 60000) % 60) + ':' + pad2(Math.floor(r / 1000) % 60);
    var base = String(X.pildora || 'Tu oferta vence en {{RELOJ}}');
    el.innerHTML = '⏱ ' + esc(base.indexOf('{{RELOJ}}') > -1 ? base.replace('{{RELOJ}}', reloj) : base + ' ' + reloj); };
  pinta(); el.classList.remove('hidden');
  _pillT = setInterval(pinta, 1000);
}
function abrirOferta() {
  var a = ofertaActiva(); if (!a) return;
  var X = U.oferta_cierre || {}, O = a.O;
  var v = { PRODUCTO: O.producto || '[producto a definir]', PRECIO: O.precio || '[precio a definir]', PRECIO_ANTES: O.precio_antes || '' };
  var r = function (s) { return String(s || '').replace(/\{\{(\w+)\}\}/g, function (m, k) { return v[k] != null ? v[k] : m; }); };
  var comp = (O.upsell && X.comparativo_variantes && X.comparativo_variantes[O.upsell]) || X.comparativo || {};
  var link = O.link ? O.link + (O.link.indexOf('?') > -1 ? '&' : '?') + 'src=app-oferta_d' + a.dia + '&utm_source=app_membros&utm_medium=oferta_d' + a.dia + '&utm_campaign=' + (C.CAMPANHA[O.upsell] || 'oferta') : '';
  folha('<div class="sheet-hd"><div class="grow">' + esc(r(X.titulo) || 'Oferta') + '</div><button class="xbtn" onclick="App.fecharFolha()">×</button></div>'
    + '<p class="muted" style="line-height:1.6;margin-bottom:14px;">' + esc(r(X.subtitulo)) + '</p>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;"><div class="card" style="padding:12px;"><div class="kicker" style="color:var(--red);margin-bottom:6px;">Sin</div>' + (comp.sin || []).map(function (t) { return '<div class="tiny" style="margin-bottom:5px;line-height:1.4;">✕ ' + esc(r(t)) + '</div>'; }).join('') + '</div>'
    + '<div class="card" style="padding:12px;margin:0;"><div class="kicker" style="color:var(--green);margin-bottom:6px;">Con</div>' + (comp.con || []).map(function (t) { return '<div class="tiny" style="margin-bottom:5px;line-height:1.4;">✓ ' + esc(r(t)) + '</div>'; }).join('') + '</div></div>'
    + escasezHtml('oferta')
    + '<div class="price" style="margin-bottom:14px;">' + (v.PRECIO_ANTES ? '<div class="small muted" style="text-decoration:line-through;">' + esc(v.PRECIO_ANTES) + '</div>' : '') + '<div class="p">' + esc(v.PRECIO) + '</div><div class="small" style="color:var(--amber);font-weight:800;" id="of-reloj"></div></div>'
    + '<p class="tiny muted center" style="margin-bottom:10px;">📧 ' + esc(X.aviso_email || 'Compra con el mismo correo con el que entras a la app.') + '</p>'
    + (link ? '<a class="btn up1" style="text-decoration:none;" target="_blank" href="' + esc(link) + '">' + esc(r(X.cta) || 'LO QUIERO') + '</a>' : '<button class="btn" disabled>' + esc(r(X.cta) || 'LO QUIERO') + ' (link a definir)</button>')
    + '<button class="textbtn" onclick="App.fecharFolha()">' + esc(X.despues || 'Ahora no') + '</button>', true);
  var reloj = function () { var e = $('of-reloj'); if (!e || !a.reg) return; var rr = Math.max(0, a.reg.vence - Date.now()); e.textContent = 'Vence en ' + Math.floor(rr / 3600000) + ':' + pad2(Math.floor(rr / 60000) % 60) + ':' + pad2(Math.floor(rr / 1000) % 60); };
  a.reg = S.oferta[a.dia]; reloj(); var it = setInterval(function () { if (!$('of-reloj')) clearInterval(it); else reloj(); }, 1000);
}

/* =====================================================================
 * Inicialização
 * ===================================================================== */
// Link direto (push e e-mail): ?ir=chat|up1|up2|dia|oferta (o ?ir=mariana antigo cai no chat)
function irA() {
  var m = /[?&]ir=([a-z0-9]+)/.exec(location.search);
  if (!m || !logado() || !S.cadastroOk) return;
  try { history.replaceState(null, '', location.pathname); } catch (e) {}
  var d = m[1];
  setTimeout(function () {
    if (d === 'chat' || d === 'mariana' || d === 'up1' || d === 'up2') tab(d);
    else if (d === 'dia') abrirDia(siguiente() || diaHoy());
    else if (d === 'oferta') { ofertaCheck(); abrirOferta(); }
  }, 300);
}
function avisoUpsell() {
  var k = S.avisoUp; if (!k) return;
  S.avisoUp = null; guardar();
  setTimeout(function () { if (!$('ov').classList.contains('on')) bienvenidaUp(k); else toast(agente().nombre, '✓ ' + esc((U[k] || {}).nombre || '') + ' ya está en tu app', function () { tab(k); }); }, 900);
}
/* Aviso de novidade: UMA vez por versão (CONFIG.NOVEDAD), na 1ª abertura depois do deploy. Marcado no aparelho e na
 * memória do servidor (não repete em outro aparelho). Quem é novo não vê: ao terminar o cadastro, a versão já conta como vista. */
function novedadCfg() { var N = C.NOVEDAD || {}; return N.version ? N : null; }
function novedadPendiente() {
  var N = novedadCfg();
  return !!(N && N.activo && (N.titulo || N.texto) && logado() && S.cadastroOk && (S.novedad || '') < N.version);
}
function novedadVistaPorNuevo() { var N = novedadCfg(); if (N && (S.novedad || '') < N.version) S.novedad = N.version; }
function mostrarNovedad() {
  var N = novedadCfg(); if (!N) return;
  S.novedad = N.version; guardar();
  folha('<div class="center"><div style="font-size:42px;margin-bottom:8px;">✨</div>'
    + (N.titulo ? '<div class="h2" style="margin-bottom:10px;">' + esc(N.titulo) + '</div>' : '')
    + (N.texto ? '<p class="muted" style="line-height:1.6;margin-bottom:18px;">' + esc(N.texto) + '</p>' : '')
    + '<button class="btn" onclick="App.fecharFolha()">' + esc(N.boton || 'Entendido') + '</button></div>', true);
}
/* Up1 para quem pagou o front sem cartão (Kess, 26/10): o funil de 1 clique da Hotmart só leva cartão, então quem
 * pagou com Mercado Pago, Nequi, Yape ou transferência nunca viu o Up1. Sobe uma vez, depois do questionário, com o
 * texto do Derick AI (upsells.json → oferta_sin_tarjeta); o botão abre a aba do Up1. ?demo=sintarjeta mostra sempre. */
function sinTarjetaPendiente() {
  var X = U.oferta_sin_tarjeta;
  if (!X || !logado() || !S.cadastroOk) return false;
  if (DEMO.indexOf('sintarjeta') > -1) return true;
  return !!(C.OFERTA_SIN_TARJETA && S.sinTarjeta && !S.ofSinTarjeta && !S.up.up1 && !(S.upCompra && S.upCompra.up1));
}
function ofertaSinTarjeta() {
  var X = U.oferta_sin_tarjeta || {};
  S.ofSinTarjeta = true; guardar();
  folha('<div class="center"><div class="kicker" style="color:var(--up1);margin-bottom:8px;">' + esc(X.kicker || '') + '</div>'
    + '<div class="h2" style="margin-bottom:10px;">' + esc(X.titulo || '') + '</div>'
    + '<p class="muted" style="line-height:1.6;margin-bottom:18px;">' + esc(X.texto || '') + '</p>'
    + '<button class="btn up1" onclick="App.fecharFolha();App.tab(\'up1\')">' + esc(X.cta || 'Ver') + '</button>'
    + '<button class="textbtn" onclick="App.fecharFolha()">' + esc(X.despues || 'Ahora no') + '</button></div>', true);
}
function despuesDeEntrar() {
  avisoUpsell();
  revalidar();
  // Espera a memória do servidor (no máximo 3 s): o aviso de novidade visto em outro aparelho não repete,
  // e quem recuperou o progresso não vê o "¿Ya hiciste días…?".
  memListo(3000).then(function () {
    if (novedadPendiente()) { setTimeout(function () { if (!$('ov').classList.contains('on') && !PL && novedadPendiente()) mostrarNovedad(); }, 700); }
    // 1ª entrada: pedido de instalar 2 s depois; nas outras, o aviso da Clara se houver mensagem nova.
    else if (recuperarSiHace()) { /* a folha de recuperar vem primeiro; o convite de instalar fica para a próxima abertura */ }
    else if (!S.encuesta && S.cadastroOk) { setTimeout(function () { if (!$('ov').classList.contains('on')) encuesta(true); }, 1500); }
    else if (sinTarjetaPendiente()) { setTimeout(function () { if (!$('ov').classList.contains('on') && !PL && sinTarjetaPendiente()) ofertaSinTarjeta(); }, 1500); }
    else if (!esStandalone() && !S.inst.entrada) { setTimeout(function () { if (TAB === 'inicio' && !$('ov').classList.contains('on')) { S.inst.entrada = true; guardar(); instalar('entrada'); } }, 2000); }
    else if (noLeidos()) setTimeout(function () { toast(agente().nombre, '💬 Te dejó un mensaje 👇', function () { tab('chat'); }); }, 1500);
    setTimeout(function () { if (!$('ov').classList.contains('on') && !PL) ofertaCheck(); }, 9000);
  });
}
function boot() {
  cargar();
  cargarUpsellsGuardados().then(function () { if (['up1', 'up2'].indexOf(TAB) > -1) renderUp(TAB); renderNav(); });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
  if (DEMO.indexOf('reset') > -1) { localStorage.removeItem(KEY); localStorage.removeItem(OLD_KEY); location.replace(location.pathname); return; }
  // Já logado neste aparelho: abre com o que está aqui e junta com a memória do servidor em segundo plano.
  if (logado()) { MEM.listo = memSync(4000); MEM.listo.then(function (mudou) { if (mudou) memRedesenhar(); }); }
  entrarConToken().then(function () {
    seguirFlujo();
    irA();
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && S.email && TAB === 'inicio' && !PL) renderInicio();
    // Saindo do app: grava agora o que estava esperando os 2,5 s.
    if (document.visibilityState === 'hidden' && memAtiva() && JSON.stringify(memSubset()) !== MEM.ultimo) memSync();
  });
}

window.App = {
  tab: tab, centro: centro, entrar: entrar, escape: escape, escapeEnviar: escapeEnviar, usarSugerencia: usarSugerencia, seguirFlujo: seguirFlujo,
  videoListo: videoListo, cadElegir: cadElegir, cadSiguiente: cadSiguiente, cadAtras: cadAtras,
  abrirDia: abrirDia, tocarDia: tocarDia, verVideo: verVideo, leccion: leccion, bono: bono, iniciarSesion: iniciarSesion, retomar: retomar,
  pasoSiguiente: pasoSiguiente, videoSesion: videoSesion, extraSi: extraSi, extraNo: extraNo, timerToggle: timerToggle, movilidadTimer: movilidadTimer, checkin: checkin, autoeval: autoeval, autoevalListo: autoevalListo,
  verTecnica: verTecnica, salirSesion: salirSesion, cerrarPlayer: cerrarPlayer, despuesDeSesion: despuesDeSesion, sonido: sonido,
  irADia: irADia, iadMover: iadMover, iadConfirmar: iadConfirmar,
  codigo: codigo, comprar: comprar, irCompra: irCompra, faq: faq, videoUp: videoUp, up1Toggle: up1Toggle, up1Checkin: up1Checkin, up2Open: up2Open, fichaUp2: fichaUp2, cursoVideo: cursoVideo,
  enviarChat: enviarChat, chip: chip, audioPlay: audioPlay, audioIr: audioIr, verAudio: verAudio,
  editarCadastro: editarCadastro, ayuda: ayuda, encuesta: encuesta, encElegir: encElegir, encEnviar: encEnviar,
  instalar: instalar, instalarYa: instalarYa, sino: sino, pushSi: pushSi, pushNo: function () { pushDesactivar(); }, copiarLink: copiarLink, abrirOferta: abrirOferta,
  fecharFolha: fecharFolha, fecharLeitor: fecharLeitor, toastCerrar: toastCerrar, toastClick: toastClick,
  // usados pelo HTML cifrado herdado dos upsells
  _estado: function () { return S; }
};
// O conteúdo cifrado do Up2 chama upp2Open() e navTo('inicio'); o do Up1 chama navTo() e toggleCollapsible().
window.upp2Open = up2Open;
window.navTo = function (t) { tab(t === 'inicio' ? 'inicio' : t); };
window.toggleCollapsible = function (id) { var el = $(id); if (el) el.classList.toggle('open'); };
window.closeContentReader = fecharLeitor;

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
