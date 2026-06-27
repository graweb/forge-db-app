"use client"

import { ChevronDown, ChevronRight } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu"
import { cn } from "@/helpers/utils"
import type { TreeViewNode, TreeViewProps } from "@/types/ui"

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
  const hasChildren = Boolean(node.children?.length)
  const Icon = node.icon
  const canExpandOnClick = node.expandOnClick !== false
  const isUnavailable = node.unavailable === true
  const storageKey = `forge-db:tree:${node.id}`

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const storedValue = window.sessionStorage.getItem(storageKey)

    if (storedValue === null) {
      setOpen(Boolean(node.defaultExpanded))
      return
    }

    setOpen(storedValue === "1")
  }, [node.defaultExpanded, storageKey])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    window.sessionStorage.setItem(storageKey, open ? "1" : "0")
  }, [open, storageKey])

  const chevron = hasChildren && !node.isLeaf && !isUnavailable ? (
    <button
      type="button"
      aria-label={open ? "Recolher item" : "Expandir item"}
      onClick={(event) => {
        event.stopPropagation()

        if (canExpandOnClick) {
          setOpen((current) => !current)
        }
      }}
      className="flex size-4 items-center justify-center rounded text-white/40 transition-colors hover:text-white"
    >
      {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
    </button>
  ) : (
    <span className="flex size-4 items-center justify-center text-white/40" />
  )

  const trigger = (
    <div
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-lg px-3 py-2 text-left text-sm transition-colors",
        level === 0 ? "text-white/80" : "text-white/72",
        isUnavailable ? "cursor-not-allowed text-white/55" : "",
        hasChildren && !node.isLeaf && canExpandOnClick
          ? "hover:bg-white/5 hover:text-white"
          : isUnavailable
            ? "hover:bg-white/4 hover:text-white/75"
            : "cursor-default hover:bg-transparent",
        node.selected ? "bg-sky-400/10 text-white" : ""
      )}
      style={{ paddingLeft: 12 + level * 16 }}
    >
      {chevron}
      <button
        type="button"
        onClick={() => {
          node.onSelect?.()
        }}
        onDoubleClick={() => {
          node.onDoubleClick?.()
        }}
        className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-left"
      >
        {Icon ? <Icon className="size-4 shrink-0 text-sky-300/90" /> : null}
        <span className="min-w-0 flex-1 overflow-hidden">
          <span className="block truncate">{node.label}</span>
          {node.subtitle ? (
            <span className="block truncate text-[11px] leading-4 text-white/40">
              {node.subtitle}
            </span>
          ) : null}
        </span>
        {node.badge ? <span className="ml-2 shrink-0">{node.badge}</span> : null}
      </button>
    </div>
  )

  return (
    <div>
      <div className="relative flex items-center gap-1">
        {node.contextActions ? (
          <ContextMenu>
            <ContextMenuTrigger asChild>{trigger}</ContextMenuTrigger>
            <ContextMenuContent>{node.contextActions}</ContextMenuContent>
          </ContextMenu>
        ) : (
          trigger
        )}
        {node.actions ? <div className="ml-auto flex items-center gap-1">{node.actions}</div> : null}
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
