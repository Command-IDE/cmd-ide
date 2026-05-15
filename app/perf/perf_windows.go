//go:build windows

package perf

import win "terminal-ide/windows"

func init() {
	platformCollectPerf = func() PerfData {
		s := win.CollectPerf()
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
