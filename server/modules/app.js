const express = require("express")
const app = express();

const MEDIAMTX_API_HOST = process.env.MEDIAMTX_HOST || "localhost";
const MEDIAMTX_API_PORT = 9997;

// Parsear JSON para peticiones POST/PATCH
app.use(express.json());

// Servir archivos estáticos desde la carpeta public
app.use(express.static("public"));

// Index home
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});


// PROXY API MediaMTX
// (evita problemas de CORS y autenticación)
app.all("/api/mediamtx/*", (req, res) => {
  // Soporta GET, POST, PATCH, DELETE, etc. Captura todo después de /api/mediamtx/
  const path = req.params[0]; // Captura todo después de /api/mediamtx/
  const body = req.body ? JSON.stringify(req.body) : '';
  
  // Preparar el payload
  const options = {
    hostname: MEDIAMTX_API_HOST,
    port: MEDIAMTX_API_PORT,
    path: `/${path}`,
    method: req.method,
    headers: { 
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  };
  
  // Realizar la petición al API de MediaMTX
  const proxyReq = http.request(options, (proxyRes) => {
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

module.exports = app;