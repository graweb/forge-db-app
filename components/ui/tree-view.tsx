"use client"

import { ChevronDown, ChevronRight } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type * as React from "react"

import { cn } from "@/lib/utils"

export type TreeViewNode = {
  id: string
  label: string
  icon?: LucideIcon
  badge?: React.ReactNode
  actions?: React.ReactNode
  contextActions?: React.ReactNode
  children?: TreeViewNode[]
  defaultExpanded?: boolean
  isLeaf?: boolean
  selected?: boolean
  onSelect?: () => void
  onDoubleClick?: () => void
}

type TreeViewProps = {
  nodes: TreeViewNode[]
  className?: string
}

export function TreeView({ nodes, className }: TreeViewProps) {
  return (
    <div className={cn("space-y-1", className)}>
      {nodes.map((node) => (
        <TreeNode key={node.id} node={node} level={0} />
      ))}
    </div>
  )
}

function TreeNode({ node, level }: { node: TreeViewNode; level: number }) {
  const [open, setOpen] = useState(Boolean(node.defaultExpanded))
  const [contextOpen, setContextOpen] = useState(false)
  const [contextPosition, setContextPosition] = useState({ x: 0, y: 0 })
  const hasChildren = Boolean(node.children?.length)
  const Icon = node.icon
  const contextRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!contextOpen) {
      return
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (contextRef.current && !contextRef.current.contains(event.target as Node)) {
        setContextOpen(false)
      }
    }

    window.addEventListener("mousedown", handleClickOutside)
    window.addEventListener("keydown", handleKeyDown)

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setContextOpen(false)
      }
    }

    return () => {
      window.removeEventListener("mousedown", handleClickOutside)
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [contextOpen])

  return (
    <div>
      <div ref={contextRef} className="relative flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            if (hasChildren && !node.isLeaf) {
              setOpen((current) => !current)
              return
            }
          }}
          onDoubleClick={() => {
            node.onDoubleClick?.()
          }}
          onContextMenu={(event) => {
            if (!node.contextActions) {
              return
            }

            event.preventDefault()
            setContextPosition({ x: event.clientX, y: event.clientY })
            setContextOpen(true)
          }}
          className={cn(
            "flex flex-1 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
            level === 0 ? "text-white/80" : "text-white/72",
            hasChildren && !node.isLeaf
              ? "hover:bg-white/5 hover:text-white"
              : "cursor-default hover:bg-transparent",
            node.selected ? "bg-sky-400/10 text-white" : ""
          )}
          style={{ paddingLeft: 12 + level * 16 }}
        >
          <span className="flex size-4 items-center justify-center text-white/40">
            {hasChildren && !node.isLeaf ? (
              open ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )
            ) : null}
          </span>
          {Icon ? <Icon className="size-4 shrink-0 text-sky-300/90" /> : null}
          <span className="min-w-0 flex-1 truncate">{node.label}</span>
          {node.badge ? node.badge : null}
        </button>

        {node.actions ? <div className="ml-auto flex items-center gap-1">{node.actions}</div> : null}

        {contextOpen && node.contextActions ? (
          <div
            className="fixed z-50 min-w-52 rounded-xl border border-white/10 bg-[#0b1322] p-1 shadow-[0_18px_40px_-20px_rgba(0,0,0,0.85)]"
            style={{
              left: contextPosition.x,
              top: contextPosition.y,
            }}
          >
            {node.contextActions}
          </div>
        ) : null}
      </div>

      {hasChildren && open ? (
        <div className="mt-1 space-y-1 border-l border-white/8">
          {node.children?.map((child) => (
            <TreeNode key={child.id} node={child} level={level + 1} />
          ))}
        </div>
      ) : null}
    </div>
  )
}
