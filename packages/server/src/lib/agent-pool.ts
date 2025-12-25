/**
 * Agent Pool Management
 * Manages a pool of AgentSession instances for parallel processing
 *
 * Architecture:
 * - 1 Planning Agent: Uses 'medium' thinking for creating plans/subtasks
 * - N Execution Agents: Uses 'off' thinking for fast task execution
 *
 * Work sessions request an agent from the pool and release it when done.
 */

import { createAgentSession, SessionManager } from '@mariozechner/pi-coding-agent'
import type { AgentSession } from '@mariozechner/pi-coding-agent'

/**
 * Agent role determines thinking level and purpose
 */
export type AgentRole = 'planning' | 'execution'

/**
 * Pool agent with session and metadata
 */
export interface PoolAgent {
  id: string
  role: AgentRole
  session: AgentSession
  busy: boolean
  currentWorkId?: string
  assignedAt?: number
  totalWorkProcessed: number
}

/**
 * Configuration for the agent pool
 */
export interface AgentPoolConfig {
  planningAgents: number
  executionAgents: number
}

/**
 * Default pool configuration
 */
const DEFAULT_CONFIG: AgentPoolConfig = {
  planningAgents: 1,
  executionAgents: 2,
}

/**
 * Load pool configuration from environment
 */
function loadPoolConfig(): AgentPoolConfig {
  const planningCount = parseInt(process.env.AGENT_POOL_PLANNING || '1', 10)
  const executionCount = parseInt(process.env.AGENT_POOL_EXECUTION || '2', 10)

  return {
    planningAgents: Math.max(1, planningCount),
    executionAgents: Math.max(1, executionCount),
  }
}

/**
 * Agent Pool Manager
 * Manages lifecycle and assignment of agent sessions
 */
export class AgentPool {
  private agents: Map<string, PoolAgent> = new Map()
  private config: AgentPoolConfig
  private initialized = false

  constructor(config?: Partial<AgentPoolConfig>) {
    const envConfig = loadPoolConfig()
    this.config = {
      planningAgents: config?.planningAgents ?? envConfig.planningAgents,
      executionAgents: config?.executionAgents ?? envConfig.executionAgents,
    }
  }

  /**
   * Initialize the agent pool
   * Creates all agent sessions
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('[AgentPool] Already initialized')
      return
    }

    console.log(`[AgentPool] Initializing pool with ${this.config.planningAgents} planning agents and ${this.config.executionAgents} execution agents`)

    try {
      // Create planning agents
      for (let i = 0; i < this.config.planningAgents; i++) {
        await this.createAgent('planning', i)
      }

      // Create execution agents
      for (let i = 0; i < this.config.executionAgents; i++) {
        await this.createAgent('execution', i)
      }

      this.initialized = true
      console.log(`[AgentPool] Pool initialized with ${this.agents.size} agents`)
    } catch (error) {
      console.error('[AgentPool] Failed to initialize pool:', error)
      throw error
    }
  }

  /**
   * Create a single agent
   */
  private async createAgent(role: AgentRole, index: number): Promise<void> {
    const agentId = `${role}-${index + 1}`

    try {
      const { session } = await createAgentSession({
        sessionManager: SessionManager.inMemory(),
      })

      // Set thinking level based on role
      const thinkingLevel = role === 'planning' ? 'medium' : 'off'
      session.setThinkingLevel(thinkingLevel)

      const poolAgent: PoolAgent = {
        id: agentId,
        role,
        session,
        busy: false,
        totalWorkProcessed: 0,
      }

      this.agents.set(agentId, poolAgent)

      console.log(`[AgentPool] Created ${role} agent ${agentId} (thinking: ${thinkingLevel})`)
    } catch (error) {
      console.error(`[AgentPool] Failed to create agent ${agentId}:`, error)
      throw error
    }
  }

  /**
   * Acquire an agent for a work session
   * Waits until an agent is available if all are busy
   */
  async acquireAgent(role: AgentRole, workId: string, timeout = 30000): Promise<PoolAgent> {
    if (!this.initialized) {
      throw new Error('Agent pool not initialized. Call initialize() first.')
    }

    const startTime = Date.now()
    const checkInterval = 100

    // Find an available agent of the specified role
    while (Date.now() - startTime < timeout) {
      const agent = this.findAvailableAgent(role)

      if (agent) {
        // Mark as busy
        agent.busy = true
        agent.currentWorkId = workId
        agent.assignedAt = Date.now()

        console.log(`[AgentPool] Assigned ${role} agent ${agent.id} to work ${workId}`)
        return agent
      }

      // Wait before checking again
      await new Promise(resolve => setTimeout(resolve, checkInterval))
    }

    throw new Error(`Timeout waiting for ${role} agent (waited ${timeout}ms)`)
  }

  /**
   * Release an agent back to the pool
   */
  releaseAgent(agentId: string): void {
    const agent = this.agents.get(agentId)

    if (!agent) {
      console.warn(`[AgentPool] Agent ${agentId} not found`)
      return
    }

    const workId = agent.currentWorkId
    const duration = agent.assignedAt ? Date.now() - agent.assignedAt : 0

    agent.busy = false
    agent.currentWorkId = undefined
    agent.assignedAt = undefined
    agent.totalWorkProcessed++

    console.log(`[AgentPool] Released ${agent.role} agent ${agent.id} from work ${workId} (duration: ${duration}ms)`)
  }

  /**
   * Find an available agent of the specified role
   */
  private findAvailableAgent(role: AgentRole): PoolAgent | undefined {
    for (const agent of this.agents.values()) {
      if (agent.role === role && !agent.busy) {
        return agent
      }
    }
    return undefined
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    totalAgents: number
    planningAgents: number
    executionAgents: number
    busyPlanning: number
    busyExecution: number
    availablePlanning: number
    availableExecution: number
  } {
    const planningAgents = Array.from(this.agents.values()).filter(a => a.role === 'planning')
    const executionAgents = Array.from(this.agents.values()).filter(a => a.role === 'execution')

    return {
      totalAgents: this.agents.size,
      planningAgents: planningAgents.length,
      executionAgents: executionAgents.length,
      busyPlanning: planningAgents.filter(a => a.busy).length,
      busyExecution: executionAgents.filter(a => a.busy).length,
      availablePlanning: planningAgents.filter(a => !a.busy).length,
      availableExecution: executionAgents.filter(a => !a.busy).length,
    }
  }

  /**
   * Get all agents (for monitoring)
   */
  getAllAgents(): PoolAgent[] {
    return Array.from(this.agents.values())
  }

  /**
   * Dispose of all agents
   */
  async dispose(): Promise<void> {
    console.log('[AgentPool] Disposing pool...')

    for (const agent of this.agents.values()) {
      try {
        agent.session.dispose()
        console.log(`[AgentPool] Disposed agent ${agent.id}`)
      } catch (error) {
        console.error(`[AgentPool] Error disposing agent ${agent.id}:`, error)
      }
    }

    this.agents.clear()
    this.initialized = false

    console.log('[AgentPool] Pool disposed')
  }
}

// Global agent pool instance
let globalPool: AgentPool | null = null

/**
 * Get or create the global agent pool
 */
export function getAgentPool(): AgentPool {
  if (!globalPool) {
    globalPool = new AgentPool()
  }
  return globalPool
}

/**
 * Initialize the global agent pool
 */
export async function initializeAgentPool(config?: Partial<AgentPoolConfig>): Promise<AgentPool> {
  if (globalPool) {
    console.log('[AgentPool] Pool already initialized, returning existing pool')
    return globalPool
  }

  globalPool = new AgentPool(config)
  await globalPool.initialize()
  return globalPool
}

/**
 * Check if the global agent pool is initialized
 */
export function isAgentPoolReady(): boolean {
  return globalPool !== null
}
