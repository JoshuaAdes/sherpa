$data = $input | ConvertFrom-Json
$tool = $data.tool_name
if ($tool -notin @('Edit', 'Write', 'Bash')) { exit 0 }

$detail = switch ($tool) {
    'Edit'  { $data.tool_input.file_path }
    'Write' { $data.tool_input.file_path }
    'Bash'  {
        $cmd = ($data.tool_input.command -replace '\r?\n', ' ')
        if ($cmd.Length -gt 80) { $cmd.Substring(0, 80) } else { $cmd }
    }
}

$sherpaDir = Join-Path (Get-Location) '.sherpa'
if (-not (Test-Path $sherpaDir)) { New-Item -ItemType Directory -Path $sherpaDir | Out-Null }

$timestamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss')
"$timestamp $tool $detail" | Add-Content -Path (Join-Path $sherpaDir 'session.log')
