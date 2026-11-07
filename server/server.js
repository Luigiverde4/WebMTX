// Servidor para TFG
// Conexiones
const http = require("http");
const https = require("https");

// Archivos y app
const fs = require("fs");
const path = require("path");
const app = require("./modules/app");
const { cerrarClientesReplay } = require("./modules/app");


// CONFIGURACIÓN (variables de entorno; en Docker vienen de .env vía docker-compose)

/** Lee un booleano de entorno; un valor no reconocido avisa y usa el por defecto. */
function leerBooleano(nombre, porDefecto) {
  const valor = process.env[nombre];
  if (valor === undefined || valor === "") return porDefecto;
  if (/^(true|1|si|sí|yes|on)$/i.test(valor)) return true;
  if (/^(false|0|no|off)$/i.test(valor)) return false;
  console.warn(`[config] ${nombre}="${valor}" no es un booleano válido; se usa ${porDefecto}`);
  return porDefecto;
}

/** Lee un puerto de entorno; fuera de 1-65535 avisa y usa el por defecto. */
function leerPuerto(nombre, porDefecto) {
  const valor = process.env[nombre];
  if (valor === undefined || valor === "") return porDefecto;
  const numero = Number(valor);
  if (Number.isInteger(numero) && numero >= 1 && numero <= 65535) return numero;
  console.warn(`[config] ${nombre}="${valor}" no es un puerto válido; se usa ${porDefecto}`);
  return porDefecto;
}

// Puertos dentro del contenedor (fijos; los del equipo se eligen en docker-compose)
const PORT_HTTP = 80;
const PORT_HTTPS = 443;
// Puerto HTTPS que ve el navegador: el Location de la redirección debe usarlo
const PUERTO_HTTPS_PUBLICO = leerPuerto("PUERTO_HTTPS_PUBLICO", PORT_HTTPS);

// Redirección HTTP -> HTTPS en el puerto 80 (activa salvo HTTP_REDIRECT=false).
// Desactívala si el puerto 80 lo necesita otro servicio del mismo equipo.
const HTTP_REDIRECT = leerBooleano("HTTP_REDIRECT", true);

console.log("[config]", JSON.stringify({
  NODE_ENV: process.env.NODE_ENV || "(sin definir)",
  HTTP_REDIRECT,
  PUERTO_HTTPS_PUBLICO,
  MEDIAMTX_HOST: process.env.MEDIAMTX_HOST || "localhost"
}));


// Certificados TLS (generados con scripts/gen-certs.ps1 / mkcert).
// Sin ellos no tiene sentido arrancar: MediaMTX tampoco arranca y el navegador
// no concede cámara/micrófono fuera de HTTPS (salvo en localhost).
let sslOptions;
try {
  sslOptions = {
    key: fs.readFileSync(path.join(__dirname, "key.pem")),
    cert: fs.readFileSync(path.join(__dirname, "cert.pem"))
  };
} catch (e) {
  console.error("No se encuentran server/key.pem y server/cert.pem.");
  console.error("Genéralos desde la raíz del repo con: .\\scripts\\gen-certs.ps1 -IPsLocales");
  process.exit(1);
}

const httpsServer = https.createServer(sslOptions, app);
httpsServer.listen(PORT_HTTPS, () => {
  console.log("Servidor HTTPS disponible:");
  console.log(`  https://localhost:${PORT_HTTPS}/`);
});

let httpServer = null;
if (HTTP_REDIRECT) {
  httpServer = http.createServer((req, res) => {
    const host = (req.headers.host || "localhost").replace(/:\d+$/, "");
    const puerto = PUERTO_HTTPS_PUBLICO === 443 ? "" : `:${PUERTO_HTTPS_PUBLICO}`;
    res.writeHead(301, {
      Location: `https://${host}${puerto}${req.url}`
    });
    res.end();
  });
  httpServer.listen(PORT_HTTP, () => {
    console.log("Servidor HTTP disponible (redirige a HTTPS):");
    console.log(`  Puerto ${PORT_HTTP} -> HTTPS ${PUERTO_HTTPS_PUBLICO}`);
  });
} else {
  console.log("Redirección HTTP desactivada (HTTP_REDIRECT=false): el puerto 80 queda libre.");
}


// Parada limpia del contenedor (docker compose stop envía SIGTERM).
// Las conexiones SSE de /api/replay/events son de larga duración: hay que
// cerrarlas o server.close() no termina nunca y Docker acaba con SIGKILL.
function parar(senal) {
  console.log(`${senal} recibido: cerrando servidores...`);
  cerrarClientesReplay();
  const servidores = [httpsServer, httpServer].filter(Boolean);
  let pendientes = servidores.length;
  for (const servidor of servidores) {
    servidor.close(() => {
      if (--pendientes === 0) process.exit(0);
    });
    if (typeof servidor.closeAllConnections === "function") servidor.closeAllConnections();
  }
  // Red de seguridad por si alguna conexión no se cierra a tiempo
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on("SIGTERM", () => parar("SIGTERM"));
process.on("SIGINT", () => parar("SIGINT"));
