/**
 * React hook for fetching and tracking agent pool status
 * Provides real-time updates on planning agent and worker pool state
 */

import { useQuery } from '@tanstack/react-query'
import { getAgentPoolStatus } from '../lib/api/client'
import type { AgentPoolStatusResponse } from '../lib/api/types'

export function useAgentPoolStatus(enabled: boolean = true) {
  const query = useQuery({
    queryKey: ['agentPoolStatus'],
    queryFn: async () => {
      try {
        const status = await getAgentPoolStatus()
        return status
      } catch (error) {
        // If endpoint doesn't exist yet, return default values
        console.warn('[useAgentPoolStatus] Failed to fetch pool status:', error)
        return {
          planningAgent: {
            status: 'idle' as const,
            lastActivity: Date.now(),
          },
          workerPool: {
            totalWorkers: 0,
            activeWorkers: 0,
            idleWorkers: 0,
            workers: [],
          },
        }
      }
    },
    enabled,
    refetchInterval: 5000, // Poll every 5 seconds for real-time updates
    retry: 1,
    staleTime: 2000, // Consider data stale after 2 seconds
  })

  // Derive active workers count for convenience
  const activeWorkersCount = query.data?.workerPool.activeWorkers ?? 0

  return {
    ...query,
    poolStatus: query.data,
    activeWorkersCount,
    isConnected: query.isLoading === false && !query.error,
  }
}
