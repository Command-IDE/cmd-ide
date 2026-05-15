package main

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// SessionTab is a minimal description of one open tab, persisted for soft-close.
type SessionTab struct {
	Type     string `json:"type"`
	FilePath string `json:"file_path,omitempty"`
	Language string `json:"language,omitempty"`
	Cwd      string `json:"cwd,omitempty"`
}

func sessionFilePath() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		dir, _ = os.UserHomeDir()
	}
	return filepath.Join(dir, "cmdIDE", "session.json")
}

// SaveSession persists the current tab list to disk.
func (a *App) SaveSession(tabs []SessionTab) {
	data, err := json.MarshalIndent(tabs, "", "  ")
	if err != nil {
		return
	}
	_ = os.MkdirAll(filepath.Dir(sessionFilePath()), 0755)
	os.WriteFile(sessionFilePath(), data, 0644) //nolint:errcheck
}

// LoadSession reads the persisted tab list. Returns nil when none exists.
func (a *App) LoadSession() []SessionTab {
	data, err := os.ReadFile(sessionFilePath())
	if err != nil {
		return nil
	}
	var tabs []SessionTab
	if err := json.Unmarshal(data, &tabs); err != nil {
		return nil
	}
	return tabs
}
