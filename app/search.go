package main

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
)

// SearchResult represents a single file search hit.
type SearchResult struct {
	Path    string `json:"path"`
	Line    int    `json:"line"`
	Content string `json:"content"`
	IsName  bool   `json:"is_name"`
}

// SearchFiles searches files in the terminal's cwd for the given query.
func (a *App) SearchFiles(id string, query string) []SearchResult {
	a.mu.Lock()
	t, ok := a.terminals[id]
	a.mu.Unlock()
	if !ok || query == "" {
		return nil
	}

	queryLower := strings.ToLower(query)
	var results []SearchResult
	limit := 100

	filepath.Walk(t.cwd, func(path string, info os.FileInfo, err error) error { //nolint:errcheck
		if err != nil || len(results) >= limit {
			return nil
		}
		base := filepath.Base(path)
		if strings.HasPrefix(base, ".") {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if info.IsDir() {
			for _, skip := range []string{"node_modules", "vendor", ".git", "dist", "build", "__pycache__"} {
				if base == skip {
					return filepath.SkipDir
				}
			}
			return nil
		}

		rel, _ := filepath.Rel(t.cwd, path)
		rel = filepath.ToSlash(rel)

		if strings.Contains(strings.ToLower(base), queryLower) {
			results = append(results, SearchResult{Path: rel, IsName: true})
			return nil
		}

		if info.Size() > 1<<20 || isBinaryPath(path) {
			return nil
		}

		f, err := os.Open(path)
		if err != nil {
			return nil
		}
		defer f.Close()

		lineNum := 0
		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			lineNum++
			if len(results) >= limit {
				break
			}
			line := scanner.Text()
			if strings.Contains(strings.ToLower(line), queryLower) {
				content := strings.TrimSpace(line)
				if len(content) > 120 {
					content = content[:120] + "…"
				}
				results = append(results, SearchResult{
					Path:    rel,
					Line:    lineNum,
					Content: content,
					IsName:  false,
				})
			}
		}
		return nil
	})
	return results
}

// GetCompletions returns filesystem entries whose names start with partial.
func (a *App) GetCompletions(id string, dir string, partial string) []string {
	a.mu.Lock()
	t, ok := a.terminals[id]
	a.mu.Unlock()
	if !ok {
		return nil
	}

	lookDir := t.cwd
	if dir != "" {
		dir = filepath.FromSlash(dir)
		if filepath.IsAbs(dir) {
			lookDir = filepath.Clean(dir)
		} else {
			lookDir = filepath.Clean(filepath.Join(t.cwd, dir))
		}
	}

	entries, err := os.ReadDir(lookDir)
	if err != nil {
		return nil
	}

	lowerPartial := strings.ToLower(partial)
	var matches []string
	for _, e := range entries {
		name := e.Name()
		if strings.HasPrefix(name, ".") {
			continue
		}
		if partial == "" || strings.HasPrefix(strings.ToLower(name), lowerPartial) {
			if e.IsDir() {
				matches = append(matches, name+"/")
			} else {
				matches = append(matches, name)
			}
		}
	}
	return matches
}

func isBinaryPath(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	for _, b := range []string{
		".exe", ".dll", ".so", ".dylib", ".bin", ".obj", ".o", ".a",
		".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".bmp",
		".zip", ".tar", ".gz", ".rar", ".7z",
		".pdf", ".doc", ".docx", ".xls", ".xlsx",
		".mp3", ".mp4", ".wav", ".avi", ".mov",
		".wasm", ".node",
	} {
		if ext == b {
			return true
		}
	}
	return false
}
