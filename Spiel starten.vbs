Option Explicit
Dim shell, fso, folder, command, result
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & folder & "\Start-Spiel.ps1"""
result = shell.Run(command, 0, True)
If result <> 0 Then MsgBox "Das Spiel konnte nicht starten. Bitte Start-Spiel.cmd oeffnen, um den Fehler zu sehen.", 48, "Schicksalsprobe"
