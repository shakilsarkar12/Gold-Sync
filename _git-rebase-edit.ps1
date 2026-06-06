param(
    [string]$file
)

(Get-Content -Raw -Path $file) -replace '^pick 3ec7df4 ', 'edit 3ec7df4 ' | Set-Content -Path $file
