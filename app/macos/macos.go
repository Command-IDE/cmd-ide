//go:build darwin

// Package macos provides all macOS-specific platform functionality for cmdIDE:
// performance data collection via vm_stat/top/df/netstat, port enumeration via
// lsof, and process termination via kill.
package macos

import (
	"bufio"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
)

// ── Performance ───────────────────────────────────────────────────────────────

// PerfSnapshot is a point-in-time performance snapshot collected via macOS system tools.
type PerfSnapshot struct {
	CPUPercent   float64
	MemUsed      uint64
	MemTotal     uint64
	MemPercent   float64
	DiskUsed     uint64
	DiskTotal    uint64
	DiskPercent  float64
	NetBytesSent uint64
	NetBytesRecv uint64
	GPUPercent   float64
	GPUName      string
	GPUAvailable bool
}

func gpuStats() (percent float64, name string, available bool) {
	cmd := exec.Command("nvidia-smi", "--query-gpu=utilization.gpu,name", "--format=csv,noheader")
	out, err := cmd.Output()
	if err == nil {
		line := strings.TrimSpace(string(out))
		parts := strings.SplitN(line, ",", 2)
		if len(parts) == 2 {
			pStr := strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(parts[0]), " %"))
			if v, e := strconv.ParseFloat(pStr, 64); e == nil {
				percent = v
				name = strings.TrimSpace(parts[1])
				available = true
			}
		}
	}
	return
}

// CollectPerf returns a full performance snapshot using macOS system tools.
func CollectPerf() PerfSnapshot {
	var data PerfSnapshot
	data.GPUPercent, data.GPUName, data.GPUAvailable = gpuStats()

	// Total physical memory
	if out, err := exec.Command("sysctl", "-n", "hw.memsize").Output(); err == nil {
		total, _ := strconv.ParseUint(strings.TrimSpace(string(out)), 10, 64)
		data.MemTotal = total
	}

	// Used memory via vm_stat
	if out, err := exec.Command("vm_stat").Output(); err == nil {
		kv := map[string]uint64{}
		pageSize := uint64(4096)
		scanner := bufio.NewScanner(strings.NewReader(string(out)))
		for scanner.Scan() {
			line := scanner.Text()
			if strings.Contains(line, "page size of") {
				fields := strings.Fields(line)
				for i, f := range fields {
					if f == "size" && i+2 < len(fields) {
						pageSize, _ = strconv.ParseUint(fields[i+2], 10, 64)
					}
				}
				continue
			}
			parts := strings.SplitN(line, ":", 2)
			if len(parts) != 2 {
				continue
			}
			key := strings.TrimSpace(parts[0])
			val, _ := strconv.ParseUint(strings.Trim(strings.TrimSpace(parts[1]), "."), 10, 64)
			kv[key] = val * pageSize
		}
		free := kv["Pages free"] + kv["Pages speculative"]
		data.MemUsed = data.MemTotal - free
		if data.MemTotal > 0 {
			data.MemPercent = float64(data.MemUsed) * 100 / float64(data.MemTotal)
		}
	}

	// CPU via top (one sample)
	if out, err := exec.Command("top", "-l", "1", "-n", "0", "-s", "0").Output(); err == nil {
		for _, line := range strings.Split(string(out), "\n") {
			if strings.Contains(line, "CPU usage") {
				parts := strings.Fields(line)
				for i, p := range parts {
					if (p == "idle," || p == "idle") && i > 0 {
						idleStr := strings.TrimSuffix(parts[i-1], "%")
						idle, _ := strconv.ParseFloat(idleStr, 64)
						data.CPUPercent = 100 - idle
					}
				}
				break
			}
		}
	}

	// Disk via df on /
	if out, err := exec.Command("df", "-k", "/").Output(); err == nil {
		lines := strings.Split(string(out), "\n")
		if len(lines) >= 2 {
			fields := strings.Fields(lines[1])
			if len(fields) >= 4 {
				total, _ := strconv.ParseUint(fields[1], 10, 64)
				used, _ := strconv.ParseUint(fields[2], 10, 64)
				data.DiskTotal = total * 1024
				data.DiskUsed = used * 1024
				if data.DiskTotal > 0 {
					data.DiskPercent = float64(data.DiskUsed) * 100 / float64(data.DiskTotal)
				}
			}
		}
	}

	// Network via netstat -ib
	if out, err := exec.Command("netstat", "-ib").Output(); err == nil {
		scanner := bufio.NewScanner(strings.NewReader(string(out)))
		first := true
		for scanner.Scan() {
			if first {
				first = false
				continue
			}
			fields := strings.Fields(scanner.Text())
			if len(fields) >= 10 && !strings.HasPrefix(fields[0], "lo") {
				recv, _ := strconv.ParseUint(fields[6], 10, 64)
				sent, _ := strconv.ParseUint(fields[9], 10, 64)
				data.NetBytesRecv += recv
				data.NetBytesSent += sent
			}
		}
	}

	return data
}

// ── Ports ─────────────────────────────────────────────────────────────────────

// NetstatCmd returns the lsof command used to enumerate active ports on macOS.
// lsof is used instead of netstat because macOS netstat does not report PIDs.
func NetstatCmd() *exec.Cmd {
	return exec.Command("lsof", "-i", "-n", "-P", "-sTCP:LISTEN,ESTABLISHED")
}

// ParseLsofOutput parses `lsof -i -n -P` output into a slice of port records.
// Each record contains the process name, PID, protocol, address, port, and state.
func ParseLsofOutput(output string) [][6]string {
	var results [][6]string
	seen := map[string]bool{}
	scanner := bufio.NewScanner(strings.NewReader(output))
	first := true
	for scanner.Scan() {
		if first {
			first = false
			continue
		}
		fields := strings.Fields(scanner.Text())
		if len(fields) < 9 {
			continue
		}
		process := fields[0]
		pid := fields[1]
		proto := strings.ToLower(fields[7])
		addr := fields[8]

		idx := strings.LastIndex(addr, ":")
		if idx < 0 {
			continue
		}
		port := addr[idx+1:]

		state := ""
		if len(fields) >= 10 {
			state = strings.Trim(fields[9], "()")
		}

		key := proto + ":" + port + ":" + pid
		if seen[key] {
			continue
		}
		seen[key] = true
		results = append(results, [6]string{proto, port, pid, process, addr, state})
	}
	return results
}

// KillPIDs terminates the given PIDs using kill -9.
func KillPIDs(pids []int, port string) (string, error) {
	var msgs []string
	for _, pid := range pids {
		cmd := exec.Command("kill", "-9", fmt.Sprintf("%d", pid))
		out, err := cmd.CombinedOutput()
		if err != nil {
			msgs = append(msgs, fmt.Sprintf("PID %d: %s", pid, strings.TrimSpace(string(out))))
		} else {
			msgs = append(msgs, fmt.Sprintf("killed PID %d", pid))
		}
	}
	return strings.Join(msgs, "; "), nil
}
