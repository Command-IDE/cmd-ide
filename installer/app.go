package main

import (
	"context"
	_ "embed"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed assets/cmdIDE.exe
var appBinary []byte

// App holds the installer backend state.
type App struct {
	ctx context.Context
}

func NewApp() *App { return &App{} }

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// GetInstallDir returns the directory the app will be installed into.
func (a *App) GetInstallDir() string {
	local, _ := os.UserCacheDir() // %LOCALAPPDATA% on Windows
	return filepath.Join(local, "cmdIDE")
}

// Install extracts the embedded binary to the install directory,
// emitting progress events so the frontend can update its bar.
// If createShortcut is true a desktop .lnk is created as part of the sequence.
func (a *App) Install(createShortcut bool) error {
	emit := func(pct int, msg string) {
		wailsruntime.EventsEmit(a.ctx, "install:progress", pct, msg)
		time.Sleep(100 * time.Millisecond)
	}

	emit(5, "Preparing…")

	installDir := a.GetInstallDir()

	emit(20, "Creating install directory…")
	if err := os.MkdirAll(installDir, 0o755); err != nil {
		return fmt.Errorf("could not create directory: %w", err)
	}

	emit(55, "Copying files…")
	dest := filepath.Join(installDir, "cmdIDE.exe")
	if err := os.WriteFile(dest, appBinary, 0o755); err != nil {
		return fmt.Errorf("could not write executable: %w", err)
	}

	if createShortcut {
		emit(80, "Creating desktop shortcut…")
		// Non-fatal: a shortcut failure shouldn't abort the install.
		_ = a.createDesktopShortcut(installDir)
	}

	emit(95, "Finishing up…")
	time.Sleep(150 * time.Millisecond)
	emit(100, "Installation complete")
	return nil
}

// createDesktopShortcut places a cmdIDE.lnk on the user's Desktop.
// It uses [System.Environment]::GetFolderPath so OneDrive-redirected
// desktops are resolved correctly.
func (a *App) createDesktopShortcut(installDir string) error {
	exe := filepath.Join(installDir, "cmdIDE.exe")

	// Use PowerShell string concatenation so we avoid quoting issues
	// with double-quoted variable expansion inside -Command.
	script := fmt.Sprintf(
		`$d=[System.Environment]::GetFolderPath('Desktop');`+
			`$s=New-Object -ComObject WScript.Shell;`+
			`$l=$s.CreateShortcut($d+'\cmdIDE.lnk');`+
			`$l.TargetPath='%s';`+
			`$l.WorkingDirectory='%s';`+
			`$l.Save()`,
		exe, installDir,
	)
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script)
	noWindow(cmd)
	return cmd.Run()
}

// LaunchAndClose starts the installed app as a detached process then quits the installer.
func (a *App) LaunchAndClose() {
	exe := filepath.Join(a.GetInstallDir(), "cmdIDE.exe")
	cmd := exec.Command(exe)
	noWindow(cmd)
	_ = cmd.Start()
	time.Sleep(300 * time.Millisecond)
	wailsruntime.Quit(a.ctx)
}

// CloseInstaller quits the installer window.
func (a *App) CloseInstaller() {
	wailsruntime.Quit(a.ctx)
}
