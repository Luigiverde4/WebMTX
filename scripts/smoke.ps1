#requires -Version 7
<#
.SYNOPSIS
    Prueba de humo del servidor: paginas, recursos, proxies de MediaMTX y control de repeticiones.

.DESCRIPTION
    - Pide cada pagina HTML de server\public y cada <script src>/<link href> local que referencia (200).
    - GET /api/mediamtx/v3/paths/list y /api/mediamtx/v3/recordings/list (JSON valido).
    - GET /api/playback/list?path=<Stream> si el stream tiene grabaciones.
    - Ciclo /api/replay/* (select -> current -> stop) y rechazo de URLs externas (si la ruta existe;
      con -RequiereReplay es obligatorio).
    - Opcional: comprueba que http:// redirige a https:// (-CompruebaRedireccion).

.EXAMPLE
    pwsh .\scripts\smoke.ps1
    pwsh .\scripts\smoke.ps1 -Base https://192.168.1.82 -Stream cam1 -RequiereReplay
#>
param(
    [string]$Base = "https://localhost",
    [string]$Stream = "cam1",
    [switch]$RequiereReplay,
    [switch]$CompruebaRedireccion
)

$ErrorActionPreference = "Stop"
$publicDir = Join-Path (Split-Path -Parent $PSScriptRoot) "server\public"
$fallos = [System.Collections.Generic.List[string]]::new()
$ok = 0

function Peticion([string]$url, [string]$metodo = "GET", $cuerpo = $null) {
    $p = @{ Uri = $url; Method = $metodo; SkipHttpErrorCheck = $true; TimeoutSec = 15; MaximumRedirection = 0 }
    if ($null -ne $cuerpo) { $p.Body = ($cuerpo | ConvertTo-Json -Compress); $p.ContentType = "application/json" }
    try { return Invoke-WebRequest @p } catch { return [pscustomobject]@{ StatusCode = 0; Content = $_.Exception.Message; Headers = @{} } }
}

function Esperar([string]$desc, [bool]$condicion, [string]$detalle = "") {
    if ($condicion) { $script:ok++; Write-Host "  ok  $desc" -ForegroundColor DarkGreen }
    else { $script:fallos.Add("$desc $detalle"); Write-Host "  !!  $desc $detalle" -ForegroundColor Red }
}

Write-Host "Paginas y recursos ($Base)" -ForegroundColor Cyan
$recursos = [System.Collections.Generic.HashSet[string]]::new()
foreach ($html in Get-ChildItem $publicDir -Filter *.html) {
    $r = Peticion "$Base/$($html.Name)"
    Esperar "GET /$($html.Name)" ($r.StatusCode -eq 200) "-> $($r.StatusCode)"
    $contenido = Get-Content $html.FullName -Raw
    foreach ($m in [regex]::Matches($contenido, '<(?:script|link)\b[^>]*\s(?:src|href)\s*=\s*["'']([^"'']+)["'']')) {
        $ref = $m.Groups[1].Value
        if ($ref -match '^(https?:)?//|^data:|^#') { continue }
        $abs = [Uri]::new([Uri]"$Base/$($html.Name)", $ref).AbsoluteUri
        [void]$recursos.Add($abs)
    }
}
foreach ($url in $recursos) {
    $r = Peticion $url
    Esperar "GET $(([Uri]$url).PathAndQuery)" ($r.StatusCode -eq 200) "-> $($r.StatusCode)"
}

Write-Host "Proxies de MediaMTX" -ForegroundColor Cyan
$r = Peticion "$Base/api/mediamtx/v3/paths/list"
$paths = $null
try { $paths = $r.Content | ConvertFrom-Json } catch {}
Esperar "GET /api/mediamtx/v3/paths/list" ($r.StatusCode -eq 200 -and $null -ne $paths.items) "-> $($r.StatusCode)"
if ($paths) { Write-Host "      paths ready: $(@($paths.items | Where-Object ready | ForEach-Object name) -join ', ')" -ForegroundColor DarkGray }

$r = Peticion "$Base/api/mediamtx/v3/recordings/list"
$grab = $null
try { $grab = $r.Content | ConvertFrom-Json } catch {}
Esperar "GET /api/mediamtx/v3/recordings/list" ($r.StatusCode -eq 200 -and $null -ne $grab.items) "-> $($r.StatusCode)"

if ($grab -and ($grab.items | Where-Object name -eq $Stream)) {
    $r = Peticion "$Base/api/playback/list?path=$Stream"
    $segs = $null
    try { $segs = $r.Content | ConvertFrom-Json } catch {}
    Esperar "GET /api/playback/list?path=$Stream" ($r.StatusCode -eq 200 -and @($segs).Count -gt 0) "-> $($r.StatusCode)"
} else {
    Write-Host "  --  /api/playback/list omitido: '$Stream' no tiene grabaciones" -ForegroundColor DarkYellow
}

Write-Host "Control de repeticiones (/api/replay)" -ForegroundColor Cyan
$r = Peticion "$Base/api/replay/current"
if ($r.StatusCode -eq 404 -and -not $RequiereReplay) {
    Write-Host "  --  /api/replay no existe en este servidor (omitido)" -ForegroundColor DarkYellow
} else {
    Esperar "GET /api/replay/current" ($r.StatusCode -eq 200) "-> $($r.StatusCode)"
    $inicio = (Get-Date).ToUniversalTime().AddSeconds(-30).ToString("yyyy-MM-ddTHH:mm:ssZ")
    $url = "/api/playback/get?duration=10&path=$Stream&start=$inicio"
    $r = Peticion "$Base/api/replay/select" "POST" @{ url = $url; seekOffset = 0; label = "smoke" }
    Esperar "POST /api/replay/select (valida)" ($r.StatusCode -eq 200) "-> $($r.StatusCode)"
    $actual = (Peticion "$Base/api/replay/current").Content | ConvertFrom-Json
    Esperar "estado = play con la url enviada" ($actual.cmd -eq "play" -and $actual.url -eq $url)
    $r = Peticion "$Base/api/replay/select" "POST" @{ url = "https://evil.example/x.mp4"; label = "x" }
    Esperar "POST /api/replay/select (url externa rechazada)" ($r.StatusCode -eq 400) "-> $($r.StatusCode)"
    $r = Peticion "$Base/api/replay/stop" "POST" @{}
    Esperar "POST /api/replay/stop" ($r.StatusCode -eq 200) "-> $($r.StatusCode)"
    $actual = (Peticion "$Base/api/replay/current").Content | ConvertFrom-Json
    Esperar "estado = stop" ($actual.cmd -eq "stop")
}

Write-Host "Momentos marcados compartidos (/api/marcados)" -ForegroundColor Cyan
$r = Peticion "$Base/api/marcados"
$marcas = $null
try { $marcas = ConvertFrom-Json $r.Content -NoEnumerate } catch {}
Esperar "GET /api/marcados (lista)" ($r.StatusCode -eq 200 -and $marcas -is [array]) "-> $($r.StatusCode)"
$r = Peticion "$Base/api/marcados" "POST" @{ stream = "../x"; iso = "2026-01-01T00:00:00Z" }
Esperar "POST /api/marcados (stream inválido rechazado)" ($r.StatusCode -eq 400) "-> $($r.StatusCode)"

if ($CompruebaRedireccion) {
    Write-Host "Redireccion HTTP" -ForegroundColor Cyan
    $http = $Base -replace '^https://', 'http://'
    $r = Peticion "$http/"
    Esperar "GET http:// -> 301 a https://" ($r.StatusCode -eq 301 -and "$($r.Headers.Location)" -like "https://*") "-> $($r.StatusCode)"
}

Write-Host ""
if ($fallos.Count) {
    Write-Host "$($fallos.Count) fallo(s), $ok ok" -ForegroundColor Red
    exit 1
}
Write-Host "OK: $ok comprobaciones" -ForegroundColor Green
