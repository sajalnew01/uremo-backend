param(
    [string]$BaseUrl = "http://localhost:5000",
    [string]$PublicMessage = "hello",
    [string]$AdminMessage = "hello",
    [string]$AdminJwt = $env:JARVISX_ADMIN_JWT,
    [switch]$StartServer,
    [int]$WaitSeconds = 12
)

$ErrorActionPreference = "Stop"

function Write-Section([string]$Title) {
    Write-Host "";
    Write-Host ("== " + $Title + " ==")
}

function Invoke-JsonPost([string]$Url, [hashtable]$Body, [hashtable]$Headers) {
    return Invoke-RestMethod -Method Post -Uri $Url -ContentType "application/json" -Headers $Headers -Body ($Body | ConvertTo-Json -Depth 10)
}

function Invoke-JsonGet([string]$Url, [hashtable]$Headers) {
    return Invoke-RestMethod -Method Get -Uri $Url -Headers $Headers
}

Write-Section "JarvisX Smoke"
Write-Host "BaseUrl: $BaseUrl"
Write-Host "StartServer: $StartServer"

$backendRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$serverProc = $null

try {
    if ($StartServer) {
        Write-Section "Starting backend"

        if (-not $env:GROQ_API_KEY -or $env:GROQ_API_KEY.Trim().Length -lt 10) {
            throw "GROQ_API_KEY is missing. Set `$env:GROQ_API_KEY before using -StartServer."
        }

        $stdout = Join-Path $backendRoot "jarvisx-smoke.server.out.log"
        $stderr = Join-Path $backendRoot "jarvisx-smoke.server.err.log"

        if (Test-Path $stdout) { Remove-Item -Force $stdout }
        if (Test-Path $stderr) { Remove-Item -Force $stderr }

        $serverProc = Start-Process -FilePath "node" -ArgumentList "src/server.js" -WorkingDirectory $backendRoot -NoNewWindow -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr

        Write-Host "Started server PID: $($serverProc.Id)"
        Write-Host "Waiting up to $WaitSeconds seconds for server to accept requests..."

        $deadline = (Get-Date).AddSeconds($WaitSeconds)
        $ready = $false

        while ((Get-Date) -lt $deadline) {
            try {
                $null = Invoke-JsonGet "$BaseUrl/api/jarvisx/context/public" @{}
                $ready = $true
                break
            }
            catch {
                Start-Sleep -Milliseconds 500
            }
        }

        if (-not $ready) {
            throw "Server did not become ready. Check logs: $stdout / $stderr"
        }
    }

    Write-Section "Public context"
    $publicCtx = Invoke-JsonGet "$BaseUrl/api/jarvisx/context/public" @{}
    $publicCtx | ConvertTo-Json -Depth 10

    Write-Section "Public chat"
    $publicChat = Invoke-JsonPost "$BaseUrl/api/jarvisx/chat" @{ message = $PublicMessage } @{}
    $publicChat | ConvertTo-Json -Depth 10

    if ($AdminJwt -and $AdminJwt.Trim().Length -gt 20) {
        Write-Section "Admin health-report"
        $adminHeaders = @{ Authorization = "Bearer $AdminJwt" }
        $health = Invoke-JsonGet "$BaseUrl/api/jarvisx/health-report" $adminHeaders
        $health | ConvertTo-Json -Depth 10

        Write-Section "Admin chat"
        $adminChat = Invoke-JsonPost "$BaseUrl/api/jarvisx/chat" @{ message = $AdminMessage } $adminHeaders
        $adminChat | ConvertTo-Json -Depth 10

        if (($adminChat | ConvertTo-Json -Depth 10) -notmatch "Yes boss") {
            Write-Host "WARNING: Admin greeting contract not detected in response text." -ForegroundColor Yellow
        }
    }
    else {
        Write-Section "Admin checks"
        Write-Host "Skipping admin calls (set JARVISX_ADMIN_JWT to run them)."
    }

    Write-Section "Done"
    Write-Host "Smoke test completed."
}
finally {
    if ($serverProc -and -not $serverProc.HasExited) {
        Write-Section "Stopping backend"
        Stop-Process -Id $serverProc.Id -Force
        Write-Host "Stopped server PID: $($serverProc.Id)"
    }
}
