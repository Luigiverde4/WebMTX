#requires -Version 5.1
<#
.SYNOPSIS
    Genera los certificados TLS del servidor con mkcert.

.DESCRIPTION
    Crea server\cert.pem y server\key.pem (los ficheros que cargan tanto el
    servidor Node como MediaMTX) usando mkcert. Siempre incluye localhost,
    127.0.0.1 y ::1, ademas de las IPs de WEBRTC_HOSTS en el fichero .env de la
    raiz del repo (o, si no hay .env, las de webrtcAdditionalHosts en
    mediamtx\mediamtx.yml). Se pueden anadir IPs/hosts extra con -IP.

    En una red nueva basta con -IPsLocales: WEBRTC_HOSTS es opcional (las paginas
    de WebMTX anuncian ellas mismas la IP con la que se abrieron).

.PARAMETER IP
    Una o varias IPs o hosts adicionales que cubrira el certificado.
    Ej: -IP 192.168.1.46            (una)
        -IP 192.168.1.46,10.0.0.5   (varias, desde una sesion de PowerShell)

.PARAMETER IPsLocales
    Anade tambien las IPv4 actuales de este equipo (sin loopback).

.PARAMETER SinConfig
    No leer las IPs del .env ni de mediamtx\mediamtx.yml.

.PARAMETER SoloListar
    Muestra los hosts que cubriria el certificado y termina, sin generar nada.

.PARAMETER Install
    Ejecuta antes 'mkcert -install' para instalar la CA local en el almacen de
    confianza del sistema (solo hace falta la primera vez en cada equipo).

.PARAMETER Force
    Sobrescribe cert.pem / key.pem si ya existen sin preguntar.

.EXAMPLE
    .\scripts\gen-certs.ps1 -SoloListar -IPsLocales
    .\scripts\gen-certs.ps1 -IPsLocales -Install
    .\scripts\gen-certs.ps1 -IP 192.168.1.46,192.168.1.47 -Force
#>
param(
    [string[]]$IP = @(),
    [switch]$IPsLocales,
    [switch]$SinConfig,
    [switch]$SoloListar,
    [switch]$Install,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

# Raiz del repo = carpeta padre de scripts\ (independiente del directorio actual)
$repoRoot  = Split-Path -Parent $PSScriptRoot
$serverDir = Join-Path $repoRoot "server"
if (-not (Test-Path $serverDir)) {
    Write-Error "No existe la carpeta '$serverDir'. El script debe estar en <repo>\scripts\."
    exit 1
}
$certFile = Join-Path $serverDir "cert.pem"
$keyFile  = Join-Path $serverDir "key.pem"

# --- Hosts que cubrira el certificado --------------------------------------

# 1. WEBRTC_HOSTS del .env (fuente principal); si no hay .env, el yml (versiones antiguas)
$ipsConfig = @()
$origenConfig = "ninguno"
if (-not $SinConfig) {
    $envFile = Join-Path $repoRoot ".env"
    $ymlFile = Join-Path $repoRoot "mediamtx\mediamtx.yml"
    if (Test-Path $envFile) {
        $linea = Get-Content $envFile | Where-Object { $_ -match '^\s*WEBRTC_HOSTS\s*=' } | Select-Object -First 1
        if ($linea) {
            $valor = ($linea -replace '^\s*WEBRTC_HOSTS\s*=\s*', '').Trim().Trim('"').Trim("'")
            $ipsConfig = $valor -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }
            $origenConfig = ".env (WEBRTC_HOSTS)"
        }
    }
    if (-not $ipsConfig -and (Test-Path $ymlFile)) {
        $linea = Get-Content $ymlFile | Where-Object { $_ -match '^\s*webrtcAdditionalHosts\s*:' } | Select-Object -First 1
        if ($linea) {
            $ipsConfig = [regex]::Matches($linea, "'([^']+)'|""([^""]+)""") | ForEach-Object {
                if ($_.Groups[1].Success) { $_.Groups[1].Value } else { $_.Groups[2].Value }
            }
            if ($ipsConfig) { $origenConfig = "mediamtx.yml (webrtcAdditionalHosts)" }
        }
    }
}

# 2. IPv4 actuales del equipo
$ipsEquipo = @()
if ($IPsLocales) {
    $ipsEquipo = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
        Select-Object -ExpandProperty IPAddress
}

# Lista final: loopback siempre + config + equipo + parametros (sin duplicados, sin vacios)
$hosts = @('localhost', '127.0.0.1', '::1') + $ipsConfig + $ipsEquipo + ($IP | Where-Object { $_ -and $_.Trim() })
$hosts = $hosts | ForEach-Object { $_.Trim() } | Where-Object { $_ } | Select-Object -Unique

if ($SoloListar) {
    Write-Host "IPs de configuracion leidas de: $origenConfig" -ForegroundColor DarkGray
    Write-Host "El certificado cubriria:" -ForegroundColor Cyan
    $hosts | ForEach-Object { Write-Host "  $_" }
    exit 0
}

# --- Generacion ---------------------------------------------------------------

# mkcert en el PATH
$mkcert = (Get-Command mkcert -ErrorAction SilentlyContinue).Source
if (-not $mkcert) {
    Write-Error "No se encontro mkcert en el PATH. Instalalo desde https://github.com/FiloSottile/mkcert/releases y anadelo al PATH."
    exit 1
}

# Evitar pisar certificados existentes salvo -Force
if ((Test-Path $certFile) -or (Test-Path $keyFile)) {
    if (-not $Force) {
        Write-Error "Ya existen cert.pem/key.pem en '$serverDir'. Usa -Force para sobrescribirlos."
        exit 1
    }
    Write-Host "Sobrescribiendo certificados existentes (-Force)." -ForegroundColor Yellow
}

# Instalar la CA local si se pide
if ($Install) {
    Write-Host "Instalando CA local de mkcert (mkcert -install)..." -ForegroundColor Cyan
    & $mkcert -install
}

Write-Host "IPs de configuracion leidas de: $origenConfig" -ForegroundColor DarkGray
Write-Host "Generando certificado para: $($hosts -join ', ')" -ForegroundColor Cyan

# mkcert escribe directamente a cert.pem / key.pem (sin renombrados manuales)
& $mkcert -cert-file $certFile -key-file $keyFile @hosts

if ($LASTEXITCODE -ne 0) {
    Write-Error "mkcert termino con error ($LASTEXITCODE)."
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Certificados generados:" -ForegroundColor Green
Write-Host "  $certFile"
Write-Host "  $keyFile"
Write-Host ""
Write-Host "En una red nueva, vuelve a generarlos con -IPsLocales para que cubran la IP nueva" -ForegroundColor DarkGray
Write-Host "y reinicia los servicios: docker compose up -d" -ForegroundColor DarkGray
