# Exporta grabaciones desde el volumen Docker (recordings_volume) a una carpeta de Windows.
#
# Las grabaciones viven en un volumen nativo de Docker (I/O rapido, repeticiones al
# instante) y NO se ven directamente en el explorador de Windows. Este script las saca
# a disco cuando quieras archivarlas o llevartelas.
#
# Uso (desde cualquier carpeta):
#   .\scripts\exportar-grabaciones.ps1                      # TODO -> mediamtx\grabaciones_exportadas
#   .\scripts\exportar-grabaciones.ps1 -Path cam1           # solo el stream 'cam1'
#   .\scripts\exportar-grabaciones.ps1 -Destino D:\copias   # a otra carpeta

param(
    [string]$Path = "",
    [string]$Destino = ""
)

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot

# Id del contenedor del servicio 'mediamtx' de este proyecto (independiente de su nombre).
$contenedor = (docker compose --project-directory $raiz ps -q mediamtx 2>$null | Select-Object -First 1)
if (-not $contenedor) {
    Write-Error "El servicio 'mediamtx' no esta en marcha. Arranca con: docker compose up -d"
    exit 1
}

# Carpeta destino por defecto: mediamtx\grabaciones_exportadas junto al proyecto.
if (-not $Destino) {
    $Destino = Join-Path $raiz "mediamtx\grabaciones_exportadas"
}
New-Item -ItemType Directory -Force -Path $Destino | Out-Null

if ($Path) {
    $origen = "${contenedor}:/recordings/$Path"
    Write-Host "Exportando stream '$Path' -> $Destino"
} else {
    $origen = "${contenedor}:/recordings/."
    Write-Host "Exportando TODAS las grabaciones -> $Destino"
}

docker cp $origen $Destino
if ($LASTEXITCODE -ne 0) {
    Write-Error "docker cp fallo ($LASTEXITCODE). Comprueba que el stream '$Path' tiene grabaciones."
    exit $LASTEXITCODE
}
Write-Host "Hecho. Archivos en: $Destino"
