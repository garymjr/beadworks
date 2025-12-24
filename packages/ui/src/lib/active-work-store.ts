/**
 * LocalStorage-based persistence for active work sessions
 * Enables reconnection to running agent work after page refresh
 */

export interface StoredActiveWork {
  issueId: string
  issueTitle: string
  startedAt: number
  projectPath: string
}

class ActiveWorkStore {
  private readonly STORAGE_KEY = 'beadworks_active_work'
  private readonly SESSION_MAX_AGE = 24 * 60 * 60 * 1000 // 24 hours in ms

  /**
   * Get all stored sessions
   */
  getAll(): StoredActiveWork[] {
    if (typeof window === 'undefined') return []

    try {
      const data = localStorage.getItem(this.STORAGE_KEY)
      if (!data) return []

      const sessions: StoredActiveWork[] = JSON.parse(data)
      // Filter out sessions older than 24 hours
      const now = Date.now()
      return sessions.filter((s) => now - s.startedAt < this.SESSION_MAX_AGE)
    } catch (error) {
      console.error(
        '[ActiveWorkStore] Failed to read from localStorage:',
        error,
      )
      return []
    }
  }

  /**
   * Add a session
   */
  add(session: StoredActiveWork): void {
    if (typeof window === 'undefined') return

    try {
      const sessions = this.getAll()
      // Remove any existing session with the same issueId (dedupe)
      const filtered = sessions.filter((s) => s.issueId !== session.issueId)
      filtered.push(session)
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered))
    } catch (error) {
      console.error('[ActiveWorkStore] Failed to write to localStorage:', error)
    }
  }

  /**
   * Remove a session
   */
  remove(issueId: string): void {
    if (typeof window === 'undefined') return

    try {
      const sessions = this.getAll()
      const filtered = sessions.filter((s) => s.issueId !== issueId)
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered))
    } catch (error) {
      console.error(
        '[ActiveWorkStore] Failed to remove from localStorage:',
        error,
      )
    }
  }

  /**
   * Clear all sessions
   */
  clear(): void {
    if (typeof window === 'undefined') return

    try {
      localStorage.removeItem(this.STORAGE_KEY)
    } catch (error) {
      console.error('[ActiveWorkStore] Failed to clear localStorage:', error)
    }
  }

  /**
   * Remove stale sessions (older than 24 hours)
   * This is automatically called by getAll(), but can be called explicitly
   */
  cleanup(): void {
    // getAll() already filters out stale sessions, so just re-save
    const sessions = this.getAll()
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(sessions))
    } catch (error) {
      console.error('[ActiveWorkStore] Failed to cleanup localStorage:', error)
    }
  }
}

// Global singleton instance
export const activeWorkStore = new ActiveWorkStore()
