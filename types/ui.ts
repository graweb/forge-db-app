import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

export type TabsContextValue = {
  value: string
  setValue: (value: string) => void
}

export type TreeViewNode = {
  id: string
  label: string
  subtitle?: string
  icon?: LucideIcon
  badge?: ReactNode
  actions?: ReactNode
  contextActions?: ReactNode
  children?: TreeViewNode[]
  defaultExpanded?: boolean
  isLeaf?: boolean
  expandOnClick?: boolean
  unavailable?: boolean
  selected?: boolean
  onSelect?: () => void
  onDoubleClick?: () => void
}

export type TreeViewProps = {
  nodes: TreeViewNode[]
  className?: string
  resetToken?: number
}
