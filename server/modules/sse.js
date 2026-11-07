// CANAL SSE REUTILIZABLE
// Mantiene la lista de navegadores suscritos a un canal, les manda el estado
// al conectar y en cada cambio, y un latido para que ningún proxy intermedio
// corte la conexión por inactividad. Lo usan las repeticiones de OBS y los
// momentos marcados.

const LATIDO_MS = 15000;
const canales = new Set();

// Un único latido para todos los canales. unref(): no impide que el proceso termine.
setInterval(() => {
  for (const canal of canales) canal.latir();
}, LATIDO_MS).unref();

function crearCanalSSE() {
  const clientes = new Set();

  const canal = {
    // Abre el flujo SSE y manda el estado actual.
    conectar(req, res, datosIniciales) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      });
      res.write("retry: 3000\n\n");
      res.write(`data: ${JSON.stringify(datosIniciales)}\n\n`);
      clientes.add(res);
      req.on("close", () => clientes.delete(res));
    },
    // Manda un estado nuevo a todos los suscritos.
    difundir(datos) {
      const payload = `data: ${JSON.stringify(datos)}\n\n`;
      for (const res of clientes) res.write(payload);
    },
    latir() {
      for (const res of clientes) res.write(": ping\n\n");
    },
    // Cierra las conexiones (apagado ordenado del servidor).
    cerrarTodos() {
      for (const res of clientes) res.end();
      clientes.clear();
    }
  };

  canales.add(canal);
  return canal;
}

module.exports = { crearCanalSSE };
