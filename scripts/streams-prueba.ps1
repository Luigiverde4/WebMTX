#requires -Version 7
<#
.SYNOPSIS
    Publica streams de prueba en MediaMTX con ffmpeg (sin cámaras reales) y los relanza si caen.

.DESCRIPTION
    Cada stream es un patrón sintético H264 + Opus publicado por RTSP:
      cam1 -> testsrc (lleva un contador de segundos, útil para comprobar offsets de repetición)
      cam2 -> barras SMPTE HD
      cam3, cam4... -> testsrc2
    Si MediaMTX se reinicia, ffmpeg termina y el script lo vuelve a lanzar a los 2 s.
    Ctrl+C para parar.

.EXAMPLE
    pwsh .\scripts\streams-prueba.ps1
    pwsh .\scripts\streams-prueba.ps1 -Streams cam1,cam2,movil -Servidor 192.168.1.82
#>
param(
    [string[]]$Streams = @("cam1", "cam2"),
    [string]$Servidor = "localhost",
    [int]$Puerto = 8554
)

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    Write-Error "No se encontró ffmpeg en el PATH."
    exit 1
}

$fuentes = @{ 0 = "testsrc=size=1280x720:rate=30"; 1 = "smptehdbars=size=1280x720:rate=30" }
$trabajos = for ($i = 0; $i -lt $Streams.Count; $i++) {
    $nombre = $Streams[$i]
    $video = $fuentes[$i] ?? "testsrc2=size=1280x720:rate=30"
    $tono = 440 * ($i + 1)
    $url = "rtsp://${Servidor}:${Puerto}/$nombre"
    Start-ThreadJob -Name $nombre -ArgumentList $video, $tono, $url, $nombre -ScriptBlock {
        param($video, $tono, $url, $nombre)
        while ($true) {
            & ffmpeg -hide_banner -loglevel error -re `
                -f lavfi -i $video -f lavfi -i "sine=frequency=${tono}:sample_rate=48000" `
                -c:v libx264 -preset ultrafast -tune zerolatency -profile:v baseline -bf 0 -g 30 -pix_fmt yuv420p -b:v 2000k `
                -c:a libopus -b:a 64k -ac 2 -f rtsp -rtsp_transport tcp $url 2>&1 | Out-Null
            Write-Output "[$nombre] ffmpeg terminó ($LASTEXITCODE); reintento en 2 s"
            Start-Sleep -Seconds 2
        }
    }
    Write-Host "Publicando $url"
}

try {
    while ($true) {
        $trabajos | Receive-Job | ForEach-Object { Write-Host $_ -ForegroundColor DarkYellow }
        Start-Sleep -Seconds 2
    }
} finally {
    $trabajos | Stop-Job -PassThru | Remove-Job -Force
    Get-Process ffmpeg -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match "rtsp://${Servidor}:${Puerto}/" } | Stop-Process -Force
}
