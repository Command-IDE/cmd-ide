//go:build !plugins

package main

import "fmt"

// FetchExternalPlugin is a stub — Plugin Manager was not included in this build.
func (a *App) FetchExternalPlugin(_ string) (ExternalPluginInfo, error) {
	return ExternalPluginInfo{}, fmt.Errorf("Plugin Manager is not installed")
}
