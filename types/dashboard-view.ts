export type TableColumnPreview = {
  name: string
  dataType: string
  size: string
}

export type SourceTable = {
  id: string
  schemaName: string
  tableName: string
  reference: string
  columns: TableColumnPreview[]
}

export type JoinType = "LEFT JOIN" | "INNER JOIN" | "JOIN" | "CROSS JOIN"

export type SelectedTable = SourceTable & {
  joinType: JoinType
  joinCondition: string
}

export type FilterConnector = "AND" | "OR"

export type ViewFilter = {
  id: string
  expression: string
  connector?: FilterConnector
}

export type DragSource = "palette" | "canvas"
export type DropPosition = "before" | "after"

export type JoinLine = {
  id: string
  d: string
  label: string
  labelX: number
  labelY: number
}

export type ForeignKeySummary = {
  constraintName: string
  sourceColumn: string
  referencedTableName: string
  referencedColumnName: string
  onDelete: string
  onUpdate: string
}
