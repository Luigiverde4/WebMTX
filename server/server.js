// Servidor para TFG
// Conexiones
const http = require("http");
const https = require("https");

// Archivos y app
const fs = require("fs");
const path = require("path");
const app = require("./modules/app");
const { cerrarClientesReplay } = require("./modules/app");


// PUERTOS
const PORT_HTTP = 80;
const PORT_HTTPS = 443;

// Redirección HTTP -> HTTPS en el puerto 80 (activa salvo HTTP_REDIRECT=false).
// Desactívala si el puerto 80 lo necesita otro servicio del mismo equipo.
const HTTP_REDIRECT = !/^(false|0|no|off)$/i.test(process.env.HTTP_REDIRECT || "true");


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
    const host = (req.headers.host || `localhost:${PORT_HTTP}`).replace(/:\d+$/, "");
    res.writeHead(301, {
      Location: `https://${host}:${PORT_HTTPS}${req.url}`
    });
    res.end();
  });
  httpServer.listen(PORT_HTTP, () => {
    console.log("Servidor HTTP disponible (redirige a HTTPS):");
    console.log(`  Puerto ${PORT_HTTP} -> HTTPS ${PORT_HTTPS}`);
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
