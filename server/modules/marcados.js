// MOMENTOS MARCADOS COMPARTIDOS
// Instantes que los operadores guardan para lanzarlos luego como repetición
// (desde Repeticiones o Archivo). Se comparten entre todos los equipos: viven
// aquí, en un JSON dentro del volumen datos_volume, y cada cambio se difunde
// por SSE a todas las pantallas abiertas.
//
// Cada marca: { id, stream, iso, nota }

const fs = require("fs");
const path = require("path");
const express = require("express");
const { crearCanalSSE } = require("./sse");

const DATOS_DIR = process.env.DATOS_DIR || path.join(__dirname, "..", "datos");
const FICHERO = path.join(DATOS_DIR, "marcados.json");
const MAX_MARCADOS = 200;           // Se conservan las más recientes
const MAX_NOTA = 60;
const PATRON_STREAM = /^[\w.~-]{1,64}$/; // Nombre de path de MediaMTX, sin "/" ni ".."

let marcados = [];
let ultimoId = 0;
const canal = crearCanalSSE();

// CARGA Y GUARDADO
function cargar() {
  try {
    const datos = JSON.parse(fs.readFileSync(FICHERO, "utf8"));
    if (!Array.isArray(datos)) throw new Error("no es una lista");
    marcados = datos.filter(m => m && typeof m.id === "number" && typeof m.stream === "string" && typeof m.iso === "string");
    ultimoId = marcados.reduce((max, m) => Math.max(max, m.id), 0);
    console.log(`[marcados] ${marcados.length} cargados de ${FICHERO}`);
  } catch (error) {
    if (error.code !== "ENOENT") console.warn(`[marcados] No se pudo leer ${FICHERO} (${error.message}): se empieza vacío`);
    marcados = [];
  }
}

// Las escrituras van en cola: dos cambios seguidos no se pisan. Se escribe en
// un temporal y se renombra, así un corte a mitad nunca deja el JSON a medias.
let colaEscritura = Promise.resolve();
function guardar() {
  const contenido = JSON.stringify(marcados, null, 1);
  colaEscritura = colaEscritura
    .then(async () => {
      await fs.promises.mkdir(DATOS_DIR, { recursive: true });
      await fs.promises.writeFile(`${FICHERO}.tmp`, contenido);
      await fs.promises.rename(`${FICHERO}.tmp`, FICHERO);
    })
    .catch(error => console.error(`[marcados] No se pudo guardar ${FICHERO}:`, error.message));
  return colaEscritura;
}

// Tras cada cambio: guardar y avisar a todas las pantallas.
async function cambiado() {
  await guardar();
  canal.difundir(marcados);
}

// VALIDACIÓN
function validarNota(nota) {
  if (nota === undefined) return "";
  if (typeof nota !== "string") return null;
  return nota.trim().slice(0, MAX_NOTA);
}

function buscar(req, res) {
  const marca = marcados.find(m => m.id === Number(req.params.id));
  if (!marca) res.status(404).json({ error: "No existe esa marca" });
  return marca;
}

// RUTAS
const router = express.Router();

router.get("/", (req, res) => res.json(marcados));

router.get("/events", (req, res) => canal.conectar(req, res, marcados));

router.post("/", async (req, res) => {
  const { stream, iso, nota } = req.body || {};
  if (typeof stream !== "string" || !PATRON_STREAM.test(stream)) {
    return res.status(400).json({ error: '"stream" debe ser el nombre de una cámara (letras, números, . _ ~ -)' });
  }
  const instante = new Date(iso);
  if (typeof iso !== "string" || Number.isNaN(instante.getTime())) {
    return res.status(400).json({ error: '"iso" debe ser una fecha ISO 8601' });
  }
  const textoNota = validarNota(nota);
  if (textoNota === null) return res.status(400).json({ error: '"nota" debe ser texto' });

  // id basado en la hora: no se repite aunque se borren todas y se reinicie
  ultimoId = Math.max(Date.now(), ultimoId + 1);
  const marca = { id: ultimoId, stream, iso: instante.toISOString(), nota: textoNota };
  marcados = [marca, ...marcados].slice(0, MAX_MARCADOS);
  await cambiado();
  res.status(201).json(marca);
});

router.patch("/:id", async (req, res) => {
  const marca = buscar(req, res);
  if (!marca) return;
  const textoNota = validarNota((req.body || {}).nota);
  if (textoNota === null) return res.status(400).json({ error: '"nota" debe ser texto' });
  marca.nota = textoNota;
  await cambiado();
  res.json(marca);
});

router.delete("/:id", async (req, res) => {
  const marca = buscar(req, res);
  if (!marca) return;
  marcados = marcados.filter(m => m !== marca);
  await cambiado();
  res.status(204).end();
});

router.delete("/", async (req, res) => {
  marcados = [];
  await cambiado();
  res.status(204).end();
});

cargar();

module.exports = { routerMarcados: router, cerrarClientesMarcados: () => canal.cerrarTodos() };
