import { FolderInput, Terminal } from 'lucide-react'
import { useState } from 'react'

interface DirectoryPickerProps {
  value: string
  onChange: (path: string) => void
  onNameExtracted?: (name: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function DirectoryPicker({
  value,
  onChange,
  onNameExtracted,
  placeholder = '/Users/username/projects/my-project',
  className = '',
  disabled = false,
}: DirectoryPickerProps) {
  const [isLoading, setIsLoading] = useState(false)

  async function handleDirectoryPicker() {
    // Check if File System Access API is available
    if (!('showDirectoryPicker' in window)) {
      alert(
        'Directory picker not supported in this browser. Please use Chrome, Edge, or enter the path manually.',
      )
      return
    }

    setIsLoading(true)
    try {
      const dirHandle = await (window as any).showDirectoryPicker({
        mode: 'read',
      })

      // Try to find .beads directory and build the path
      const pathResult = await findBeadsDirectory(dirHandle)

      if (pathResult.fullPath) {
        onChange(pathResult.fullPath)
      } else {
        // Fallback to just the directory name
        onChange(dirHandle.name)
      }

      // Extract folder name for the project name
      if (onNameExtracted && pathResult.folderName) {
        onNameExtracted(pathResult.folderName)
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Directory picker error:', error)
        alert('Failed to select directory. Please try again.')
      }
      // User cancelled - ignore
    } finally {
      setIsLoading(false)
    }
  }

  async function handleAutoDetect() {
    // Try to detect the current working directory by checking if we're running
    // in a local environment and can access project info
    setIsLoading(true)
    try {
      // In a real app, this would call an API endpoint that returns
      // the current working directory from the server
      // For now, we'll use the current origin as a hint
      const response = await fetch('/api/bd/cwd')
      if (response.ok) {
        const data = await response.json()
        if (data.path) {
          onChange(data.path)
          if (onNameExtracted && data.name) {
            onNameExtracted(data.name)
          }
        }
      } else {
        alert(
          'Auto-detection not available. Please enter the path manually or use the folder picker.',
        )
      }
    } catch (error) {
      // API doesn't exist yet, just inform the user
      alert(
        'Auto-detection not available. Please enter the path manually or use the folder picker.',
      )
    } finally {
      setIsLoading(false)
    }
  }

  const isDisabled = disabled || isLoading

  return (
    <div className={className}>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all disabled:opacity-50"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
          disabled={isDisabled}
        />
        <button
          onClick={handleDirectoryPicker}
          disabled={isDisabled}
          className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors group relative disabled:opacity-50 disabled:cursor-not-allowed"
          title={isDisabled ? 'Loading...' : 'Browse for project directory'}
        >
          {isLoading ? (
            <svg
              className="w-5 h-5 text-slate-400 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : (
            <FolderInput className="w-5 h-5 text-slate-400 group-hover:text-slate-300 transition-colors" />
          )}
        </button>
        <button
          onClick={handleAutoDetect}
          disabled={isDisabled}
          className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors group relative disabled:opacity-50 disabled:cursor-not-allowed"
          title={isDisabled ? 'Loading...' : 'Auto-detect from terminal'}
        >
          <Terminal className="w-5 h-5 text-slate-400 group-hover:text-slate-300 transition-colors" />
        </button>
      </div>
      <p className="text-xs text-slate-500 mt-2">
        <span className="text-amber-400">Tip:</span> Type the full path, use the
        folder icon (relative path only), or the terminal icon to auto-detect.
      </p>
    </div>
  )
}

// Helper function to find .beads directory and build path
async function findBeadsDirectory(
  dirHandle: FileSystemDirectoryHandle,
  currentPath = '',
): Promise<{ fullPath: string; folderName: string }> {
  // Check if current directory has .beads
  try {
    await dirHandle.getDirectoryHandle('.beads', {
      create: false,
    })
    // Found .beads directory - this is the project root
    return {
      fullPath: currentPath || dirHandle.name,
      folderName: dirHandle.name,
    }
  } catch {
    // No .beads here, continue searching
  }

  // Recursively check subdirectories (limit depth to avoid infinite loops)
  const MAX_DEPTH = 5
  if (currentPath.split('/').length >= MAX_DEPTH) {
    return { fullPath: '', folderName: '' }
  }

  try {
    // Iterate through directory entries
    // Note: TypeScript types may not have full File System Access API support
    // Using type assertion to access the iterator
    const dirHandleAny = dirHandle as any
    for await (const entry of dirHandleAny.values()) {
      if (entry.kind === 'directory') {
        const subPath = currentPath
          ? `${currentPath}/${entry.name}`
          : entry.name
        const result = await findBeadsDirectory(
          entry as FileSystemDirectoryHandle,
          subPath,
        )
        if (result.fullPath) {
          return result
        }
      }
    }
  } catch (error) {
    // Permission denied or other error, skip
  }

  return { fullPath: '', folderName: '' }
}
