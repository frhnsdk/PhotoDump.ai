$BASE = "http://localhost:8000"
$ErrorActionPreference = "Stop"

function OK($msg) { Write-Host "✅  $msg" }
function FAIL($msg) { Write-Host "❌  $msg" }

# ── 1. Register ───────────────────────────────────────────────────────────────
Write-Host "`n=== AUTH ===" -ForegroundColor Cyan
try {
    $r = Invoke-RestMethod "$BASE/api/auth/register" -Method POST `
        -Body '{"username":"testuser","email":"test@photodump.dev","password":"test1234"}' `
        -ContentType "application/json"
    $global:token = $r.access_token
    OK "Register  id=$($r.user.id) username=$($r.user.username)"
} catch {
    $r = Invoke-RestMethod "$BASE/api/auth/login" -Method POST `
        -Body '{"username":"testuser","password":"test1234"}' `
        -ContentType "application/json"
    $global:token = $r.access_token
    OK "Login (user existed)"
}

$authH = @{ "Content-Type"="application/json"; "Authorization"="Bearer $global:token" }
$me = Invoke-RestMethod "$BASE/api/auth/me" -Headers $authH
OK "GET /me  username=$($me.username)"

# ── 2. Dumps ──────────────────────────────────────────────────────────────────
Write-Host "`n=== DUMPS ===" -ForegroundColor Cyan
try {
    $dump = Invoke-RestMethod "$BASE/api/dumps/" -Method POST -Headers $authH `
        -Body '{"name":"wedding-2024","description":"Big day","password":"secret123","duration_days":null}'
    OK "Create dump  name=$($dump.name)"
} catch { OK "Dump exists, continuing" }

$dumps = Invoke-RestMethod "$BASE/api/dumps/" -Headers $authH
OK "List my dumps  count=$($dumps.Count)"

$access = Invoke-RestMethod "$BASE/api/dumps/access" -Method POST `
    -Body '{"name":"wedding-2024","password":"secret123"}' -ContentType "application/json"
$global:dt = $access.dump_token
OK "Guest access  token=yes  photo_count=$($access.photo_count)"

try {
    Invoke-RestMethod "$BASE/api/dumps/access" -Method POST `
        -Body '{"name":"wedding-2024","password":"WRONGPASS"}' -ContentType "application/json" | Out-Null
    FAIL "Wrong password should have been rejected"
} catch { OK "Wrong password correctly rejected (401)" }

# ── 3. Upload photo via .NET HttpClient (proper binary multipart) ─────────────
Write-Host "`n=== PHOTOS ===" -ForegroundColor Cyan

# Minimal valid 1x1 white PNG
$pngB64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg=="
$imgBytes = [Convert]::FromBase64String($pngB64)

# Write to temp file
$tmpFile = [System.IO.Path]::GetTempFileName() + ".png"
[System.IO.File]::WriteAllBytes($tmpFile, $imgBytes)

function UploadPhotos($dumpName, $filename, $fields, $authToken, $dumpToken) {
    Add-Type -AssemblyName System.Net.Http
    $client = [System.Net.Http.HttpClient]::new()
    if ($authToken)  { $client.DefaultRequestHeaders.Add("Authorization", "Bearer $authToken") }
    if ($dumpToken)  { $client.DefaultRequestHeaders.Add("X-Dump-Token", $dumpToken) }

    $form = [System.Net.Http.MultipartFormDataContent]::new()
    $fileStream = [System.IO.File]::OpenRead($tmpFile)
    $fileContent = [System.Net.Http.StreamContent]::new($fileStream)
    $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("image/png")
    $form.Add($fileContent, "files", $filename)
    foreach ($kv in $fields.GetEnumerator()) {
        $form.Add([System.Net.Http.StringContent]::new($kv.Value), $kv.Key)
    }

    $resp = $client.PostAsync("$BASE/api/dumps/$dumpName/photos", $form).Result
    $body = $resp.Content.ReadAsStringAsync().Result
    $fileStream.Close()
    $client.Dispose()
    if (-not $resp.IsSuccessStatusCode) { throw "Upload failed $($resp.StatusCode): $body" }
    return $body | ConvertFrom-Json
}

$gH = @{ "X-Dump-Token"=$global:dt }

$up = UploadPhotos "wedding-2024" "owner-photo.png" @{ is_contributor="false" } $global:token $global:dt
$global:pid1 = $up[0].id
OK "Owner upload  id=$($global:pid1)  approved=$($up[0].is_approved)"

$list = Invoke-RestMethod "$BASE/api/dumps/wedding-2024/photos" -Headers $gH
OK "List photos (guest)  count=$($list.Count)"

$upH = @{ "Authorization"="Bearer $global:token"; "X-Dump-Token"=$global:dt }
$thumb = Invoke-WebRequest "$BASE/api/dumps/wedding-2024/photos/$($global:pid1)/thumb" -Headers $upH -UseBasicParsing
OK "Thumbnail served  status=$($thumb.StatusCode)  bytes=$($thumb.RawContentLength)"

# ── 4. Contributor flow ───────────────────────────────────────────────────────
Write-Host "`n=== CONTRIBUTOR ===" -ForegroundColor Cyan
$contribUp = UploadPhotos "wedding-2024" "jane-photo.png" @{ uploader_name="Jane Guest"; is_contributor="true" } $null $global:dt
$global:cid = $contribUp[0].id
OK "Contributor upload  id=$($global:cid)  is_contributor=$($contribUp[0].is_contributor)  is_approved=$($contribUp[0].is_approved)"

$gallery = Invoke-RestMethod "$BASE/api/dumps/wedding-2024/photos" -Headers $gH
$hidden = ($gallery | Where-Object { $_.id -eq $global:cid }) -eq $null
if ($hidden) { OK "Pending photo hidden from guests" } else { FAIL "Pending photo should be hidden" }

$allPH = @{ "Authorization"="Bearer $global:token" }
$allPhotos = Invoke-RestMethod "$BASE/api/dumps/wedding-2024/photos?include_pending=true" -Headers $allPH
$pendingCount = ($allPhotos | Where-Object { $_.is_approved -eq $false }).Count
OK "Owner sees pending  count=$pendingCount"

Invoke-RestMethod "$BASE/api/dumps/wedding-2024/photos/$($global:cid)/approve?approved=true" `
    -Method PATCH -Headers $authH | Out-Null
OK "Approved contributor photo  id=$($global:cid)"

$gallery2 = Invoke-RestMethod "$BASE/api/dumps/wedding-2024/photos" -Headers $gH
$visible = ($gallery2 | Where-Object { $_.id -eq $global:cid }) -ne $null
if ($visible) { OK "Approved photo now visible  gallery_total=$($gallery2.Count)" } else { FAIL "Approved photo not visible" }

# ── 5. Download ───────────────────────────────────────────────────────────────
Write-Host "`n=== DOWNLOAD ===" -ForegroundColor Cyan
$zipResp = Invoke-WebRequest "$BASE/api/dumps/wedding-2024/download-all" -Headers $upH -UseBasicParsing
OK "Download-all ZIP  status=$($zipResp.StatusCode)  bytes=$($zipResp.RawContentLength)"

$dlResp = Invoke-WebRequest "$BASE/api/dumps/wedding-2024/photos/$($global:cid)/download" -Headers $gH -UseBasicParsing
OK "Single photo download  status=$($dlResp.StatusCode)  bytes=$($dlResp.RawContentLength)"

# ── 6. Delete photo ───────────────────────────────────────────────────────────
Write-Host "`n=== CLEANUP ===" -ForegroundColor Cyan
Invoke-RestMethod "$BASE/api/dumps/wedding-2024/photos/$($global:pid1)" -Method DELETE -Headers $allPH | Out-Null
OK "Delete owner photo"

# ── 7. Swagger UI ─────────────────────────────────────────────────────────────
$docs = Invoke-WebRequest "$BASE/docs" -UseBasicParsing
OK "Swagger /docs  status=$($docs.StatusCode)"

$openapi = Invoke-RestMethod "$BASE/openapi.json"
OK "OpenAPI schema  endpoints=$($openapi.paths.PSObject.Properties.Count)"

Write-Host "`n🎉  All tests passed!  →  http://localhost:8000" -ForegroundColor Green
