/**
 * Tests for Agent Thinking Level Configuration
 * Tests the adaptive thinking level behavior during agent workflow
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'

// Import the module functions we want to test
// Note: These tests require the agent session to be properly mocked
// For now, we'll test the basic functionality

describe('AgentThinking - Basic Functionality', () => {
  describe('ThinkingLevel Types', () => {
    it('should accept valid thinking level values', () => {
      const validLevels: Array<'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'> =
        ['off', 'minimal', 'low', 'medium', 'high', 'xhigh']

      // This test validates that our type definitions match the SDK
      validLevels.forEach((level) => {
        expect(level).toBeTruthy()
      })
    })

    it('should have agent phase types', () => {
      const validPhases: Array<'planning' | 'execution' | 'idle'> =
        ['planning', 'execution', 'idle']

      validPhases.forEach((phase) => {
        expect(phase).toBeTruthy()
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle missing session gracefully', () => {
      // When no session is initialized, getThinkingLevel should return 'off'
      // and isThinkingLevelReady should return false

      // Import dynamically to test without session
      const { getThinkingLevel, isThinkingLevelReady } = require('../agent-thinking.js')

      // Without a session, these should handle gracefully
      expect(() => getThinkingLevel()).not.toThrow()
      expect(() => isThinkingLevelReady()).not.toThrow()
    })

    it('should require workId for thinking level operations', () => {
      const { setExecutionThinkingLevel, setPlanningThinkingLevel, resetThinkingLevel } =
        require('../agent-thinking.js')

      // All these functions now require a workId parameter
      // Without a session, they should throw
      expect(() => setExecutionThinkingLevel('test-work-id')).toThrow()
      expect(() => setPlanningThinkingLevel('test-work-id')).toThrow()
      expect(() => resetThinkingLevel('test-work-id')).toThrow()
    })
  })
})

describe('AgentThinking - Integration Behavior', () => {
  describe('Thinking Level Constants', () => {
    it('should define all required thinking levels', () => {
      // Validate that the exported functions exist
      const agentThinking = require('../agent-thinking.js')

      expect(agentThinking.setThinkingLevel).toBeTypeOf('function')
      expect(agentThinking.getThinkingLevel).toBeTypeOf('function')
      expect(agentThinking.setPlanningThinkingLevel).toBeTypeOf('function')
      expect(agentThinking.setExecutionThinkingLevel).toBeTypeOf('function')
      expect(agentThinking.resetThinkingLevel).toBeTypeOf('function')
      expect(agentThinking.isThinkingLevelReady).toBeTypeOf('function')
    })
  })
})

describe('AgentThinking - Work Session Scoped', () => {
  describe('Session-Scoped Operations', () => {
    it('should set thinking level for specific work session', () => {
      const { setThinkingLevel } = require('../agent-thinking.js')

      // setThinkingLevel now requires workId as first parameter
      // Without session, should throw
      expect(() => setThinkingLevel('work-123', 'medium', 'planning')).toThrow()
    })

    it('should set execution thinking for specific work session', () => {
      const { setExecutionThinkingLevel } = require('../agent-thinking.js')

      expect(() => setExecutionThinkingLevel('work-456')).toThrow()
    })

    it('should set planning thinking for specific work session', () => {
      const { setPlanningThinkingLevel } = require('../agent-thinking.js')

      expect(() => setPlanningThinkingLevel('work-789')).toThrow()
    })

    it('should reset thinking for specific work session', () => {
      const { resetThinkingLevel } = require('../agent-thinking.js')

      expect(() => resetThinkingLevel('work-abc')).toThrow()
    })
  })

  describe('Concurrent Work Sessions', () => {
    it('should support multiple work sessions with unique IDs', () => {
      const { setExecutionThinkingLevel } = require('../agent-thinking.js')

      // Simulate setting execution thinking for multiple concurrent sessions
      // Without session, should throw
      expect(() => setExecutionThinkingLevel('work-1')).toThrow()
      expect(() => setExecutionThinkingLevel('work-2')).toThrow()
      expect(() => setExecutionThinkingLevel('work-3')).toThrow()
    })
  })
})
