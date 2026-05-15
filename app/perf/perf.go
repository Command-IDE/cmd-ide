package perf

import (
	"context"
	"time"
)

// PerfData is one snapshot of host performance metrics.
type PerfData struct {
	CPUPercent   float64 `json:"cpu_percent"`
	MemUsed      uint64  `json:"mem_used"`
	MemTotal     uint64  `json:"mem_total"`
	MemPercent   float64 `json:"mem_percent"`
	DiskUsed     uint64  `json:"disk_used"`
	DiskTotal    uint64  `json:"disk_total"`
	DiskPercent  float64 `json:"disk_percent"`
	NetBytesSent uint64  `json:"net_bytes_sent"`
	NetBytesRecv uint64  `json:"net_bytes_recv"`
	GPUPercent   float64 `json:"gpu_percent"`
	GPUName      string  `json:"gpu_name"`
	GPUAvailable bool    `json:"gpu_available"`
}

// platformCollectPerf is wired by the OS-specific init() below.
var platformCollectPerf func() PerfData

// CollectData returns a single snapshot via the platform implementation.
func CollectData() PerfData {
	if platformCollectPerf == nil {
		return PerfData{}
	}
	return platformCollectPerf()
}

// StartMonitor streams snapshots every second until ctx is cancelled.
// emit receives the Wails event name and the data snapshot.
func StartMonitor(ctx context.Context, tabId string, emit func(string, PerfData)) {
	go func() {
		event := "perf:data:" + tabId
		for {
			select {
			case <-ctx.Done():
				return
			case <-time.After(time.Second):
				emit(event, CollectData())
			}
		}
	}()
}
