@echo off
title Market Signal Triage - Stopping...

powershell -NoProfile -Command ^
  "$pids = @(); foreach ($port in 4001,5173) { $c = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue; if ($c) { $pids += $c.OwningProcess } }; $pids = $pids | Select-Object -Unique; foreach ($p in $pids) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }; Write-Output ('Stopped process id(s): ' + ($pids -join ','))"

echo Done. You can close this window.
pause >nul
