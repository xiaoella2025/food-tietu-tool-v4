# Food Tietu Tool - PowerShell Static File Server
# No Python, Node, or Git required. Windows built-in PowerShell only.

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Ports = @(7777, 7778)
$Port = $null

foreach ($p in $Ports) {
    $used = $false
    try {
        $connections = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
        foreach ($ep in $connections) { if ($ep.Port -eq $p) { $used = $true; break } }
    } catch {}
    if (-not $used) { $Port = $p; break }
}

if ($null -eq $Port) {
    Write-Host "[ERROR] Ports 7777 and 7778 are both in use. Please free a port and retry."
    Read-Host "Press Enter to exit"
    exit 1
}

$Mime = @{
    ".html" = "text/html; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".svg"  = "image/svg+xml"
    ".txt"  = "text/plain; charset=utf-8"
    ".md"   = "text/plain; charset=utf-8"
    ".ico"  = "image/x-icon"
}

$Listener = New-Object System.Net.HttpListener
$Listener.Prefixes.Add("http://127.0.0.1:$Port/")

try {
    $Listener.Start()
} catch {
    Write-Host "[ERROR] Failed to start server on port $Port"
    Write-Host $_.Exception.Message
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "============================================"
Write-Host "Food Tietu Tool - Assistant Trial V1"
Write-Host "============================================"
Write-Host ""
Write-Host "Server running at http://127.0.0.1:$Port/"
Write-Host ""
Write-Host "Do not close this window while using the tool."
Write-Host "============================================"
Write-Host ""

Start-Process "http://127.0.0.1:$Port/"

while ($Listener.IsListening) {
    try {
        $ctx = $Listener.GetContext()
    } catch {
        break
    }

    $req  = $ctx.Request
    $resp = $ctx.Response

    $urlPath = $req.Url.AbsolutePath
    if ($urlPath -eq "/" -or $urlPath -eq "") { $urlPath = "/index.html" }

    # Normalize path separators and prevent directory traversal
    $relPath = $urlPath.TrimStart("/").Replace("/", [System.IO.Path]::DirectorySeparatorChar)
    $fullPath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($RootDir, $relPath))

    # Security: ensure path stays within RootDir
    if (-not $fullPath.StartsWith($RootDir)) {
        $resp.StatusCode = 403
        $resp.Close()
        continue
    }

    if (Test-Path $fullPath -PathType Leaf) {
        $ext = [System.IO.Path]::GetExtension($fullPath).ToLower()
        $ct = if ($Mime.ContainsKey($ext)) { $Mime[$ext] } else { "application/octet-stream" }
        try {
            $bytes = [System.IO.File]::ReadAllBytes($fullPath)
            $resp.ContentType = $ct
            $resp.ContentLength64 = $bytes.Length
            $resp.OutputStream.Write($bytes, 0, $bytes.Length)
        } catch {
            $resp.StatusCode = 500
        }
    } else {
        $resp.StatusCode = 404
        $body = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
        $resp.ContentLength64 = $body.Length
        $resp.OutputStream.Write($body, 0, $body.Length)
    }

    try { $resp.OutputStream.Close() } catch {}
    try { $resp.Close() } catch {}
}

$Listener.Stop()
