// Configuração do dono (Kess). Editar só aqui. Os outros arquivos de datos/ são gerados pelo montar_v2.py.
// Também é lida pela função do chat (netlify/functions/chat.js), por isso o "module.exports" no fim: o nome do agente
// mora só aqui.
var CONFIG = {
  VERSION: '2.1.0',
  PROD_HOST: (typeof location!=='undefined'?location.hostname:''),
  APP_URL: (typeof location!=='undefined'?location.origin+'/app':'/app'),
  SOPORTE_EMAIL: 'dailyvitalreport99@gmail.com',

  // Funções no servidor (Netlify Functions). A chave da IA mora só lá.
  // mobpay: rota de acesso e de push do MOBPAY (contrato em MOBPAY/docs/pedidos/2026-10-13-acesso-app-push-e-lista.md).
  // Enquanto ela não existir, o app entra em modo suave sozinho. chat: o chat da Clara (função da Netlify, chave só lá).
  // memoria: o progresso e o cadastro guardados pelo e-mail da compra (14/10), para voltar em outro celular ou navegador.
  API: { mobpay: '', chat: '', memoria: '' },

  // A assistente do app (por dentro, uma IA; na tela, só "Clara": Kess, 14/10 ~12h40). Kess, 14/10: "como um agente, tipo a Maya do Gui"; nome "Clara", feminino, fácil de
  // lembrar). Desde 14/10 é ela quem fala em todo o app: chat, mensagens dos dias, avisos e áudio de boas-vindas.
  // Trocar o nome só aqui (vale para o app e para o prompt da função do chat) e publicar.
  // avatar vazio = círculo com a inicial do nome. saludo: texto do Derick AI (14/10); {agente} e {nombre} são trocados no app.
  AGENTE: {
    nombre: 'Clara',
    rol: '',   // vazio de propósito (Kess, 14/10 ~12h40): a Clara não se anuncia como IA nem tem cargo; só diz se perguntarem
    avatar: '',
    saludo: 'Hola, {nombre}, soy {agente} y voy a acompañarte en el Desafío 21 Días. Resuelvo dudas sobre los ejercicios, tu día del desafío y la app.'
  },

  // Aviso de novidade: aparece UMA vez para quem já usava o app, na 1ª abertura depois do deploy (marcado no aparelho
  // e na memória do servidor). Quem chega novo não vê. A CADA DEPLOY COM NOVIDADE: trocar a "version" (AAAA-MM-DD, ou
  // AAAA-MM-DD-b para um 2º no mesmo dia; tem que ser maior que a anterior) e o texto. Texto do Derick AI.
  // activo: false ou texto vazio = ninguém vê.
  NOVEDAD: {
    version: '2026-10-14',
    activo: true,
    titulo: 'Tu progreso ahora queda guardado',
    texto: 'Actualizamos la app: tu progreso ahora queda guardado con tu correo de compra. Úsalo en cualquier celular o navegador y encontrarás tu día actual, tus días completados y tus datos.',
    boton: 'Entendido'
  },

  // Checkout dos upsells (os mesmos do MOBPAY, src/services/hotmart/config.ts).
  CHECKOUT: {
    up1: (typeof window!=='undefined'&&window.OFERTA_CONFIG&&window.OFERTA_CONFIG.UPSELL1_CHECKOUT_URL)||'https://pay.hotmart.com/T108362405D?off=o99570xb',
    up2: (typeof window!=='undefined'&&window.OFERTA_CONFIG&&window.OFERTA_CONFIG.UPSELL2_CHECKOUT_URL)||'https://pay.hotmart.com/T108362405D?off=o99570xb'
  },
  CAMPANHA: { up1: 'activacion_7d', up2: 'ejecucion_perfecta' },

  // Boas-vindas (Kess, 14/10): o vídeo saiu; no lugar, o áudio da Clara (47 s, ElevenLabs, roteiro do Derick AI), tocado
  // antes do cadastro e no topo do chat. Vazio = pula direto para o cadastro. Fonte: acervo/.../audio-bienvenida/.
  AUDIO_BIENVENIDA: 'audio/clara-bienvenida-v2.mp3',   // 14/10 12h17: sem "la asistente virtual de tu app"
  AUDIO_BIENVENIDA_SEG: 47,

  // Venda do Up2 em áudio nas mensagens dos dias (Kess, 27/10: "a venda da clara pode ser por audio"): a Clara lendo o
  // venta.up2 do Derick, com a voz das boas-vindas. No lugar do parágrafo entra o áudio; fica escrita só a frase do e-mail.
  // Dia que não está aqui mostra o texto, como antes. Fonte: acervo/campanhas/tdc-up2-bueno-en-la-cama/audio-venda-clara/.
  AUDIO_VENTA: { up2: {
    2: { src: 'audio/clara-venta-up2/d02.mp3', seg: 32 },
    3: { src: 'audio/clara-venta-up2/d03.mp3', seg: 30 },
    5: { src: 'audio/clara-venta-up2/d05.mp3', seg: 31 },
    8: { src: 'audio/clara-venta-up2/d08.mp3', seg: 32 },
    11: { src: 'audio/clara-venta-up2/d11.mp3', seg: 32 },
    13: { src: 'audio/clara-venta-up2/d13.mp3', seg: 31 },
    14: { src: 'audio/clara-venta-up2/d14.mp3', seg: 29 },
    17: { src: 'audio/clara-venta-up2/d17.mp3', seg: 31 },
    21: { src: 'audio/clara-venta-up2/d21.mp3', seg: 29 }
  } },

  // Bônus que "se abre" ao terminar o cadastro (como prometido no vídeo de boas-vindas).
  BONO_CADASTRO: { id: 'reinicio', titulo: 'Reinicio: Adiós al Porno', url: 'bono-reinicio.html' },

  // Vídeos de mobilidade de quadril (passo opcional no fim da sessão). Chave = número do "exc".
  MOVILIDAD: {
    1:  { name: 'Empuje de cadera en rana', id: 'yt:Z7_xXkCtULU' },
    2:  { name: 'Estiramiento de fuerza', id: 'yt:CN-poIaoAEU' },
    3:  { name: 'Movilidad de cadera 90/90', id: 'yt:ZwQC70oTBDY' },
    4:  { name: 'Mariposa', id: 'yt:CoG1-lE1Qr0' },
    5:  { name: 'Puente en mesa (table top)', id: 'yt:owvzOt9i6bQ' },
    6:  { name: 'Puente de glúteos con talones', id: 'yt:LM2y16nFgLc' },
    7:  { name: 'Puente con abducción de cadera', id: 'yt:FRVZgzqS0vg' },
    8:  { name: 'Pulsos de muslo interno', id: 'yt:S46iwmrn534' },
    9:  { name: 'Abducción en split (acostado)', id: 'yt:6raC4nMGst0' },
    10: { name: 'Círculos de cadera (acostado)', id: 'yt:vv_nVEFoONQ' },
    11: { name: 'Estiramiento lumbar', id: 'yt:QUSOE6GhfRw' },
    12: { name: 'Estiramiento de rana con balanceo', id: 'yt:xMpN577SO0U' },
    13: { name: 'Zancada lateral con inclinación', id: 'yt:JdGtHC-g-hM' },
    14: { name: 'Postura de la paloma', id: 'yt:w43k1CxLgFc' },
    15: { name: 'Mariposa con inclinación al frente', id: 'yt:Qg0EjPsjE0U' },
    16: { name: 'Aductores y flexores (sentado)', id: 'yt:yIc2752B8xo' },
    17: { name: 'Estiramiento de fuerza interna', id: 'yt:Cn8Egny5XjY' },
    18: { name: 'Rotación externa arrodillado', id: 'yt:Cxwc0zbOAKk' },
    19: { name: 'Limpiaparabrisas sentado', id: 'yt:qu6JTnet91Y' },
    20: { name: 'Báscula pélvica (pelvic tilt)', id: 'yt:OPT94REynYg' }
  },

  // Oferta de cierre dos dias 15 e 20 (molde do app do Gui, com prazo REAL). Kess, 13/10: o Up1 (Activación 7D, US$ 17)
  // por US$ 9,90 durante 1 hora, só para quem ainda não tem o Up1. O link é a oferta nova a US$ 9,90 no produto
  // 8668035 da Hotmart, criada pelo Kess em 13/10. Sem link, não aparece para ninguém.
  // No preview dá para ver com ?demo=oferta no endereço.
  // Up1 para quem pagou o front sem cartão (Kess, 26/10): folha uma vez, texto em upsells.json → oferta_sin_tarjeta.
  // O MOBPAY manda produtos.front.sinTarjeta. false = não sobe.
  OFERTA_SIN_TARJETA: true,

  OFERTA_CIERRE: {
    activo: true,
    dias: [15, 20],
    horas: 1,                // o prazo começa quando ele vê a oferta pela primeira vez e fica gravado
    upsell: 'up1',           // some para quem já tem este upsell
    producto: 'Activación 7D',
    precio: 'US$ 9,90',
    precio_antes: 'US$ 17',
    link: 'https://pay.hotmart.com/T108362405D?off=o99570xb?off=lpxa8y63'   // oferta "Promocion" a US$ 9,90 no produto 8668035 (Kess, 13/10)
  },

  // Curso em vídeo do Up2 (Kess, 27/10: "o curso em vídeo já tenho, só vou integrar no app quando der"). Textos do Derick AI,
  // v3 do "Bueno en la Cama" aprovado no revisor em 27/10. Link vazio = nada aparece: nem o fecho depois da aula 8.4 nem o
  // cartão no fim do índice da aba. Para ligar: colar o link em url e publicar.
  CURSO_VIDEO: {
    url: '',
    fecho: {
      titulo: '¿Quieres ir más allá?',
      parrafos: ['Si te gustaría seguir aprendiendo con clases prácticas, también tienes el curso en video.',
        'Es para cuando quieras dar un paso más, a tu tiempo y sin apuro.',
        'Y si no, tranquilo: lo que aprendiste aquí ya es tuyo.'],
      boton: 'Ver el curso en video'
    },
    tarjeta: { grupo: 'Curso en video', emoji: '🎬', titulo: 'El curso en video', linea: 'Clases prácticas, si quieres ir más allá' }
  },

  // Lugares para textos do Derick AI (outra IA), liberados pelo Kess em 13/10 ("se funciona no mercado, vai funcionar pra mim").
  // Escassez, urgência e promessa de resultado/saúde: o Claude NÃO escreve esses textos. Todos começam desligados e vazios;
  // o texto vem do Derick AI e só liga com o ok do Kess. Texto vazio = nada aparece, mesmo com activo: true.
  DERICK: {
    // Contador de vagas (como o "41/50" do app do Gui). {n} = vagas ocupadas, {total} = total. Sobe 1 a cada N horas, por aparelho.
    escasez: { activo: false, texto: '', total: 50, inicio: 41, sube_cada_horas: 6, en: ['oferta', 'up1', 'up2'] },
    // Aviso de urgência no topo das páginas de venda (um por upsell).
    urgencia: { activo: false, up1: '', up2: '' },
    // Parágrafo extra de promessa nas páginas de venda, depois dos benefícios.
    promesa_upsell: { activo: false, up1: '', up2: '' },
    // Parágrafo extra de promessa na mensagem de cada dia (chave = dia).
    promesa_mensajes: { activo: false, 2: '', 3: '', 5: '', 8: '', 11: '', 13: '', 14: '', 17: '', 21: '' }
  },

  // Planilha da base de clientes (Google Apps Script). Só envia em produção.
  ENCUESTA_URL: '',

  // Questionário original (Kess, 05/10: "bem importante"), dentro do cadastro. Mesmos textos e opções do app antigo,
  // para as colunas da planilha (edad, molesta, intentos, decisivo, miedos, ingreso) continuarem batendo.
  CUESTIONARIO: {
    molesta: { id: 'molesta', titulo: 'Lo que más te molesta', pregunta: '¿Qué es lo que más te molesta hoy en la intimidad?', tipo: 'opciones',
      opciones: ['La erección no me aguanta', 'Termino antes de lo que quisiera', 'Me levanto de noche a orinar', 'Siento menos fuerza que antes'] },
    extra: [
      { id: 'intentos', titulo: 'Lo que ya probaste', pregunta: 'Hasta hoy, ¿qué fue lo principal que probaste para mejorar?', tipo: 'opciones',
        opciones: ['Pastillas (la pastilla azul)', 'Fui al urólogo', 'Testosterona o suplementos', 'Gimnasio o ejercicio', 'Nada todavía'] },
      { id: 'decisivo', titulo: 'Lo decisivo', pregunta: '¿Qué fue lo decisivo para que compraras el desafío?', tipo: 'opciones',
        opciones: ['Entender lo del músculo fantasma', 'Que es natural, sin pastillas', 'La explicación del video', 'El precio', 'La garantía de 90 días'] },
      { id: 'miedos', titulo: 'Tu mayor duda', pregunta: 'Antes de comprar, ¿cuál fue tu mayor duda?', tipo: 'opciones',
        opciones: ['Que no funcionara en mi caso', 'Que a mi edad ya fuera tarde', 'Que fuera difícil de seguir', 'Que fuera un engaño', 'No tuve dudas'] },
      { id: 'ingreso', titulo: 'Tu ingreso', pregunta: '¿Cuál es tu ingreso mensual aproximado?', tipo: 'opciones',
        opciones: ['Hasta US$ 500', 'US$ 500 a 1.000', 'US$ 1.000 a 2.000', 'Más de US$ 2.000', 'Prefiero no decirlo'] }
    ]
  },

  // Perguntas frequentes da Ayuda (em tú).
  FAQS: [
    { q: '¿Cuánto tiempo hasta sentir alguna diferencia?', a: 'Varía de hombre a hombre. Algunos notan más conciencia del músculo desde la primera semana. El control y la firmeza suelen notarse más a partir de la fase 2 o 3.' },
    { q: '¿Cada cuánto se abre un día nuevo?', a: 'Un día nuevo por cada día de calendario, contado desde tu compra. Si te atrasaste, los días que ya se abrieron te esperan: haz uno por sesión y sigue.' },
    { q: 'Cambié de celular o de navegador y perdí mi avance', a: 'Ve a tu Perfil y toca "Ir a día". Eliges el día en que estabas y la app sigue desde ahí.' },
    { q: '¿Es normal no sentir nada los primeros días?', a: 'Sí. Repite la lección "Encuentra el músculo" del Día 1 y hazlo acostado, que es la posición más fácil. Si sigue igual, escribe tu duda en el chat.' },
    { q: '¿Puedo hacer los ejercicios si tuve cirugía de próstata?', a: 'Este tipo de entrenamiento se usa en la recuperación después de la cirugía, pero siempre con la indicación de tu médico. Consúltalo antes de empezar.' },
    { q: '¿Tiene garantía?', a: 'Sí, 90 días. Si haces el desafío y no notas ninguna diferencia, escríbenos y te devolvemos tu dinero.' },
    { q: '¿Puedo hacer de más para ir más rápido?', a: 'No te lo recomiendo. Este músculo se cansa igual que cualquier otro, y el descanso entre sesiones también es parte del proceso.' }
  ]
};
if (typeof window !== 'undefined') window.CONFIG = CONFIG;
if (typeof module !== 'undefined' && module.exports) module.exports = CONFIG;
