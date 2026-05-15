package ports

import (
	"bufio"
	"fmt"
	"os/exec"
	"strconv"
	"strings"

	term "github.com/Command-IDE/terminal/src"
)

// PortInfo describes a single active network port.
type PortInfo struct {
	Protocol string `json:"protocol"`
	Port     int    `json:"port"`
	PID      int    `json:"pid"`
	Process  string `json:"process"`
	Address  string `json:"address"`
	State    string `json:"state"`
}

// netstatCmd, parsePorts, and platformKillPIDs are wired by OS-specific init().
var netstatCmd func() *exec.Cmd
var parsePorts func(output string) []PortInfo
var platformKillPIDs func(pids []int, port string) (string, error)

// GetActivePorts returns the list of currently listening / established ports.
func GetActivePorts() []PortInfo {
	if netstatCmd == nil {
		return nil
	}
	cmd := netstatCmd()
	term.NoWindow(cmd)
	out, err := cmd.Output()
	if err != nil {
		return nil
	}
	if parsePorts != nil {
		return parsePorts(string(out))
	}
	return parseNetstatLines(string(out))
}

// KillPortProcess kills all processes listening on the given port string.
func KillPortProcess(portStr string) (string, error) {
	port, err := strconv.Atoi(strings.TrimSpace(portStr))
	if err != nil || port < 1 || port > 65535 {
		return "", fmt.Errorf("invalid port: %s", portStr)
	}
	all := GetActivePorts()
	var pids []int
	seen := map[int]bool{}
	for _, p := range all {
		if p.Port == port && !seen[p.PID] && p.PID > 0 {
			pids = append(pids, p.PID)
			seen[p.PID] = true
		}
	}
	if len(pids) == 0 {
		return fmt.Sprintf("no process found on port %d", port), nil
	}
	if platformKillPIDs == nil {
		return "", fmt.Errorf("kill not supported on this platform")
	}
	return platformKillPIDs(pids, portStr)
}

func portFromAddr(addr string) int {
	addr = strings.TrimPrefix(addr, "[")
	addr = strings.TrimSuffix(addr, "]")
	idx := strings.LastIndex(addr, ":")
	if idx < 0 {
		return 0
	}
	p, err := strconv.Atoi(addr[idx+1:])
	if err != nil {
		return 0
	}
	return p
}

func parseNetstatLines(output string) []PortInfo {
	var results []PortInfo
	seen := map[string]bool{}

	scanner := bufio.NewScanner(strings.NewReader(output))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "Proto") || strings.HasPrefix(line, "Active") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}

		proto := strings.ToLower(fields[0])
		if proto != "tcp" && proto != "tcp6" && proto != "udp" && proto != "udp6" {
			continue
		}

		localAddr := fields[1]
		port := portFromAddr(localAddr)
		if port == 0 {
			continue
		}

		var state string
		var pid int
		var process string

		if len(fields) >= 5 {
			state = fields[3]
			pid, _ = strconv.Atoi(fields[4])
		} else if len(fields) == 4 {
			pid, _ = strconv.Atoi(fields[3])
		}

		if len(fields) >= 7 && (fields[0] == "tcp" || fields[0] == "tcp6" || fields[0] == "udp" || fields[0] == "udp6") {
			if _, err := strconv.Atoi(fields[1]); err == nil {
				localAddr = fields[3]
				port = portFromAddr(localAddr)
				if port == 0 {
					continue
				}
				if len(fields) >= 6 {
					state = fields[5]
				}
				if len(fields) >= 7 {
					pidStr := strings.SplitN(fields[6], "/", 2)
					pid, _ = strconv.Atoi(pidStr[0])
					if len(pidStr) > 1 {
						process = pidStr[1]
					}
				}
			}
		}

		key := fmt.Sprintf("%s:%d:%d", proto, port, pid)
		if seen[key] {
			continue
		}
		seen[key] = true

		switch strings.ToUpper(state) {
		case "LISTENING", "LISTEN":
			state = "LISTEN"
		case "ESTABLISHED":
			state = "ESTABLISHED"
		case "TIME_WAIT":
			state = "TIME_WAIT"
		case "CLOSE_WAIT":
			state = "CLOSE_WAIT"
		case "":
		}

		results = append(results, PortInfo{
			Protocol: proto,
			Port:     port,
			PID:      pid,
			Process:  process,
			Address:  localAddr,
			State:    state,
		})
	}
	return results
}
