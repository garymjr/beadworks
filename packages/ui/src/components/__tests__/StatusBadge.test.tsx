/**
 * Tests for StatusBadge component
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBadge } from '../StatusBadge'

describe('StatusBadge', () => {
  describe('rendering', () => {
    it('renders count and label correctly', () => {
      render(<StatusBadge count={5} label="tasks loaded" />)

      expect(screen.getByText('5 tasks loaded')).toBeInTheDocument()
    })

    it('handles zero count correctly', () => {
      render(<StatusBadge count={0} label="agents running" />)

      expect(screen.getByText('0 agents running')).toBeInTheDocument()
    })

    it('renders large count numbers', () => {
      render(<StatusBadge count={9999} label="total items" />)

      expect(screen.getByText('9999 total items')).toBeInTheDocument()
    })

    it('renders with default neutral status', () => {
      const { container } = render(<StatusBadge count={3} label="items" />)

      const badge = container.querySelector('.bg-slate-400')
      expect(badge).toBeInTheDocument()
    })
  })

  describe('status colors', () => {
    it('applies success status with green dot when status="success"', () => {
      const { container } = render(
        <StatusBadge count={10} label="active" status="success" />,
      )

      const dot = container.querySelector('.bg-emerald-400')
      expect(dot).toBeInTheDocument()
    })

    it('applies error status with red dot when status="error"', () => {
      const { container } = render(
        <StatusBadge count={2} label="failed" status="error" />,
      )

      const dot = container.querySelector('.bg-red-400')
      expect(dot).toBeInTheDocument()
    })

    it('applies neutral status with slate dot when status="neutral"', () => {
      const { container } = render(
        <StatusBadge count={5} label="pending" status="neutral" />,
      )

      const dot = container.querySelector('.bg-slate-400')
      expect(dot).toBeInTheDocument()
    })

    it('applies neutral status by default when no status prop is provided', () => {
      const { container } = render(<StatusBadge count={7} label="items" />)

      // Should have neutral dot (slate color)
      const dot = container.querySelector('.bg-slate-400')
      expect(dot).toBeInTheDocument()

      // Should NOT have success or error dots
      expect(container.querySelector('.bg-emerald-400')).not.toBeInTheDocument()
      expect(container.querySelector('.bg-red-400')).not.toBeInTheDocument()
    })
  })

  describe('pulse animation', () => {
    it('shows pulse animation when showPulse=true', () => {
      const { container } = render(
        <StatusBadge count={3} label="items" showPulse={true} />,
      )

      const animatedElement = container.querySelector('.animate-pulse')
      expect(animatedElement).toBeInTheDocument()
    })

    it('does not show pulse animation when showPulse=false', () => {
      const { container } = render(
        <StatusBadge count={3} label="items" showPulse={false} />,
      )

      const animatedElement = container.querySelector('.animate-pulse')
      expect(animatedElement).not.toBeInTheDocument()
    })

    it('does not show pulse animation by default', () => {
      const { container } = render(<StatusBadge count={3} label="items" />)

      const animatedElement = container.querySelector('.animate-pulse')
      expect(animatedElement).not.toBeInTheDocument()
    })

    it('combines pulse animation with success status', () => {
      const { container } = render(
        <StatusBadge count={1} label="active" status="success" showPulse={true} />,
      )

      const dot = container.querySelector('.bg-emerald-400.animate-pulse')
      expect(dot).toBeInTheDocument()
    })

    it('combines pulse animation with error status', () => {
      const { container } = render(
        <StatusBadge count={1} label="error" status="error" showPulse={true} />,
      )

      const dot = container.querySelector('.bg-red-400.animate-pulse')
      expect(dot).toBeInTheDocument()
    })
  })

  describe('styling and structure', () => {
    it('applies glass-morphism styling', () => {
      const { container } = render(<StatusBadge count={5} label="items" />)

      const badge = container.firstChild as HTMLElement
      expect(badge).toHaveClass('bg-white/5')
      expect(badge).toHaveClass('border-white/10')
      expect(badge).toHaveClass('rounded-full')
    })

    it('uses JetBrains Mono font for text', () => {
      const { container } = render(<StatusBadge count={3} label="tasks" />)

      const textElement = container.querySelector('[style*="JetBrains Mono"]')
      expect(textElement).toBeInTheDocument()
    })

    it('renders dot indicator with correct size', () => {
      const { container } = render(<StatusBadge count={2} label="items" />)

      const dot = container.querySelector('.w-2.h-2.rounded-full')
      expect(dot).toBeInTheDocument()
    })
  })

  describe('edge cases', () => {
    it('handles negative count (displays as-is)', () => {
      render(<StatusBadge count={-1} label="errors" />)

      expect(screen.getByText('-1 errors')).toBeInTheDocument()
    })

    it('handles empty label', () => {
      render(<StatusBadge count={5} label="" />)

      expect(screen.getByText('5')).toBeInTheDocument()
    })

    it('handles special characters in label', () => {
      render(<StatusBadge count={3} label="tasks loaded!" />)

      expect(screen.getByText('3 tasks loaded!')).toBeInTheDocument()
    })

    it('handles very long labels', () => {
      const longLabel = 'items that are currently being processed by the system'
      render(<StatusBadge count={1} label={longLabel} />)

      expect(screen.getByText(`1 ${longLabel}`)).toBeInTheDocument()
    })
  })

  describe('combinations', () => {
    it('correctly combines all props: success status with pulse', () => {
      const { container } = render(
        <StatusBadge count={42} label="agents running" status="success" showPulse={true} />,
      )

      // Should have the correct text
      expect(screen.getByText('42 agents running')).toBeInTheDocument()

      // Should have green dot with pulse
      const dot = container.querySelector('.bg-emerald-400.animate-pulse')
      expect(dot).toBeInTheDocument()

      // Should have proper styling
      const badge = container.firstChild as HTMLElement
      expect(badge).toHaveClass('bg-white/5')
    })

    it('correctly combines all props: error status without pulse', () => {
      const { container } = render(
        <StatusBadge count={0} label="connections" status="error" showPulse={false} />,
      )

      // Should have the correct text
      expect(screen.getByText('0 connections')).toBeInTheDocument()

      // Should have red dot without pulse
      const dot = container.querySelector('.bg-red-400')
      expect(dot).toBeInTheDocument()
      const animatedDot = container.querySelector('.bg-red-400.animate-pulse')
      expect(animatedDot).not.toBeInTheDocument()
    })
  })
})
