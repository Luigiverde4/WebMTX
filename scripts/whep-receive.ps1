#requires -Version 5.1
<#
.SYNOPSIS
    Reproduce un stream WHEP de MediaMTX con GStreamer.

.PARAMETER IP
    IP (o host) del servidor MediaMTX. Obligatorio. Ej: 192.168.1.82

.PARAMETER Endpoint
    Nombre del stream/path en MediaMTX. Por defecto: cam1

.PARAMETER Port
    Puerto WebRTC/HTTPS. Por defecto: 8889

.PARAMETER NoAudio
    Descarta el audio (solo vIdeo).

.NOTES
    Siempre funciona en baja latencia (sin retransmisiones, sinks sin sync,
    colas con leaky=downstream).

.EXAMPLE
    .\whep-receive.ps1 -IP 192.168.1.82 -Endpoint cam1
    .\whep-receive.ps1 -IP 192.168.1.82 -Endpoint cam1 -NoAudio
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$IP,
    [string]$Endpoint   = "cam1",
    [int]   $Port       = 8889,
    [switch]$NoAudio
)

$ErrorActionPreference = "Stop"

# Localizar gst-launch-1.0 (PATH o instalacion por defecto)
$gst = (Get-Command gst-launch-1.0 -ErrorAction SilentlyContinue).Source
if (-not $gst) {
    $def = "C:\Program Files\gstreamer\1.0\msvc_x86_64\bin\gst-launch-1.0.exe"
    if (Test-Path $def) { $gst = $def } else {
        Write-Error "No se encontro gst-launch-1.0. Instala GStreamer (runtime) desde https://gstreamer.freedesktop.org/download/ y aNAdelo al PATH."
        exit 1
    }
}

$url = "https://${IP}:${Port}/${Endpoint}/whep"

# Origen: el stream trae 2 tracks (video + audio) -> hay que consumir AMBOS pads.
# Base: baja latencia (sin retransmisiones).
$src = @('whepclientsrc', 'name=src', 'do-retransmission=false', "signaller::whep-endpoint=$url")

$vq = @('queue', 'max-size-time=0', 'max-size-bytes=0', 'max-size-buffers=2', 'leaky=downstream')
$vsink = @('autovideosink', 'sync=false')

if ($NoAudio) {
    $audio = @('src.', '!', 'queue', '!', 'fakesink', 'sync=false')
} else {
    $audio = @('src.', '!', 'queue', 'leaky=downstream', '!', 'audioconvert', '!', 'audioresample', '!', 'autoaudiosink', 'sync=false')
}

$gstArgs = @('-e') + $src +
    @('src.', '!') + $vq + @('!', 'videoconvert', '!') + $vsink +
    $audio

Write-Host "Conectando a: $url" -ForegroundColor Cyan
Write-Host "(Ctrl+C para salir)`n" -ForegroundColor DarkGray

& $gst @gstArgs
