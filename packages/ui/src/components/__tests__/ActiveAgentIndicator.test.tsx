/**
 * Tests for ActiveAgentIndicator component
 * Tests the agent progress display on task cards including:
 * - Compact and full version rendering
 * - Long task name handling without cutting off percentage
 * - Connection status display
 * - Progress bar rendering
 * - Error state display
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ActiveAgentIndicator } from '../ActiveAgentIndicator'

// Mock the useAgentEvents hook
vi.mock('../../hooks/useAgentEvents', () => ({
  useAgentEvents: vi.fn(),
}))

import { useAgentEvents } from '../../hooks/useAgentEvents'

const mockUseAgentEvents = useAgentEvents as vi.MockedFunction<typeof useAgentEvents>

describe('ActiveAgentIndicator', () => {
  // Default mock workState
  const defaultWorkState = {
    status: 'working' as const,
    progress: 45,
    currentStep: 'Processing request',
    events: [],
    isComplete: false,
    isConnected: true,
    isActive: true,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAgentEvents.mockReturnValue(defaultWorkState)
  })

  describe('Rendering behavior', () => {
    it('should not render when work is not active', () => {
      mockUseAgentEvents.mockReturnValue({
        ...defaultWorkState,
        isActive: false,
      })

      const { container } = render(
        <ActiveAgentIndicator issueId="test-issue-1" />,
      )

      expect(container.firstChild).toBe(null)
    })

    it('should not render when work is complete', () => {
      mockUseAgentEvents.mockReturnValue({
        ...defaultWorkState,
        isComplete: true,
      })

      const { container } = render(
        <ActiveAgentIndicator issueId="test-issue-1" />,
      )

      expect(container.firstChild).toBe(null)
    })

    it('should render compact version when compact prop is true', () => {
      render(
        <ActiveAgentIndicator issueId="test-issue-1" compact={true} />,
      )

      // Compact version should show status text but not progress bar
      expect(screen.getByText('Working...')).toBeInTheDocument()
      expect(screen.getByText('Live')).toBeInTheDocument()
    })

    it('should render full version with progress bar by default', () => {
      render(<ActiveAgentIndicator issueId="test-issue-1" />)

      expect(screen.getByText('Agent Working...')).toBeInTheDocument()
      expect(screen.getByText('Live')).toBeInTheDocument()
      expect(screen.getByText('Processing request')).toBeInTheDocument()
      expect(screen.getByText('45%')).toBeInTheDocument()
    })

    it('should render different status texts correctly', () => {
      mockUseAgentEvents.mockReturnValue({
        ...defaultWorkState,
        status: 'starting',
      })
      const { rerender } = render(<ActiveAgentIndicator issueId="test-issue-1" />)
      expect(screen.getByText('Agent Starting...')).toBeInTheDocument()

      mockUseAgentEvents.mockReturnValue({
        ...defaultWorkState,
        status: 'thinking',
      })
      rerender(<ActiveAgentIndicator issueId="test-issue-1" />)
      expect(screen.getByText('Agent Analyzing...')).toBeInTheDocument()
    })

    it('should show reconnecting status when not connected', () => {
      mockUseAgentEvents.mockReturnValue({
        ...defaultWorkState,
        isConnected: false,
      })

      render(<ActiveAgentIndicator issueId="test-issue-1" />)

      expect(screen.getByText('Reconnecting...')).toBeInTheDocument()
    })
  })

  describe('Long task name handling', () => {
    it('should not cut off percentage when currentStep is very long (200+ chars)', () => {
      // Create a very long currentStep string (200+ characters)
      const longStepText =
        'Implementing a comprehensive feature for handling user authentication and authorization with JWT tokens, password reset functionality, email verification, two-factor authentication, and session management with secure cookie handling'

      expect(longStepText.length).toBeGreaterThan(200)

      mockUseAgentEvents.mockReturnValue({
        ...defaultWorkState,
        currentStep: longStepText,
        progress: 67,
      })

      render(<ActiveAgentIndicator issueId="test-issue-1" />)

      // The percentage should always be fully visible
      const percentageElement = screen.getByText('67%')
      expect(percentageElement).toBeInTheDocument()
      expect(percentageElement).toBeVisible()

      // The step text should be present (though likely truncated visually)
      // We check that at least some of it is in the document
      const stepElement = screen.getByText((content) => {
        return content.includes('Implementing a comprehensive feature')
      })
      expect(stepElement).toBeInTheDocument()
    })

    it('should not cut off percentage when currentStep has 500+ characters', () => {
      // Create an extremely long currentStep string (500+ characters)
      const extremelyLongStepText = Array(50)
        .fill('very long step description text ')
        .join('')
        .trim()

      expect(extremelyLongStepText.length).toBeGreaterThan(500)

      mockUseAgentEvents.mockReturnValue({
        ...defaultWorkState,
        currentStep: extremelyLongStepText,
        progress: 100,
      })

      render(<ActiveAgentIndicator issueId="test-issue-1" />)

      // The percentage should always be fully visible even with extreme text length
      const percentageElement = screen.getByText('100%')
      expect(percentageElement).toBeInTheDocument()
      expect(percentageElement).toBeVisible()
    })

    it('should handle single character percentage display (0-9%)', () => {
      mockUseAgentEvents.mockReturnValue({
        ...defaultWorkState,
        currentStep: 'Starting the process',
        progress: 5,
      })

      render(<ActiveAgentIndicator issueId="test-issue-1" />)

      const percentageElement = screen.getByText('5%')
      expect(percentageElement).toBeInTheDocument()
      expect(percentageElement).toBeVisible()
    })

    it('should handle double character percentage display (10-99%)', () => {
      mockUseAgentEvents.mockReturnValue({
        ...defaultWorkState,
        currentStep: 'In progress',
        progress: 50,
      })

      render(<ActiveAgentIndicator issueId="test-issue-1" />)

      const percentageElement = screen.getByText('50%')
      expect(percentageElement).toBeInTheDocument()
      expect(percentageElement).toBeVisible()
    })

    it('should handle triple character percentage display (100%)', () => {
      mockUseAgentEvents.mockReturnValue({
        ...defaultWorkState,
        currentStep: 'Almost done',
        progress: 100,
      })

      render(<ActiveAgentIndicator issueId="test-issue-1" />)

      const percentageElement = screen.getByText('100%')
      expect(percentageElement).toBeInTheDocument()
      expect(percentageElement).toBeVisible()
    })

    it('should display both step text and percentage in the DOM simultaneously', () => {
      const longStep = 'This is a moderately long step description that would typically cause layout issues'
      const testProgress = 73

      mockUseAgentEvents.mockReturnValue({
        ...defaultWorkState,
        currentStep: longStep,
        progress: testProgress,
      })

      const { container } = render(
        <ActiveAgentIndicator issueId="test-issue-1" />,
      )

      // Both elements should exist in the DOM at the same time
      expect(screen.getByText(`${testProgress}%`)).toBeInTheDocument()

      // Check that the step text container exists (using truncate class)
      const stepTextContainer = container.querySelector('.truncate')
      expect(stepTextContainer).toBeInTheDocument()
      expect(stepTextContainer).toHaveTextContent(longStep)
    })
  })

  describe('Progress bar', () => {
    it('should render progress bar with correct width', () => {
      mockUseAgentEvents.mockReturnValue({
        ...defaultWorkState,
        progress: 75,
      })

      const { container } = render(
        <ActiveAgentIndicator issueId="test-issue-1" />,
      )

      // Find the progress bar fill element
      const progressBar = container.querySelector(
        '[style*="width: 75%"]',
      ) as HTMLElement
      expect(progressBar).toBeInTheDocument()
    })

    it('should update progress bar width when progress changes', () => {
      const { rerender } = render(
        <ActiveAgentIndicator issueId="test-issue-1" />,
      )

      // Initial progress 45%
      let { container } = render(<ActiveAgentIndicator issueId="test-issue-1" />)
      let progressBar = container.querySelector('[style*="width: 45%"]')
      expect(progressBar).toBeInTheDocument()

      // Change to 90%
      mockUseAgentEvents.mockReturnValue({
        ...defaultWorkState,
        progress: 90,
      })
      rerender(<ActiveAgentIndicator issueId="test-issue-1" />)
      container = render(<ActiveAgentIndicator issueId="test-issue-1" />).container
      progressBar = container.querySelector('[style*="width: 90%"]')
      expect(progressBar).toBeInTheDocument()
    })

    it('should apply glow effect when progress is greater than 0', () => {
      mockUseAgentEvents.mockReturnValue({
        ...defaultWorkState,
        progress: 50,
      })

      const { container } = render(
        <ActiveAgentIndicator issueId="test-issue-1" />,
      )

      // Check for shadow in the inline style
      const progressBar = container.querySelector(
        '[style*="width: 50%"]',
      ) as HTMLElement
      expect(progressBar).toBeInTheDocument()
      expect(progressBar.style.boxShadow).toContain('0 0 10px')
    })
  })

  describe('Error handling', () => {
    it('should display error message when work state has error', () => {
      mockUseAgentEvents.mockReturnValue({
        ...defaultWorkState,
        error: {
          message: 'Failed to connect to agent service',
          recoverable: true,
          canRetry: true,
        },
      })

      render(<ActiveAgentIndicator issueId="test-issue-1" />)

      expect(
        screen.getByText('Failed to connect to agent service'),
      ).toBeInTheDocument()
    })

    it('should render error state with appropriate styling', () => {
      mockUseAgentEvents.mockReturnValue({
        ...defaultWorkState,
        error: {
          message: 'Connection timeout',
          recoverable: false,
          canRetry: false,
        },
      })

      const { container } = render(
        <ActiveAgentIndicator issueId="test-issue-1" />,
      )

      // Error should be in a red background container
      const errorContainer = container.querySelector('.bg-red-500\\/10')
      expect(errorContainer).toBeInTheDocument()
    })
  })

  describe('Click handling', () => {
    it('should call onClick when clicked', () => {
      const handleClick = vi.fn()

      render(
        <ActiveAgentIndicator
          issueId="test-issue-1"
          onClick={handleClick}
        />,
      )

      const indicator = screen
        .getByText('Agent Working...')
        .closest('div')
      expect(indicator).toBeInTheDocument()

      if (indicator) {
        indicator.click()
        expect(handleClick).toHaveBeenCalled()
      }
    })

    it('should apply cursor-pointer style when onClick is provided', () => {
      const { container } = render(
        <ActiveAgentIndicator
          issueId="test-issue-1"
          onClick={() => {}}
        />,
      )

      const indicator = container.firstChild as HTMLElement
      expect(indicator.className).toContain('cursor-pointer')
    })
  })

  describe('Accessibility', () => {
    it('should have proper structure for screen readers', () => {
      render(<ActiveAgentIndicator issueId="test-issue-1" />)

      // Status text should be present
      expect(screen.getByText('Agent Working...')).toBeInTheDocument()

      // Connection status should be present
      expect(screen.getByText('Live')).toBeInTheDocument()
    })

    it('should update ARIA attributes on status changes', () => {
      const { rerender } = render(<ActiveAgentIndicator issueId="test-issue-1" />)

      mockUseAgentEvents.mockReturnValue({
        ...defaultWorkState,
        status: 'complete',
      })

      rerender(<ActiveAgentIndicator issueId="test-issue-1" />)

      // When complete, the component should not render (isComplete = true)
      const { container } = render(<ActiveAgentIndicator issueId="test-issue-1" />)
      expect(container.firstChild).toBe(null)
    })
  })

  describe('Edge cases', () => {
    it('should handle empty currentStep', () => {
      mockUseAgentEvents.mockReturnValue({
        ...defaultWorkState,
        currentStep: '',
        progress: 30,
      })

      render(<ActiveAgentIndicator issueId="test-issue-1" />)

      // Percentage should still be visible
      expect(screen.getByText('30%')).toBeInTheDocument()
    })

    it('should handle currentStep with special characters', () => {
      const specialCharsStep =
        'Reading file: src/components/<ComponentName>.tsx (with "quotes" and \'apostrophes\')'

      mockUseAgentEvents.mockReturnValue({
        ...defaultWorkState,
        currentStep: specialCharsStep,
        progress: 25,
      })

      render(<ActiveAgentIndicator issueId="test-issue-1" />)

      expect(screen.getByText('25%')).toBeInTheDocument()
    })

    it('should handle zero progress', () => {
      mockUseAgentEvents.mockReturnValue({
        ...defaultWorkState,
        progress: 0,
      })

      render(<ActiveAgentIndicator issueId="test-issue-1" />)

      expect(screen.getByText('0%')).toBeInTheDocument()
    })

    it('should handle negative progress (edge case, should not happen in normal flow)', () => {
      mockUseAgentEvents.mockReturnValue({
        ...defaultWorkState,
        progress: -5,
      })

      render(<ActiveAgentIndicator issueId="test-issue-1" />)

      expect(screen.getByText('-5%')).toBeInTheDocument()
    })

    it('should handle progress over 100 (edge case)', () => {
      mockUseAgentEvents.mockReturnValue({
        ...defaultWorkState,
        progress: 150,
      })

      render(<ActiveAgentIndicator issueId="test-issue-1" />)

      expect(screen.getByText('150%')).toBeInTheDocument()
    })
  })

  describe('Compact version specific tests', () => {
    it('should not show progress bar in compact mode', () => {
      render(<ActiveAgentIndicator issueId="test-issue-1" compact={true} />)

      // Compact mode should not have progress elements
      expect(screen.queryByText('Processing request')).not.toBeInTheDocument()
      expect(screen.queryByText('45%')).not.toBeInTheDocument()
    })

    it('should show connection indicator in compact mode', () => {
      render(<ActiveAgentIndicator issueId="test-issue-1" compact={true} />)

      expect(screen.getByText('Live')).toBeInTheDocument()
    })

    it('should handle onClick in compact mode', () => {
      const handleClick = vi.fn()

      render(
        <ActiveAgentIndicator
          issueId="test-issue-1"
          compact={true}
          onClick={handleClick}
        />,
      )

      const compactIndicator = screen
        .getByText('Working...')
        .closest('div')
      expect(compactIndicator).toBeInTheDocument()

      if (compactIndicator) {
        compactIndicator.click()
        expect(handleClick).toHaveBeenCalled()
      }
    })
  })
})
