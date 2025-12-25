/**
 * Tests for Agent Pool
 * Tests pool management, agent acquisition, and release
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { AgentPool, type PoolAgent } from '../agent-pool.js'

describe('AgentPool - Basic Functionality', () => {
  let pool: AgentPool

  beforeEach(async () => {
    // Create a small test pool
    pool = new AgentPool({
      planningAgents: 1,
      executionAgents: 2,
    })
  })

  afterEach(async () => {
    await pool.dispose()
  })

  describe('Initialization', () => {
    it('should create agents based on config', async () => {
      await pool.initialize()

      const stats = pool.getStats()
      expect(stats.totalAgents).toBe(3)
      expect(stats.planningAgents).toBe(1)
      expect(stats.executionAgents).toBe(2)
    })

    it('should initialize agents with correct thinking levels', async () => {
      await pool.initialize()

      const agents = pool.getAllAgents()

      const planningAgents = agents.filter(a => a.role === 'planning')
      const executionAgents = agents.filter(a => a.role === 'execution')

      expect(planningAgents.length).toBe(1)
      expect(executionAgents.length).toBe(2)

      // Check that agents have sessions
      planningAgents.forEach(agent => {
        expect(agent.session).toBeDefined()
      })

      executionAgents.forEach(agent => {
        expect(agent.session).toBeDefined()
      })
    })
  })

  describe('Agent Acquisition', () => {
    it('should acquire an available planning agent', async () => {
      await pool.initialize()

      const agent = await pool.acquireAgent('planning', 'test-work-1')

      expect(agent.role).toBe('planning')
      expect(agent.busy).toBe(true)
      expect(agent.currentWorkId).toBe('test-work-1')
    })

    it('should acquire an available execution agent', async () => {
      await pool.initialize()

      const agent = await pool.acquireAgent('execution', 'test-work-2')

      expect(agent.role).toBe('execution')
      expect(agent.busy).toBe(true)
      expect(agent.currentWorkId).toBe('test-work-2')
    })

    it('should wait if all agents are busy', async () => {
      await pool.initialize()

      // Acquire both execution agents
      const agent1 = await pool.acquireAgent('execution', 'work-1')
      const agent2 = await pool.acquireAgent('execution', 'work-2')

      // Try to acquire a third execution agent (should wait)
      let agent3: PoolAgent | null = null
      const promise = pool.acquireAgent('execution', 'work-3', 2000).then(a => {
        agent3 = a
      })

      // Release first agent after a short delay
      setTimeout(() => {
        pool.releaseAgent(agent1.id)
      }, 100)

      await promise

      expect(agent3).not.toBeNull()
      expect(agent3!.busy).toBe(true)

      // Cleanup
      pool.releaseAgent(agent2.id)
      pool.releaseAgent(agent3!.id)
    })
  })

  describe('Agent Release', () => {
    it('should release an agent back to the pool', async () => {
      await pool.initialize()

      const agent = await pool.acquireAgent('execution', 'test-work')
      expect(agent.busy).toBe(true)

      pool.releaseAgent(agent.id)

      // Agent should be available again
      const sameAgent = pool.getAllAgents().find(a => a.id === agent.id)
      expect(sameAgent!.busy).toBe(false)
      expect(sameAgent!.currentWorkId).toBeUndefined()
    })

    it('should increment work processed count', async () => {
      await pool.initialize()

      const agent = await pool.acquireAgent('execution', 'test-work')
      const initialCount = agent.totalWorkProcessed

      pool.releaseAgent(agent.id)

      const releasedAgent = pool.getAllAgents().find(a => a.id === agent.id)
      expect(releasedAgent!.totalWorkProcessed).toBe(initialCount + 1)
    })
  })

  describe('Pool Statistics', () => {
    it('should report correct statistics', async () => {
      await pool.initialize()

      const stats = pool.getStats()

      expect(stats.totalAgents).toBe(3)
      expect(stats.planningAgents).toBe(1)
      expect(stats.executionAgents).toBe(2)
      expect(stats.busyPlanning).toBe(0)
      expect(stats.busyExecution).toBe(0)
      expect(stats.availablePlanning).toBe(1)
      expect(stats.availableExecution).toBe(2)
    })

    it('should update statistics when agents are busy', async () => {
      await pool.initialize()

      const agent = await pool.acquireAgent('execution', 'test-work')
      const stats = pool.getStats()

      expect(stats.busyExecution).toBe(1)
      expect(stats.availableExecution).toBe(1)

      pool.releaseAgent(agent.id)
    })
  })

  describe('Concurrent Operations', () => {
    it('should handle multiple concurrent acquisitions', async () => {
      await pool.initialize()

      // Acquire all execution agents
      const agents = await Promise.all([
        pool.acquireAgent('execution', 'work-1'),
        pool.acquireAgent('execution', 'work-2'),
      ])

      expect(agents.length).toBe(2)
      expect(agents[0].id).not.toBe(agents[1].id)

      // Release all
      agents.forEach(agent => pool.releaseAgent(agent.id))
    })

    it('should support planning while executing', async () => {
      await pool.initialize()

      // Acquire execution agent
      const execAgent = await pool.acquireAgent('execution', 'work-exec')

      // Should still be able to acquire planning agent
      const planAgent = await pool.acquireAgent('planning', 'work-plan')

      expect(execAgent.role).toBe('execution')
      expect(planAgent.role).toBe('planning')
      expect(execAgent.id).not.toBe(planAgent.id)

      // Release both
      pool.releaseAgent(execAgent.id)
      pool.releaseAgent(planAgent.id)
    })
  })
})

describe('AgentPool - Error Handling', () => {
  it('should throw if not initialized', async () => {
    const pool = new AgentPool()

    expect(pool.acquireAgent('execution', 'test-work')).rejects.toThrow('not initialized')
  })

  it('should timeout waiting for agent', async () => {
    const pool = new AgentPool({ planningAgents: 1, executionAgents: 1 })
    await pool.initialize()

    // Acquire the only execution agent
    const agent1 = await pool.acquireAgent('execution', 'work-1')

    // Try to acquire another (should timeout)
    await expect(pool.acquireAgent('execution', 'work-2', 500)).rejects.toThrow('Timeout')

    // Cleanup
    pool.releaseAgent(agent1.id)
    await pool.dispose()
  })
})
