# Guía rápida: Certificados HTTPS locales para Node.js y MediaMTX

Esta guía explica cómo generar e instalar certificados SSL locales válidos para desarrollo, permitiendo acceso seguro (HTTPS) desde ordenadores y móviles en la red local, sin avisos de seguridad.

---

## Opciones principales

- **mkcert** (recomendado):
  - Crea una CA local de confianza.
  - Los navegadores confían automáticamente en los certificados generados.
  - Ideal para desarrollo y pruebas en LAN.
- **OpenSSL** (alternativa):
  - Genera certificados autofirmados.
  - Los navegadores mostrarán advertencias de seguridad.

---

## 1. Instalación de mkcert

### Windows

1. Instala mkcert:
   ```powershell
   winget install FiloSottile.mkcert --accept-package-agreements --accept-source-agreements
   ```
2. Instala la CA local (puede pedir permisos de administrador):
   ```powershell
   mkcert -install
   ```

### Linux

1. Instala mkcert (según tu distribución):
   ```bash
   sudo apt install libnss3-tools
   sudo snap install mkcert
   # o
   brew install mkcert
   ```
2. Instala la CA local:
   ```bash
   mkcert -install
   ```

---

## 2. Generar certificados para Node.js/MediaMTX

1. Sitúate en la carpeta del servidor (ejemplo: `server/`):
   ```powershell
   cd server
   ```
2. Genera los certificados para todas las IPs locales y localhost:
   ```powershell
   mkcert -key-file key.pem -cert-file cert.pem localhost 127.0.0.1 192.168.1.48 192.168.0.5 192.168.0.6
   ```
   - Añade aquí todas las IPs que pueda tener tu servidor en la red local.
   - Esto crea `key.pem` y `cert.pem` en la carpeta actual.

---

## 3. Configuración en Node.js

Asegúrate de que tu servidor Node.js (Express) carga los certificados así:

```js
const fs = require('fs');
const https = require('https');
const app = require('express')();

const sslOptions = {
  key: fs.readFileSync(__dirname + '/key.pem'),
  cert: fs.readFileSync(__dirname + '/cert.pem')
};

https.createServer(sslOptions, app).listen(443);
```

---

## 4. Acceso desde móvil y otros dispositivos

- Accede usando la IP local del servidor, por ejemplo:
  - `https://192.168.1.48/`
  - `https://192.168.0.5/`
- Si usas mkcert, no verás advertencias de seguridad.
- Si usas OpenSSL, tendrás que aceptar el riesgo manualmente en el navegador.

---

## 5. Notas y troubleshooting

- Si el navegador sigue mostrando advertencias, revisa que:
  - El certificado incluye la IP/host a la que accedes.
  - No hay un proxy o firewall que intercepte el tráfico.
- Para añadir más IPs, vuelve a ejecutar mkcert con todas las IPs necesarias.
- Si cambias de red WiFi, puede cambiar la IP local: genera un nuevo certificado si es necesario.

---

## 6. Referencias

- [mkcert en GitHub](https://github.com/FiloSottile/mkcert)
- [OpenSSL](https://www.openssl.org/)

---

**Resumen:** Usar mkcert es la forma más sencilla y segura de tener HTTPS real en desarrollo local, compatible con móviles y sin avisos molestos.
