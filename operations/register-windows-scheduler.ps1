param([string]$NodePath = (Get-Command node).Source)
$ErrorActionPreference = 'Stop'
$ProjectPath = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$WorkerPath = Join-Path $ProjectPath 'operations\scheduler-worker.mjs'
$UserId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$ActionInstagram = New-ScheduledTaskAction -Execute $NodePath -Argument ('"{0}" instagram' -f $WorkerPath) -WorkingDirectory $ProjectPath
$ActionPinterest = New-ScheduledTaskAction -Execute $NodePath -Argument ('"{0}" pinterest' -f $WorkerPath) -WorkingDirectory $ProjectPath
$Daily = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 10) -RepetitionDuration (New-TimeSpan -Days 3650)
$AtLogon = New-ScheduledTaskTrigger -AtLogOn -User $UserId
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5) -ExecutionTimeLimit (New-TimeSpan -Hours 2)
$Principal = New-ScheduledTaskPrincipal -UserId $UserId -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskPath '\CleverFinds\' -TaskName 'InstagramProductionWorker' -Action $ActionInstagram -Trigger @($Daily,$AtLogon) -Settings $Settings -Principal $Principal -Description 'Clever Finds Instagram production worker. Europe/London slots are enforced by project code.' -Force | Out-Null
Register-ScheduledTask -TaskPath '\CleverFinds\' -TaskName 'PinterestProductionWorker' -Action $ActionPinterest -Trigger @($Daily,$AtLogon) -Settings $Settings -Principal $Principal -Description 'Clever Finds Pinterest/RSS production worker. Asia/Riyadh slots are enforced by project code.' -Force | Out-Null
Get-ScheduledTask -TaskPath '\CleverFinds\' | Select-Object TaskName,State
