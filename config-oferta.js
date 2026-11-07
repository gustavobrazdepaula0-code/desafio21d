/**
 * ============================================================================
 * CONFIGURAÇÃO CENTRAL DA OFERTA — DESAFÍO DE LOS 21 DÍAS (MARIANA CASTILLO)
 * ============================================================================
 */
window.OFERTA_CONFIG = {
  // 1. PIXEL DO FACEBOOK ADS
  META_PIXEL_ID: "1384249610451971",

  // 2. VSL DO VTURB (em /front/)
  VTURB_PLAYER_ID: "vid-6aed09bf67bce4fe690c4131",
  VTURB_SCRIPT_URL: "https://scripts.converteai.net/df2d8713-aa6d-4a75-8ada-a5e2eeae5965/players/6aed09bf67bce4fe690c4131/v4/player.js",
  VTURB_RAW_HTML: '<vturb-smartplayer id="vid-6aed09bf67bce4fe690c4131" style="display: block; margin: 0 auto; width: 100%; max-width: 400px;"><div class="vturb-player-placeholder" style="position: relative; width: 100%; padding: 178.21782178217822% 0 0; z-index: 0; background-color: black;"></div></vturb-smartplayer>',

  MOSTRAR_BOTAO_ABAIXO_VSL_SEGUNDOS: 0,
  TEXTO_BOTAO_VSL: "QUIERO EMPEZAR EL DESAFÍO DE 21 DÍAS →",

  // 3. LINKS DE CHECKOUT HOTMART
  CHECKOUT_URL: "https://pay.hotmart.com/T108362405D?off=o99570xb&checkoutMode=10",
  UPSELL1_CHECKOUT_URL: "https://pay.hotmart.com/T108362405D?off=o99570xb&checkoutMode=10",
  UPSELL2_CHECKOUT_URL: "https://pay.hotmart.com/T108362405D?off=o99570xb&checkoutMode=10"
};

// Inicializador Automático do Meta Pixel (1384249610451971) + Meta CAPI Server-Side
(function() {
  var pid = (window.OFERTA_CONFIG && window.OFERTA_CONFIG.META_PIXEL_ID || "").trim();
  if (!pid) return;

  // Garantir _fbc a partir do fbclid na URL
  try {
    var params = new URLSearchParams(window.location.search);
    var fbclid = params.get("fbclid");
    if (fbclid) {
      var fbc = "fb.1." + Date.now() + "." + fbclid;
      document.cookie = "_fbc=" + fbc + "; path=/; max-age=7776000; SameSite=Lax";
    }
  } catch (e) {}

  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window, document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');

  var pvId = "pv_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  fbq('init', pid);
  fbq('track', 'PageView', {}, { eventID: pvId });

  // Helper global para disparar CAPI sincronizado com o Browser Pixel
  window.sendMetaCapi = function(eventName, customData, eventId) {
    try {
      var eid = eventId || ("ev_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8));
      var getCookie = function(name) {
        var m = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        return m ? decodeURIComponent(m[2]) : null;
      };
      fetch('/api/capi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          event_name: eventName,
          event_id: eid,
          event_source_url: window.location.href,
          fbp: getCookie('_fbp'),
          fbc: getCookie('_fbc'),
          custom_data: customData || {}
        })
      }).catch(function(){});
    } catch (e) {}
  };

  window.sendMetaCapi('PageView', {}, pvId);
})();