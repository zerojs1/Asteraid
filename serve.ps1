#requires -Version 5.0
[CmdletBinding()]
param(
  [int]$Port = 8080,
  [switch]$Open
)

$ErrorActionPreference = 'Stop'

# Serve from the script's directory regardless of where it's launched
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$url = "http://127.0.0.1:$Port/ast.html"

function Start-Server {
  if (Get-Command py -ErrorAction SilentlyContinue) {
    Write-Host "Starting Python (py) http.server on port $Port ..."
    if ($Open) { Start-Process $url }
    & py -m http.server $Port
    return
  }
  if (Get-Command python -ErrorAction SilentlyContinue) {
    Write-Host "Starting Python http.server on port $Port ..."
    if ($Open) { Start-Process $url }
    & python -m http.server $Port
    return
  }
  if (Get-Command npx -ErrorAction SilentlyContinue) {
    Write-Host "Starting Node http-server via npx on port $Port ..."
    if ($Open) { Start-Process $url }
    & npx http-server -p $Port
    return
  }
  throw "Python or Node (npx) not found. Install Python (winget install Python.Python.3) or Node.js (https://nodejs.org/) and try again."
}

Write-Host "Serving Asteraid from '$root'"
Write-Host "Open: $url"
Start-Server
