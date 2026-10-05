# VERSION = "v1": Send a native Windows toast under the existing VS Code identity.
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new()
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$taskPayload = [Console]::In.ReadToEnd() | ConvertFrom-Json
if ($taskPayload.source -notin @('Codex', 'Claude')) { throw 'Unknown notification source' }
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] > $null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType=WindowsRuntime] > $null
$taskNotifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Microsoft.VisualStudioCode')
if ($taskNotifier.Setting -ne 'Enabled') { throw "Windows notifications are disabled: $($taskNotifier.Setting)" }
$taskTitle = "$($taskPayload.source) 작업 완료"
if ($taskPayload.test) { $taskTitle = "$($taskPayload.source) 완료 알림 테스트" }
$taskBody = "$($taskPayload.project) 작업의 응답이 완료되었습니다. VS Code에서 결과를 확인하세요."
$taskTitle = [System.Security.SecurityElement]::Escape($taskTitle)
$taskBody = [System.Security.SecurityElement]::Escape($taskBody)
$taskXml = [Windows.Data.Xml.Dom.XmlDocument]::new()
$taskXml.LoadXml("<toast duration=`"long`" activationType=`"protocol`" launch=`"vscode://`"><visual><binding template=`"ToastGeneric`"><text>$taskTitle</text><text>$taskBody</text></binding></visual><audio src=`"ms-winsoundevent:Notification.Default`" /></toast>")
$taskToast = [Windows.UI.Notifications.ToastNotification]::new($taskXml)
$taskToast.Tag = $taskPayload.tag
$taskToast.Group = 'ai-completion'
$taskToast.ExpirationTime = [DateTimeOffset]::Now.AddDays(1)
$taskNotifier.Show($taskToast)
Write-Output 'Windows toast submitted'
