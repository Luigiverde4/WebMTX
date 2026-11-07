#requires -Version 5.1
<#
.SYNOPSIS
    Recibe un stream WHEP de MediaMTX con GStreamer y lo muestra por pantalla.

.DESCRIPTION
    El stream de MediaMTX trae normalmente 2 tracks (vIdeo H264 + audio Opus),
    asI que whepclientsrc expone DOS pads dinAmicos. Hay que consumir AMBOS o el
    pipeline muere con "not-linked". Este script ya enruta vIdeo y audio.

.PARAMETER Cam
    Nombre del path/stream en MediaMTX. Por defecto: cam1

.PARAMETER ServerHost
    Host del servidor MediaMTX. Por defecto: localhost
    (desde OTRO ordenador, usa la IP LAN del servidor, p.ej. 192.168.1.82)

.PARAMETER Port
    Puerto WebRTC/HTTPS de MediaMTX. Por defecto: 8889

.PARAMETER NoAudio
    Descarta el audio (lo manda a fakesink) en vez de sacarlo por altavoces.

.PARAMETER Debug
    Activa logs de ICE/WebRTC para diagnosticar conexiones.

.EXAMPLE
    .\whep-view.ps1
    .\whep-view.ps1 -Cam cam2
    .\whep-view.ps1 -Cam cam1 -ServerHost 192.168.1.82
    .\whep-view.ps1 -Cam cam1 -NoAudio
#>
param(
    [string]$Cam        = "cam1",
    [string]$ServerHost = "localhost",
    [int]   $Port       = 8889,
    [switch]$NoAudio,
    [switch]$LowLatency,
    [switch]$Debug
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command gst-launch-1.0 -ErrorAction SilentlyContinue)) {
    Write-Error "gst-launch-1.0 no estA en el PATH. Instala GStreamer o aNAdelo al PATH."
    exit 1
}

$endpoint = "https://${ServerHost}:${Port}/${Cam}/whep"

# whepclientsrc: en baja latencia, sin retransmisiones (NACK/RTX)
$srcArgs = @('whepclientsrc', 'name=src', "signaller::whep-endpoint=$endpoint")
if ($LowLatency) { $srcArgs += 'do-retransmission=false' }

# Cola y sink de vIdeo
if ($LowLatency) {
    $videoQueue = @('queue', 'max-size-time=0', 'max-size-bytes=0', 'max-size-buffers=2', 'leaky=downstream')
    $videoSink  = @('autovideosink', 'sync=false')
} else {
    $videoQueue = @('queue')
    $videoSink  = @('autovideosink')
}

# Rama de audio: a los altavoces o descartado
$audioBranch = if ($NoAudio) {
    @('src.', '!', 'queue', '!', 'fakesink', 'sync=false')
} elseif ($LowLatency) {
    @('src.', '!', 'queue', 'leaky=downstream', '!', 'audioconvert', '!', 'audioresample', '!', 'autoaudiosink', 'sync=false')
} else {
    @('src.', '!', 'queue', '!', 'audioconvert', '!', 'audioresample', '!', 'autoaudiosink')
}

$gstArgs = @('-e') + $srcArgs +
    @('src.', '!') + $videoQueue + @('!', 'videoconvert', '!') + $videoSink +
    $audioBranch

if ($Debug) {
    $env:GST_DEBUG = "webrtcbin:4,whepclientsrc:4,webrtcnice:4"
} else {
    $env:GST_DEBUG = "1"
}

Write-Host "Conectando a: $endpoint" -ForegroundColor Cyan
Write-Host "Audio: $([bool](-not $NoAudio))   Ctrl+C para salir" -ForegroundColor DarkGray
Write-Host ""

& gst-launch-1.0 @gstArgs
