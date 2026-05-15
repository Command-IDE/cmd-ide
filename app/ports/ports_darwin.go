//go:build darwin

package ports

import (
	"strconv"

	mac "terminal-ide/macos"
)

func init() {
	netstatCmd = mac.NetstatCmd
	parsePorts = func(output string) []PortInfo {
		var results []PortInfo
		for _, r := range mac.ParseLsofOutput(output) {
			port, _ := strconv.Atoi(r[1])
			pid, _ := strconv.Atoi(r[2])
			state := r[5]
			switch state {
			case "LISTEN", "ESTABLISHED", "TIME_WAIT", "CLOSE_WAIT":
			default:
				state = ""
			}
			results = append(results, PortInfo{
				Protocol: r[0],
				Port:     port,
				PID:      pid,
				Process:  r[3],
				Address:  r[4],
				State:    state,
			})
		}
		return results
	}
	platformKillPIDs = mac.KillPIDs
}
