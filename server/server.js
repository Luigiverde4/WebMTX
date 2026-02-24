// Servidor para TFG
// Conexiones
const http = require("http");
const https = require("https");

// Archivos y app
const fs = require("fs");
const app = require("./modules/app")


// PUERTOS
const PORT_HTTP = 80;
const PORT_HTTPS = 443;


// Servidor HTTP
const httpServer = http.createServer(app);
httpServer.listen(PORT_HTTP, () => {
  console.log("Servidor HTTP disponible:");
  console.log(`  http://localhost:${PORT_HTTP}/`);
});

// Servidor HTTPS

// Certificados SSL (generados con mkcert)
let sslOptions = null;
let httpsServer = null;
try {
  // Cargar certificados
  sslOptions = {
    key: fs.readFileSync(__dirname + "/key.pem"),
    cert: fs.readFileSync(__dirname + "/cert.pem")
  };
  // Montar servidor
  httpsServer = https.createServer(sslOptions, app);  
  // Abrir servidor
  if (httpsServer) {
    httpsServer.listen(PORT_HTTPS, () => {
      console.log("Servidor HTTPS disponible:");
      console.log(`  https://localhost:${PORT_HTTPS}/`);
    });
  }
} catch (e) {
  console.log("   Problemas con certificados / HTTPS. Solo HTTP disponible.");
  console.log("   Genera certificados con: mkcert localhost 127.0.0.1 TU_IP");
  console.log("   Renombra a key.pem y cert.pem en la carpeta server/");
}


// Para cerrar el docker gracefully (SIGTERM)
process.on("SIGTERM", () => {
  io.close(() => {
    console.log("HANGING UP...");
  });
  httpServer.close(() => {
    console.log("CLOSING HTTP...");
  });
  if (httpsServer) {
    httpsServer.close(() => {
      console.log("CLOSING HTTPS...");
    });
  }
});