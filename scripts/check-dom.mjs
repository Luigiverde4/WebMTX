#!/usr/bin/env node
// Comprueba los contratos entre HTML y JS del front (server/public), sin dependencias.
//
// Por cada página HTML:
//  - los <script src> y <link href> locales existen;
//  - los ids que usa el JS cargado (getElementById('x') / querySelector('#x')) existen en el HTML
//    (o se crean desde JS: id="x" / .id = 'x' dentro de algún script de la página);
//  - las funciones llamadas desde atributos on* y data-load están definidas en los scripts de la página;
//  - no hay declaraciones de nivel superior (let/const/class/function) repetidas entre scripts
//    (con scripts clásicos comparten ámbito global y provocarían SyntaxError).
// Además ejecuta `node --check` sobre cada .js de server/public/js.
//
// Uso: node scripts/check-dom.mjs        (sale con código 1 si hay errores)

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(raiz, "server", "public");
const nodeModules = join(raiz, "server", "node_modules");

const errores = [];
const avisos = [];

function leer(ruta) {
    return readFileSync(ruta, "utf8");
}

// En el host, server/node_modules suele ser una carpeta vacía (el real vive en un volumen del contenedor)
const hayNodeModules = existsSync(nodeModules) && readdirSync(nodeModules).length > 0;

// Resuelve una URL local igual que el navegador (relativa al fichero que la referencia)
// y la traduce a un fichero del disco. /vendor/* -> server/node_modules/*
function resolverLocal(url, baseDir) {
    if (/^(https?:)?\/\//.test(url) || url.startsWith("data:")) return null;
    const sub = relative(publicDir, baseDir).replaceAll("\\", "/");
    const baseUrl = "https://local/" + (sub ? sub + "/" : "");
    const ruta = decodeURIComponent(new URL(url, baseUrl).pathname);
    if (ruta.startsWith("/vendor/")) return hayNodeModules ? join(nodeModules, ruta.slice("/vendor/".length)) : null;
    return join(publicDir, ruta);
}

function quitarComentariosJs(codigo) {
    return codigo
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:\\'"`])\/\/.*$/gm, "$1");
}

// Declaraciones de nivel superior: solo las que empiezan en columna 0.
function declaracionesNivelSuperior(codigo) {
    const nombres = [];
    const re = /^(?:async\s+)?(let|const|var|class|function\*?)\s+([A-Za-z_$][\w$]*)/gm;
    let m;
    while ((m = re.exec(codigo))) nombres.push({ tipo: m[1], nombre: m[2] });
    // const { a, b } = ... / let [a, b] = ...
    const reDestr = /^(?:let|const|var)\s+[{[]([^}\]]+)[}\]]/gm;
    while ((m = reDestr.exec(codigo))) {
        for (const parte of m[1].split(",")) {
            const n = parte.split(":").pop().split("=")[0].trim();
            if (/^[A-Za-z_$][\w$]*$/.test(n)) nombres.push({ tipo: "let", nombre: n });
        }
    }
    return nombres;
}

function funcionesDefinidas(codigo) {
    const set = new Set();
    const patrones = [
        /function\s*\*?\s+([A-Za-z_$][\w$]*)\s*\(/g,
        /(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g,
        /window\.([A-Za-z_$][\w$]*)\s*=/g,
    ];
    for (const re of patrones) {
        let m;
        while ((m = re.exec(codigo))) set.add(m[1]);
    }
    return set;
}

function idsUsadosEnJs(codigo) {
    const ids = new Set();
    let m;
    const reGet = /getElementById\(\s*(['"`])([^'"`$]+)\1\s*\)/g;
    while ((m = reGet.exec(codigo))) ids.add(m[2]);
    const reQs = /querySelector(?:All)?\(\s*(['"`])#([A-Za-z][\w-]*)[^'"`]*\1\s*\)/g;
    while ((m = reQs.exec(codigo))) ids.add(m[2]);
    return ids;
}

function idsCreadosEnJs(codigo) {
    const ids = new Set();
    let m;
    const reAttr = /\bid=\\?["']([A-Za-z][\w-]*)\\?["']/g;
    while ((m = reAttr.exec(codigo))) ids.add(m[1]);
    const reProp = /\.id\s*=\s*(['"`])([A-Za-z][\w-]*)\1/g;
    while ((m = reProp.exec(codigo))) ids.add(m[2]);
    return ids;
}

function idsDelHtml(html) {
    const ids = new Set();
    const re = /\sid\s*=\s*["']([^"']+)["']/g;
    let m;
    while ((m = re.exec(html))) ids.add(m[1]);
    return ids;
}

// Nombres de función invocados desde on*="..." y data-load="..."
function llamadasDesdeHtml(html) {
    const llamadas = [];
    const reOn = /\son[a-z]+\s*=\s*"([^"]*)"|\son[a-z]+\s*=\s*'([^']*)'/g;
    let m;
    while ((m = reOn.exec(html))) {
        const cuerpo = m[1] ?? m[2] ?? "";
        const reFn = /(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g;
        let f;
        while ((f = reFn.exec(cuerpo))) {
            if (!["if", "return", "function", "alert", "confirm", "event"].includes(f[2])) llamadas.push(f[2]);
        }
    }
    const reLoad = /\sdata-load\s*=\s*["']([^"']+)["']/g;
    while ((m = reLoad.exec(html))) llamadas.push(m[1]);
    return llamadas;
}

// Globales del navegador que pueden aparecer en handlers sin estar definidas en nuestros scripts
const GLOBALES_NAVEGADOR = new Set(["history", "location", "navigator", "document", "window", "console", "setTimeout"]);

function comprobarPagina(rutaHtml) {
    const nombre = relative(publicDir, rutaHtml);
    const html = leer(rutaHtml);
    const paginaDir = dirname(rutaHtml);

    // 1. Assets locales
    const scripts = [];
    const reScript = /<script\b[^>]*\ssrc\s*=\s*["']([^"']+)["'][^>]*>/g;
    let m;
    while ((m = reScript.exec(html))) {
        const ruta = resolverLocal(m[1], paginaDir);
        if (!ruta) continue;
        if (!existsSync(ruta)) errores.push(`${nombre}: no existe el script ${m[1]}`);
        else if (ruta.endsWith(".js") && !ruta.startsWith(nodeModules)) scripts.push(ruta);
    }
    const reLink = /<link\b[^>]*\shref\s*=\s*["']([^"']+)["'][^>]*>/g;
    while ((m = reLink.exec(html))) {
        const ruta = resolverLocal(m[1], paginaDir);
        if (ruta && !existsSync(ruta)) errores.push(`${nombre}: no existe el recurso ${m[1]}`);
    }
    // @import / url() de los CSS enlazados que apuntan a ficheros locales
    const reHrefCss = /<link\b[^>]*rel\s*=\s*["']stylesheet["'][^>]*href\s*=\s*["']([^"']+)["']|<link\b[^>]*href\s*=\s*["']([^"']+\.css)["']/g;
    while ((m = reHrefCss.exec(html))) {
        const ruta = resolverLocal(m[1] ?? m[2], paginaDir);
        if (!ruta || !existsSync(ruta) || ruta.startsWith(nodeModules)) continue;
        const css = leer(ruta);
        const reImp = /@import\s+(?:url\()?\s*["']?([^"')\s]+)["']?\s*\)?/g;
        let i;
        while ((i = reImp.exec(css))) {
            const r = resolverLocal(i[1], dirname(ruta));
            if (r && !existsSync(r)) errores.push(`${nombre}: ${relative(publicDir, ruta)} importa ${i[1]} que no existe`);
        }
    }

    // 2. Código de la página (scripts externos + inline)
    const codigos = scripts.map((ruta) => ({ ruta, codigo: quitarComentariosJs(leer(ruta)) }));
    const reInline = /<script\b(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g;
    while ((m = reInline.exec(html))) {
        if (m[1].trim()) codigos.push({ ruta: `${nombre} (inline)`, codigo: quitarComentariosJs(m[1]) });
    }

    // 3. Declaraciones duplicadas entre scripts
    const vistos = new Map();
    for (const { ruta, codigo } of codigos) {
        const locales = new Set();
        for (const { tipo, nombre: n } of declaracionesNivelSuperior(codigo)) {
            if (locales.has(n)) continue;
            locales.add(n);
            if (vistos.has(n)) {
                const previo = vistos.get(n);
                const ambosVar = tipo === "var" && previo.tipo === "var";
                if (!ambosVar) {
                    errores.push(`${nombre}: '${n}' declarado en ${rel(previo.ruta)} y en ${rel(ruta)} (ámbito global compartido)`);
                }
            } else {
                vistos.set(n, { ruta, tipo });
            }
        }
    }

    // 4. Ids usados por el JS
    const idsHtml = idsDelHtml(html);
    const idsCreados = new Set();
    for (const { codigo } of codigos) for (const id of idsCreadosEnJs(codigo)) idsCreados.add(id);
    for (const { ruta, codigo } of codigos) {
        for (const id of idsUsadosEnJs(codigo)) {
            if (!idsHtml.has(id) && !idsCreados.has(id)) {
                errores.push(`${nombre}: ${rel(ruta)} usa #${id} que no existe en el HTML`);
            }
        }
    }

    // 5. Funciones llamadas desde el HTML
    const definidas = new Set();
    for (const { codigo } of codigos) for (const f of funcionesDefinidas(codigo)) definidas.add(f);
    for (const fn of llamadasDesdeHtml(html)) {
        if (!definidas.has(fn) && !GLOBALES_NAVEGADOR.has(fn)) {
            errores.push(`${nombre}: el HTML llama a ${fn}() pero ningún script de la página la define`);
        }
    }

    // 6. Funciones llamadas desde HTML generado en JS: onclick="fn(...)" dentro de plantillas
    for (const { ruta, codigo } of codigos) {
        const reGen = /\bon(?:click|change|input)\s*=\s*\\?["'`]?\s*([A-Za-z_$][\w$]*)\s*\(/g;
        let g;
        while ((g = reGen.exec(codigo))) {
            if (!definidas.has(g[1]) && !GLOBALES_NAVEGADOR.has(g[1])) {
                errores.push(`${nombre}: ${rel(ruta)} genera on*="${g[1]}(...)" pero ningún script de la página la define`);
            }
        }
    }

    return { nombre, scripts: scripts.length, ids: idsHtml.size };
}

function rel(ruta) {
    return ruta.includes(publicDir) ? relative(publicDir, ruta).replaceAll("\\", "/") : ruta;
}

function listarJs(dir) {
    const res = [];
    for (const entrada of readdirSync(dir)) {
        const ruta = join(dir, entrada);
        if (statSync(ruta).isDirectory()) res.push(...listarJs(ruta));
        else if (entrada.endsWith(".js")) res.push(ruta);
    }
    return res;
}

// --- Reglas de CSS ---
// - Colores literales (#hex, rgb(), hsl()) solo en css/tokens.css: el resto usa var(--...).
// - !important solo en líneas marcadas con /* permitido */ (p. ej. prefers-reduced-motion).
// - Desde JS, solo custom properties: elemento.style.setProperty('--x', ...).
function comprobarCss() {
  const cssDir = join(publicDir, "css");
  for (const nombre of readdirSync(cssDir).filter((f) => f.endsWith(".css"))) {
    const lineas = leer(join(cssDir, nombre)).split(/\r?\n/);
    let enComentario = false;
    lineas.forEach((lineaOriginal, i) => {
      // Quitar comentarios para no contar lo que se menciona en ellos
      let linea = "";
      let resto = lineaOriginal;
      while (resto.length) {
        if (enComentario) {
          const fin = resto.indexOf("*/");
          if (fin < 0) { resto = ""; break; }
          resto = resto.slice(fin + 2);
          enComentario = false;
        } else {
          const ini = resto.indexOf("/*");
          if (ini < 0) { linea += resto; break; }
          linea += resto.slice(0, ini);
          resto = resto.slice(ini + 2);
          enComentario = true;
        }
      }
      const donde = `css/${nombre}:${i + 1}`;
      if (nombre !== "tokens.css" && /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/.test(linea)) {
        errores.push(`${donde}: color literal; usa un token de css/tokens.css → ${lineaOriginal.trim()}`);
      }
      if (/!important/.test(linea) && !/\/\*\s*permitido\s*\*\//.test(lineaOriginal)) {
        errores.push(`${donde}: !important no permitido (usa @layer) → ${lineaOriginal.trim()}`);
      }
    });
  }
  for (const ruta of listarJs(join(publicDir, "js"))) {
    leer(ruta).split(/\r?\n/).forEach((linea, i) => {
      if (/\.style\.(?!setProperty\(\s*['"`]--)[a-zA-Z]+/.test(linea)) {
        errores.push(`${rel(ruta)}:${i + 1}: estilo puesto desde JS; usa clases, hidden o una custom property → ${linea.trim()}`);
      }
    });
  }
}

// --- main ---
const paginas = readdirSync(publicDir).filter((f) => f.endsWith(".html"));
const resumen = paginas.map((p) => comprobarPagina(join(publicDir, p)));
comprobarCss();

for (const ruta of listarJs(join(publicDir, "js"))) {
    const r = spawnSync(process.execPath, ["--check", ruta], { encoding: "utf8" });
    if (r.status !== 0) errores.push(`node --check ${rel(ruta)}:\n${(r.stderr || r.stdout).trim()}`);
}

if (!hayNodeModules) {
    avisos.push("server/node_modules no existe en el host: no se comprueban los recursos /vendor/* (están en el volumen del contenedor).");
}

for (const r of resumen) console.log(`· ${r.nombre}: ${r.scripts} scripts, ${r.ids} ids`);
for (const a of avisos) console.log(`AVISO: ${a}`);
if (errores.length) {
    console.log(`\n${errores.length} error(es):`);
    for (const e of errores) console.log(`  ✗ ${e}`);
    process.exit(1);
}
console.log("\nOK: contratos HTML↔JS correctos.");
