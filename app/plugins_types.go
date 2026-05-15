package main

// ExternalPluginInfo holds metadata and the bundled JS for an external plugin.
type ExternalPluginInfo struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Author      string `json:"author"`
	Version     string `json:"version"`
	Code        string `json:"code"`
}
