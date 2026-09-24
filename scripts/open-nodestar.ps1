# Waits for the Nodestar dev server, then opens it as a Chrome app window
# (a plain browser tab when Chrome is not installed). Started in the
# background by Run-Nodestar.cmd so the server keeps the console.
param([string]$Url = 'http://localhost:5199/', [int]$Port = 5199)
$ready = $false
for ($i = 0; $i -lt 240 -and -not $ready; $i++) {
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $client.Connect('127.0.0.1', $Port)
    $client.Close()
    $ready = $true
  } catch {
    Start-Sleep -Milliseconds 500
  }
}
if (-not $ready) { exit 1 }
$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($chrome) { Start-Process $chrome -ArgumentList "--app=$Url" }
else { Start-Process $Url }
