//go:build linux

package perf

import lx "terminal-ide/linux"

func init() {
	platformCollectPerf = func() PerfData {
		s := lx.CollectPerf()
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
