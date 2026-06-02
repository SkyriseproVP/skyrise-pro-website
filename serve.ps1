$root = $PSScriptRoot
$port = 3030
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "Skyrise Website running at http://localhost:$port"

$mime = @{
  '.html'=  'text/html; charset=utf-8'
  '.css' =  'text/css'
  '.js'  =  'application/javascript'
  '.png' =  'image/png'
  '.jpg' =  'image/jpeg'
  '.jpeg'=  'image/jpeg'
  '.svg' =  'image/svg+xml'
  '.mp4' =  'video/mp4'
  '.toml'=  'text/plain'
  '.ico' =  'image/x-icon'
}

while ($listener.IsListening) {
  $ctx  = $listener.GetContext()
  $req  = $ctx.Request
  $resp = $ctx.Response

  $urlPath = $req.Url.LocalPath
  if ($urlPath -eq '/' -or $urlPath -eq '') { $urlPath = '/index.html' }

  $filePath = Join-Path $root ($urlPath.TrimStart('/').Replace('/', '\'))

  if (-not (Test-Path $filePath -PathType Leaf)) {
    $filePath = Join-Path $root 'index.html'
  }

  $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
  $resp.ContentType = if ($mime[$ext]) { $mime[$ext] } else { 'application/octet-stream' }
  $resp.Headers.Add('Access-Control-Allow-Origin', '*')

  try {
    $bytes = [System.IO.File]::ReadAllBytes($filePath)
    $resp.ContentLength64 = $bytes.Length
    $resp.OutputStream.Write($bytes, 0, $bytes.Length)
  } catch {
    $resp.StatusCode = 500
  }
  $resp.OutputStream.Close()
}
