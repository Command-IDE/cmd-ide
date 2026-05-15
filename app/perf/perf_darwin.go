//go:build darwin

package perf

import mac "terminal-ide/macos"

func init() {
	platformCollectPerf = func() PerfData {
		s := mac.CollectPerf()
		return PerfData{
			CPUPercent:   s.CPUPercent,
			MemUsed:      s.MemUsed,
			MemTotal:     s.MemTotal,
			MemPercent:   s.MemPercent,
			DiskUsed:     s.DiskUsed,
			DiskTotal:    s.DiskTotal,
			DiskPercent:  s.DiskPercent,
			NetBytesSent: s.NetBytesSent,
			NetBytesRecv: s.NetBytesRecv,
			GPUPercent:   s.GPUPercent,
			GPUName:      s.GPUName,
			GPUAvailable: s.GPUAvailable,
		}
	}
}
