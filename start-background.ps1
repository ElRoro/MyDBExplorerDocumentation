# Script pour lancer DBExplorer Documentation
param(
    [switch]$Stop,
    [switch]$Install,
    [switch]$Uninstall
)

$AppName = "DBExplorer Documentation"
$AppDir = Split-Path $MyInvocation.MyCommand.Path -Parent
$LogFile = "$AppDir\app.log"
$PidFile = "$AppDir\app.pid"
$StartupFolder = "$env:USERPROFILE\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup"
$ShortcutPath = "$StartupFolder\$AppName.lnk"

function Write-Status {
    param([string]$Message, [string]$Type = "Info")
    $timestamp = Get-Date -Format "HH:mm:ss"
    
    if ($Type -eq "Error") {
        Write-Host "[$timestamp] ERREUR: $Message" -ForegroundColor Red
    } elseif ($Type -eq "Success") {
        Write-Host "[$timestamp] SUCCES: $Message" -ForegroundColor Green
    } elseif ($Type -eq "Warning") {
        Write-Host "[$timestamp] ATTENTION: $Message" -ForegroundColor Yellow
    } else {
        Write-Host "[$timestamp] INFO: $Message" -ForegroundColor Cyan
    }
}

function Test-NodeJS {
    try {
        $nodeVersion = node --version 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Status "Node.js detecte: $nodeVersion"
            return $true
        }
    } catch {
        Write-Status "Node.js non trouve" "Error"
        return $false
    }
    return $false
}

function Start-Background {
    Write-Status "Demarrage de $AppName en arriere-plan..."
    
    if (-not (Test-NodeJS)) {
        Write-Status "Node.js n'est pas installe" "Error"
        return $false
    }
    
    # Verifier si l'application est deja en cours
    if (Test-Path $PidFile) {
        $processId = Get-Content $PidFile
        if (Get-Process -Id $processId -ErrorAction SilentlyContinue) {
            Write-Status "L'application est deja en cours (PID: $processId)" "Warning"
            return $true
        } else {
            Remove-Item $PidFile -Force
        }
    }
    
    # Installer les dependances si necessaire
    if (-not (Test-Path "$AppDir\node_modules")) {
        Write-Status "Installation des dependances..." "Warning"
        npm run install-all
    }
    
    # Lancer l'application en arriere-plan
    try {
        $job = Start-Job -ScriptBlock {
            param($AppDir)
            Set-Location $AppDir
            npm run dev
        } -ArgumentList $AppDir
        
        # Sauvegarder le PID
        $job.Id | Out-File $PidFile
        
        Write-Status "Application lancee en arriere-plan (Job ID: $($job.Id))" "Success"
        Write-Status "Logs disponibles dans: $LogFile" "Info"
        Write-Status "Application accessible sur: http://localhost:3000" "Info"
        Write-Status "Pour arreter: .\start-background.ps1 -Stop" "Info"
        
        return $true
    } catch {
        Write-Status "Erreur lors du demarrage: $($_.Exception.Message)" "Error"
        return $false
    }
}

function Stop-Background {
    Write-Status "Arret de $AppName..."
    
    if (Test-Path $PidFile) {
        $jobId = Get-Content $PidFile
        try {
            Stop-Job -Id $jobId -ErrorAction SilentlyContinue
            Remove-Job -Id $jobId -ErrorAction SilentlyContinue
            Remove-Item $PidFile -Force
            Write-Status "Application arretee" "Success"
        } catch {
            Write-Status "Erreur lors de l'arret: $($_.Exception.Message)" "Error"
        }
    } else {
        Write-Status "Aucune application en cours" "Warning"
    }
}

function Show-Status {
    if (Test-Path $PidFile) {
        $jobId = Get-Content $PidFile
        $job = Get-Job -Id $jobId -ErrorAction SilentlyContinue
        if ($job) {
            Write-Status "Application en cours (Job ID: $jobId)" "Success"
            Write-Status "Etat: $($job.State)" "Info"
            Write-Status "Accessible sur: http://localhost:3000" "Info"
        } else {
            Write-Status "Application non trouvee" "Warning"
            Remove-Item $PidFile -Force
        }
    } else {
        Write-Status "Aucune application en cours" "Warning"
    }
}

function Install-Startup {
    Write-Status "Installation du démarrage automatique..."
    
    if (-not (Test-NodeJS)) {
        Write-Status "Veuillez installer Node.js depuis https://nodejs.org/" "Error"
        return $false
    }
    
    try {
        if (-not (Test-Path $StartupFolder)) {
            Write-Status "Création du dossier de démarrage..." "Warning"
            New-Item -ItemType Directory -Path $StartupFolder -Force | Out-Null
        }
        
        $WshShell = New-Object -ComObject WScript.Shell
        $Shortcut = $WshShell.CreateShortcut($ShortcutPath)
        $Shortcut.TargetPath = "powershell.exe"
        $Shortcut.Arguments = "-ExecutionPolicy Bypass -File `"$($MyInvocation.MyCommand.Path)`""
        $Shortcut.WorkingDirectory = $AppDir
        $Shortcut.Description = "Démarre DBExplorer Documentation"
        $Shortcut.Save()
        
        Write-Status "Démarrage automatique installé avec succès" "Success"
        return $true
    } catch {
        Write-Status "Erreur lors de l'installation: $($_.Exception.Message)" "Error"
        return $false
    }
}

function Uninstall-Startup {
    Write-Status "Désinstallation du démarrage automatique..."
    
    if (Test-Path $ShortcutPath) {
        Remove-Item $ShortcutPath -Force
        Write-Status "Démarrage automatique désinstallé" "Success"
    } else {
        Write-Status "Aucun démarrage automatique trouvé" "Warning"
    }
}

# Logique principale
if ($Install) {
    Install-Startup
} elseif ($Uninstall) {
    Uninstall-Startup
} elseif ($Stop) {
    Stop-Background
} else {
    Start-Background
    Show-Status
} 