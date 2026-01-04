$ErrorActionPreference = "Stop"

$openmsxExe = "C:\Program Files\openMSX\openmsx.exe"
$glassJar = "C:\Users\salam\Documents\Programacion\Mideas\server\glass.jar"
$asmFile = "test.asm"
$romFile = "test.rom"

# Close any running openMSX instances to release the ROM file.
Get-Process -Name "openmsx" -ErrorAction SilentlyContinue | Stop-Process -Force

& java -jar $glassJar $asmFile $romFile

& $openmsxExe $romFile
