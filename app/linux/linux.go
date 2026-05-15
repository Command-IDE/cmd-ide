//go:build linux

// Package linux provides all Linux-specific platform functionality for cmdIDE:
// performance data collection via procfs, port enumeration via netstat, and
// process termination via kill.
package linux

import (
	"bufio"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
)

// ── Performance ───────────────────────────────────────────────────────────────

// PerfSnapshot is a point-in-time performance snapshot collected from procfs.
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

// CollectPerf returns a full performance snapshot read from /proc and df.
func CollectPerf() PerfSnapshot {
	var data PerfSnapshot
	data.GPUPercent, data.GPUName, data.GPUAvailable = gpuStats()

	// Memory from /proc/meminfo
	if out, err := exec.Command("cat", "/proc/meminfo").Output(); err == nil {
		scanner := bufio.NewScanner(strings.NewReader(string(out)))
		kv := map[string]uint64{}
		for scanner.Scan() {
			parts := strings.Fields(scanner.Text())
			if len(parts) >= 2 {
				key := strings.TrimSuffix(parts[0], ":")
				val, _ := strconv.ParseUint(parts[1], 10, 64)
				kv[key] = val * 1024
			}
		}
		total := kv["MemTotal"]
		avail := kv["MemAvailable"]
		if avail == 0 {
			avail = kv["MemFree"] + kv["Buffers"] + kv["Cached"]
		}
		data.MemTotal = total
		data.MemUsed = total - avail
		if total > 0 {
			data.MemPercent = float64(data.MemUsed) * 100 / float64(total)
		}
	}

	// CPU from /proc/stat
	if out, err := exec.Command("cat", "/proc/stat").Output(); err == nil {
		scanner := bufio.NewScanner(strings.NewReader(string(out)))
		for scanner.Scan() {
			line := scanner.Text()
			if !strings.HasPrefix(line, "cpu ") {
				continue
			}
			fields := strings.Fields(line)
			if len(fields) < 5 {
				break
			}
			var vals [10]uint64
			for i := 1; i < len(fields) && i <= 10; i++ {
				vals[i-1], _ = strconv.ParseUint(fields[i], 10, 64)
			}
			idle := vals[3] + vals[4]
			total := uint64(0)
			for _, v := range vals {
				total += v
			}
			if total > 0 {
				data.CPUPercent = (1 - float64(idle)/float64(total)) * 100
			}
			break
		}
	}

	// Disk via df on /
	if out, err := exec.Command("df", "-B1", "/").Output(); err == nil {
		lines := strings.Split(string(out), "\n")
		if len(lines) >= 2 {
			fields := strings.Fields(lines[1])
			if len(fields) >= 4 {
				data.DiskTotal, _ = strconv.ParseUint(fields[1], 10, 64)
				data.DiskUsed, _ = strconv.ParseUint(fields[2], 10, 64)
				if data.DiskTotal > 0 {
					data.DiskPercent = float64(data.DiskUsed) * 100 / float64(data.DiskTotal)
				}
			}
		}
	}

	// Network from /proc/net/dev
	if out, err := exec.Command("cat", "/proc/net/dev").Output(); err == nil {
		scanner := bufio.NewScanner(strings.NewReader(string(out)))
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if strings.HasPrefix(line, "lo:") || !strings.Contains(line, ":") {
				continue
			}
			parts := strings.SplitN(line, ":", 2)
			if len(parts) != 2 {
				continue
			}
			fields := strings.Fields(parts[1])
			if len(fields) >= 9 {
				recv, _ := strconv.ParseUint(fields[0], 10, 64)
				sent, _ := strconv.ParseUint(fields[8], 10, 64)
				data.NetBytesRecv += recv
				data.NetBytesSent += sent
			}
		}
	}

	return data
}

// ── Ports ─────────────────────────────────────────────────────────────────────

// NetstatCmd returns the command used to enumerate active ports on Linux.
func NetstatCmd() *exec.Cmd {
	return exec.Command("netstat", "-tulnp")
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
