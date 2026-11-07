const path = require("path");
const https = require("https");
const express = require("express")
const { crearCanalSSE } = require("./sse");
const { routerMarcados, cerrarClientesMarcados } = require("./marcados");
const app = express();

const MEDIAMTX_API_HOST = process.env.MEDIAMTX_HOST || "localhost";
const MEDIAMTX_API_PORT = 9997;
const PLAYBACK_API_HOST = process.env.PLAYBACK_HOST || MEDIAMTX_API_HOST;
const PLAYBACK_API_PORT = Number(process.env.PLAYBACK_PORT || 9996);

// Parsear JSON para peticiones POST/PATCH
app.use(express.json());

// Servir archivos estáticos desde la carpeta public
app.use(express.static(path.join(__dirname, "..", "public")));
// Exponer librerías cliente instaladas por npm 
app.use("/vendor", express.static(path.join(__dirname, "..", "node_modules")));

// Index home
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});


// PROXY API MediaMTX
// (evita problemas de CORS y autenticación)
app.all("/api/mediamtx/*", (req, res) => {
  // Soporta GET, POST, PATCH, DELETE, etc. Captura todo después de /api/mediamtx/
  const apiPath = req.params[0]; // Captura todo después de /api/mediamtx/
  const body = req.body ? JSON.stringify(req.body) : '';
  const queryIndex = req.originalUrl.indexOf('?');
  const query = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : '';

  // Preparar el payload
  const options = {
    hostname: MEDIAMTX_API_HOST,
    port: MEDIAMTX_API_PORT,
    path: `/${apiPath}${query}`,
    method: req.method,
    headers: { 
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  };
  
  // Realizar la petición al API de MediaMTX
  const proxyReq = https.request({ ...options, rejectUnauthorized: false }, (proxyRes) => {
    let data = '';
    proxyRes.on('data', chunk => data += chunk);
    proxyRes.on('end', () => {
      res.status(proxyRes.statusCode);
      try {
        if (data) {
          res.json(JSON.parse(data));
        } else {
          res.end();
        }
      } catch (e) {
        res.send(data);
      }
    });
  });
  
  // En caso de ERROR
  proxyReq.on('error', (error) => {
    console.error("Error proxy MediaMTX:", error.message);
    res.status(500).json({ error: error.message });
  });
  
  // Enviar el body si existe
  if (body) proxyReq.write(body);
  proxyReq.end();
});

// PROXY Playback API (puerto 9996)
app.all("/api/playback/*", (req, res) => {
  const apiPath = req.params[0];
  const body = req.body ? JSON.stringify(req.body) : '';
  const queryIndex = req.originalUrl.indexOf('?');
  const query = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : '';

  const options = {
    hostname: PLAYBACK_API_HOST,
    port: PLAYBACK_API_PORT,
    path: `/${apiPath}${query}`,
    method: req.method,
    headers: {
      'Content-Length': Buffer.byteLength(body)
    }
  };

  const proxyReq = https.request({ ...options, rejectUnauthorized: false }, (proxyRes) => {
    res.status(proxyRes.statusCode || 500);

    Object.entries(proxyRes.headers).forEach(([headerName, headerValue]) => {
      if (headerValue !== undefined) {
        res.setHeader(headerName, headerValue);
      }
    });

    proxyRes.pipe(res);
  });

  // Si el navegador abandona (cambia de vídeo, miniatura ya capturada, cierra
  // la pestaña), se corta también la petición a MediaMTX: si no, seguiría
  // leyendo la grabación para nadie.
  let abandonada = false;
  res.on('close', () => {
    if (!res.writableFinished) {
      abandonada = true;
      proxyReq.destroy();
    }
  });

  proxyReq.on('error', (error) => {
    if (abandonada) return;
    console.error("Error proxy Playback:", error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      res.end();
    }
  });

  if (body) proxyReq.write(body);
  proxyReq.end();
});


// CONTROL DE REPETICIONES PARA OBS
// La página de repeticiones (control) fija qué repetición mostrar; los displays
// (display.html como fuente de navegador en OBS) se suscriben por SSE y
// reproducen lo que aquí se guarde. Estado en memoria: se pierde al reiniciar.
const PREFIJO_URL_REPETICION = "/api/playback/get?";
const MAX_LABEL = 120;

let estadoRepeticion = { id: 0, cmd: "stop", label: "", ts: Date.now() };
const canalRepeticion = crearCanalSSE();

// Envía el estado actual a todos los displays conectados.
function difundirRepeticion() {
  canalRepeticion.difundir(estadoRepeticion);
}

// El control fija una repetición a mostrar. Solo se aceptan URLs del proxy de
// playback: lo que llega aquí sale en antena, no puede ser una URL arbitraria.
app.post("/api/replay/select", (req, res) => {
  const { url, seekOffset, label } = req.body || {};
  if (typeof url !== "string" || !url.startsWith(PREFIJO_URL_REPETICION)) {
    return res.status(400).json({ error: `"url" debe empezar por ${PREFIJO_URL_REPETICION}` });
  }
  estadoRepeticion = {
    id: estadoRepeticion.id + 1, // Incrementa siempre: permite re-disparar la misma
    cmd: "play",
    url,
    seekOffset: Math.max(0, Number(seekOffset) || 0),
    label: String(label || "").slice(0, MAX_LABEL),
    ts: Date.now()
  };
  difundirRepeticion();
  res.json(estadoRepeticion);
});

// El control limpia el display (deja de mostrar nada).
app.post("/api/replay/stop", (req, res) => {
  estadoRepeticion = { id: estadoRepeticion.id + 1, cmd: "stop", label: "", ts: Date.now() };
  difundirRepeticion();
  res.json(estadoRepeticion);
});

// Estado actual (para sincronizar al entrar, o depurar).
app.get("/api/replay/current", (req, res) => {
  res.json(estadoRepeticion);
});

// Canal SSE: el display recibe el estado al conectar y en cada cambio.
app.get("/api/replay/events", (req, res) => {
  canalRepeticion.conectar(req, res, estadoRepeticion);
});


// MOMENTOS MARCADOS COMPARTIDOS (ver modules/marcados.js)
app.use("/api/marcados", routerMarcados);

// Cierra las conexiones SSE abiertas (lo usa server.js al recibir SIGTERM).
function cerrarClientesReplay() {
  canalRepeticion.cerrarTodos();
  cerrarClientesMarcados();
}

module.exports = app;
module.exports.cerrarClientesReplay = cerrarClientesReplay;