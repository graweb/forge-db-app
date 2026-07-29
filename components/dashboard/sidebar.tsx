"use client"

import Image from "next/image"
import {
  Eye,
  Database,
  FolderGit2,
  Hash,
  Layers3,
  Plus,
  RefreshCw,
  FileCode,
  Sigma,
  Table,
  Table2,
  User,
  Users,
  Wrench,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu"
import { TreeView } from "@/components/ui/tree-view"

import { getDatabaseLabel, getDatabaseLogoPath } from "@/helpers/dashboard"
import { quoteIdentifier } from "@/helpers/connections"
import type {
  DatabaseStructure,
  DatabaseStructureDatabase,
  DatabaseStructureGroup,
  SavedConnection,
} from "@/types/connections"
import type { DashboardSidebarActions, DashboardSidebarProps } from "@/types/dashboard-sidebar"
import type { TreeViewNode } from "@/types/ui"
import { cn } from "@/helpers/utils"

const sectionIcons = {
  Tabelas: Table,
  Views: Eye,
  Índices: FileCode,
  Procedures: Wrench,
  Funções: Sigma,
}

export function DashboardSidebar({
  activeConnectionId,
  connections,
  connectionAvailabilityById,
  databaseStructuresById,
  onAddConnection,
  onRefreshConnections,
  treeResetToken,
  onCreateDatabase,
  onCreateTable,
  onCreateView,
  onCreateRoutine,
  onRefreshRoutineGroup,
  onExecuteRoutine,
  onEditRoutine,
  onDeleteRoutine,
  onEditTable,
  onDeleteTable,
  onSelect100Rows,
  onEditDatabase,
  onDeleteDatabase,
  onEditView,
  onDeleteView,
  onCreateUser,
  onDisconnectConnection,
  onSelectConnection,
  onEditConnection,
  onDeleteConnection,
  onRefreshStructure,
  onRefreshDatabaseStructure,
  onInsertText,
  onOpenSqlInNewTab,
  onPreviewTable,
  onExecuteTable,
  onRunTableQuery,
}: DashboardSidebarProps) {
  const treeNodes = buildTreeNodes(connections, activeConnectionId, databaseStructuresById, {
    connectionAvailabilityById,
    onCreateDatabase,
    onCreateTable,
    onCreateView,
    onCreateRoutine,
    onRefreshRoutineGroup,
    onExecuteRoutine,
    onEditRoutine,
    onDeleteRoutine,
    onEditTable,
    onDeleteTable,
    onSelect100Rows,
    onEditDatabase,
    onDeleteDatabase,
    onEditView,
    onDeleteView,
    onCreateUser,
    onDisconnectConnection,
    onSelectConnection,
    onEditConnection,
    onDeleteConnection,
    onRefreshStructure,
    onRefreshDatabaseStructure,
    onInsertText,
    onOpenSqlInNewTab,
    onPreviewTable,
    onExecuteTable,
    onRunTableQuery,
  })

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden border-r border-white/10 bg-[#07111d]/95">
      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <section className="space-y-3">
          

          <div className="flex items-center justify-center py-1">
            <Image
              src="/logo_branco.png"
              alt="Forge DB"
              width={160}
              height={48}
              priority
              className="h-32 w-auto object-contain"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              onClick={onAddConnection}
              className={cn(
                "group flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border bg-white/2 px-2 py-2 text-xs text-white/85 transition-all hover:-translate-y-0.5 hover:border-sky-400/35 hover:bg-white/5 hover:text-white",
                "border-white/10"
              )}
            >
              <Plus className="size-4 shrink-0" />
              Adicionar
            </Button>

            <Button
              type="button"
              onClick={onRefreshConnections}
              className={cn(
                "group flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border bg-white/2 px-2 py-2 text-xs text-white/85 transition-all hover:-translate-y-0.5 hover:border-sky-400/35 hover:bg-white/5 hover:text-white",
                "border-white/10"
              )}
            >
              <RefreshCw className="size-4 shrink-0 transition-transform duration-300 group-hover:rotate-180" />
              Atualizar
            </Button>
          </div>

          {connections.length ? (
            <div className="rounded-2xl border border-white/8 bg-white/2 p-2">
              <TreeView nodes={treeNodes} resetToken={treeResetToken} />
            </div>
          ) : null}
        </section>
      </div>
    </aside>
  )
}

function buildTreeNodes(
  connections: SavedConnection[],
  activeConnectionId: string | null,
  databaseStructuresById: Record<string, DatabaseStructure>,
  actions: DashboardSidebarActions
): TreeViewNode[] {
  return connections.map((connection) => {
    const databaseStructure: DatabaseStructure = databaseStructuresById[connection.id] ?? {
      databases: [],
      schemas: [],
      groups: [],
      users: [],
    }
    const firstDatabase: DatabaseStructureDatabase | undefined = databaseStructure.databases[0]
    const primaryDatabase =
      firstDatabase ??
      ({
        name: getDatabaseNodeLabel(connection),
        schemas: databaseStructure.schemas,
        groups: databaseStructure.groups,
      } as DatabaseStructureDatabase)
    const availability = actions.connectionAvailabilityById[connection.id]
    const isAvailable = availability?.available !== false
    const canCreateDatabase = isAvailable && connection.databaseType !== "sqlite"
    const connectionSubtitle = getConnectionTreeSubtitle(connection)
    const isActive = connection.id === activeConnectionId
    const isConnected = isAvailable && isActive
    const usersNode = buildUsersNode(connection, databaseStructure, actions)

    const childNodes =
      (connection.databaseType === "sqlserver" ||
        connection.databaseType === "mysql" ||
        connection.databaseType === "mariadb") &&
      databaseStructure.databases.length > 0
        ? [
            {
              id: `databases-${connection.id}`,
              label: "Banco de dados",
              icon: FolderGit2,
              defaultExpanded: false,
              contextActions: isAvailable ? (
                <DatabaseNodeContextMenu
                  canCreate={canCreateDatabase}
                  onCreateDatabase={() => actions.onCreateDatabase(connection)}
                  onRefreshStructure={actions.onRefreshStructure}
                />
              ) : null,
              children: databaseStructure.databases.map((database) =>
                buildDatabaseNode(connection, database, actions)
              ),
            },
            usersNode,
          ]
      : [
            {
              id: `database-${connection.id}`,
              label: firstDatabase?.name ?? getDatabaseNodeLabel(connection),
              icon: FolderGit2,
              defaultExpanded: false,
              contextActions: isAvailable ? (
                <DatabaseItemContextMenu
                  onEditDatabase={() => actions.onEditDatabase(connection, primaryDatabase)}
                  onDeleteDatabase={() => actions.onDeleteDatabase(connection, primaryDatabase)}
                  onRefreshDatabaseStructure={actions.onRefreshDatabaseStructure}
                />
              ) : null,
              children: firstDatabase
                ? getSchemaNodesForDatabase(connection, firstDatabase, actions)
                : getSchemaNodes(connection, databaseStructure, actions),
            },
            usersNode,
          ]

    return {
      id: `connection-${connection.id}`,
      label: connection.connectionName,
      subtitle: connectionSubtitle,
      icon: Database,
      logoSrc: getDatabaseLogoPath(connection.databaseType),
      logoAlt: `${getDatabaseLabel(connection.databaseType)} logo`,
      badge: (
        <Badge
          className={
            isAvailable
              ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
              : "border-rose-400/20 bg-rose-400/10 text-rose-300"
          }
        >
          <span
            className={`mr-1 size-1.5 rounded-full ${
              isAvailable ? "bg-emerald-400" : "bg-rose-400"
            }`}
          />
          {isAvailable ? "Online" : "Indisponível"}
        </Badge>
      ),
      defaultExpanded: false,
      expandOnClick: isConnected,
      unavailable: !isAvailable,
      selected: isActive,
      onSelect: () => actions.onSelectConnection(connection),
      contextActions: (
        <ConnectionTreeContextMenu
          isActive={isActive}
          canConnect={isAvailable}
          onConnect={() => actions.onSelectConnection(connection)}
          onDisconnect={actions.onDisconnectConnection}
          onEdit={() => actions.onEditConnection(connection)}
          onDelete={() => actions.onDeleteConnection(connection)}
        />
      ),
      children: isConnected ? childNodes : undefined,
    }
  })
}

function ConnectionTreeContextMenu({
  isActive,
  canConnect,
  onConnect,
  onDisconnect,
  onEdit,
  onDelete,
}: {
  isActive: boolean
  canConnect: boolean
  onConnect: () => void
  onDisconnect: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="min-w-52 p-1">
      <ContextMenuItem disabled={isActive || !canConnect} onSelect={onConnect}>
        Conectar
      </ContextMenuItem>
      <ContextMenuItem disabled={!isActive} onSelect={onDisconnect}>
        Desconectar
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={onEdit}>Editar</ContextMenuItem>
      <ContextMenuItem onSelect={onDelete}>Remover</ContextMenuItem>
    </div>
  )
}

function DatabaseNodeContextMenu({
  canCreate,
  onCreateDatabase,
  onRefreshStructure,
}: {
  canCreate: boolean
  onCreateDatabase: () => void
  onRefreshStructure: () => void
}) {
  return (
    <div className="min-w-52 p-1">
      <ContextMenuItem disabled={!canCreate} onSelect={onCreateDatabase}>
        Criar banco de dados
      </ContextMenuItem>
      <ContextMenuItem onSelect={onRefreshStructure}>Atualizar</ContextMenuItem>
    </div>
  )
}

function DatabaseItemContextMenu({
  onEditDatabase,
  onDeleteDatabase,
  onRefreshDatabaseStructure,
}: {
  onEditDatabase: () => void
  onDeleteDatabase: () => void
  onRefreshDatabaseStructure: () => void
}) {
  return (
    <div className="min-w-52 p-1">
      <ContextMenuItem onSelect={onEditDatabase}>Editar</ContextMenuItem>
      <ContextMenuItem onSelect={onDeleteDatabase}>Excluir</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={onRefreshDatabaseStructure}>Atualizar</ContextMenuItem>
    </div>
  )
}

function buildUsersNode(
  connection: SavedConnection,
  databaseStructure: DatabaseStructure,
  actions: DashboardSidebarActions
): TreeViewNode {
  const users = databaseStructure.users ?? []
  const targetDatabaseName = databaseStructure.databases[0]?.name || connection.databaseName
  const targetSchemaName = databaseStructure.schemas[0]?.name || getDefaultSchemaName(connection)

  return {
    id: `users-${connection.id}`,
    label: "Usuários",
    icon: Users,
    defaultExpanded: false,
    expandOnClick: true,
    badge: users.length,
    contextActions: (
      <div className="min-w-52 p-1">
        <ContextMenuItem
          onSelect={() =>
            actions.onCreateUser(connection, {
              databaseName: targetDatabaseName,
              schemaName: targetSchemaName,
            })
          }
        >
          Criar usuário
        </ContextMenuItem>
        <ContextMenuItem onSelect={actions.onRefreshStructure}>Atualizar</ContextMenuItem>
      </div>
    ),
    children: users.map((userName) => ({
      id: `users-${connection.id}-${userName}`,
      label: userName,
      icon: User,
      isLeaf: true,
      contextActions: (
        <div className="min-w-52 p-1">
          <ContextMenuItem onSelect={actions.onRefreshStructure}>Atualizar</ContextMenuItem>
        </div>
      ),
    })),
  }
}

function TableGroupContextMenu({
  onCreateTable,
  onRefreshStructure,
}: {
  onCreateTable: () => void
  onRefreshStructure: () => void
}) {
  return (
    <div className="min-w-52 p-1">
      <ContextMenuItem onSelect={onCreateTable}>Criar tabela</ContextMenuItem>
      <ContextMenuItem onSelect={onRefreshStructure}>Atualizar</ContextMenuItem>
    </div>
  )
}

function buildDatabaseNode(
  connection: SavedConnection,
  database: DatabaseStructureDatabase,
  actions: DashboardSidebarActions
): TreeViewNode {
    return {
      id: `database-${connection.id}-${database.name}`,
      label: database.name,
      icon: Database,
      defaultExpanded: false,
      contextActions: (
        <DatabaseItemContextMenu
          onEditDatabase={() => actions.onEditDatabase(connection, database)}
          onDeleteDatabase={() => actions.onDeleteDatabase(connection, database)}
          onRefreshDatabaseStructure={actions.onRefreshDatabaseStructure}
        />
      ),
      children:
        connection.databaseType === "mysql" || connection.databaseType === "mariadb"
          ? getMySqlLikeDatabaseChildren(connection, database, actions)
          : getSchemaNodesForDatabase(connection, database, actions),
    }
  }

function getSchemaNodes(
  connection: SavedConnection,
  databaseStructure: DatabaseStructure,
  actions: DashboardSidebarActions
): TreeViewNode[] {
  return getSchemaNodesForDatabase(connection, {
    name: getDatabaseNodeLabel(connection),
    schemas: databaseStructure.schemas,
    groups: databaseStructure.groups,
  }, actions)
}

function getMySqlLikeDatabaseChildren(
  connection: SavedConnection,
  database: DatabaseStructureDatabase,
  actions: DashboardSidebarActions
): TreeViewNode[] {
  return sortDatabaseGroups(database.groups).map((group) => buildGroupNode(connection, database, group, actions, database.name))
}

function getSchemaNodesForDatabase(
  connection: SavedConnection,
  database: DatabaseStructureDatabase,
  actions: DashboardSidebarActions
): TreeViewNode[] {
  const schemas = database.schemas.length
    ? database.schemas
    : [{ name: getDefaultSchemaName(connection), groups: database.groups }]
  const availability = actions.connectionAvailabilityById[connection.id]
  const isAvailable = availability?.available !== false

  return schemas.map((schema) => ({
    id: `schema-${connection.id}-${schema.name}`,
    label: schema.name,
    icon: Layers3,
    defaultExpanded: false,
    children: sortDatabaseGroups(schema.groups).map((group) =>
      buildGroupNode(connection, database, group, actions, schema.name, isAvailable)
    ),
  }))
}

function buildGroupNode(
  connection: SavedConnection,
  database: DatabaseStructureDatabase,
  group: DatabaseStructureGroup,
  actions: DashboardSidebarActions,
  schemaName: string,
  isAvailable = actions.connectionAvailabilityById[connection.id]?.available !== false
): TreeViewNode {
  const Icon = sectionIcons[group.label as keyof typeof sectionIcons] ?? FileCode
  const supportsQueryActions = group.label === "Tabelas" || group.label === "Views"
  const isTableGroup = group.label === "Tabelas"
  const isViewGroup = group.label === "Views"
  const isProcedureGroup = group.label === "Procedures"
  const isFunctionGroup = group.label === "Funções"

  return {
    id: `${connection.id}-${schemaName}-${group.label}`,
    label: group.label,
    icon: Icon,
    badge: group.items.length,
    defaultExpanded: false,
    contextActions:
      isAvailable && isTableGroup ? (
        <TableGroupContextMenu
          onCreateTable={() => actions.onCreateTable(connection, database, schemaName)}
          onRefreshStructure={actions.onRefreshDatabaseStructure}
        />
      ) : isAvailable && isViewGroup ? (
        <ViewGroupContextMenu
          onCreateView={() => actions.onCreateView(connection, database, schemaName)}
          onRefreshStructure={actions.onRefreshDatabaseStructure}
        />
      ) : isAvailable && isProcedureGroup ? (
        <RoutineGroupContextMenu
          createLabel={connection.databaseType === "sqlite" ? "Procedures não suportadas" : "Criar procedure"}
          supported={connection.databaseType !== "sqlite"}
          onCreate={() => actions.onCreateRoutine(connection, database, schemaName, "procedure")}
          onRefresh={() => void actions.onRefreshRoutineGroup(connection, database, schemaName, "Procedures")}
        />
      ) : isAvailable && isFunctionGroup ? (
        <RoutineGroupContextMenu
          createLabel={connection.databaseType === "sqlite" ? "Funções da aplicação" : "Criar função"}
          supported={connection.databaseType !== "sqlite"}
          onCreate={() => actions.onCreateRoutine(connection, database, schemaName, "function")}
          onRefresh={() => void actions.onRefreshRoutineGroup(connection, database, schemaName, "Funções")}
        />
      ) : null,
    children: group.items.map((item) => {
      const tableReference = getTableReference(
        connection,
        schemaName,
        item,
        connection.databaseType === "sqlserver" ? database.name : undefined
      )
      const queryDatabaseName = getEffectiveDatabaseName(connection, database)
      const tableSchemaName = connection.databaseType === "sqlite" ? "main" : schemaName
      const tableName = item
      const columnDetails = group.columnsDetailsByItem?.[item] ?? []
      const tableSize = isTableGroup ? group.sizesByItem?.[item] : undefined
      const routineKind = isProcedureGroup ? "procedure" : isFunctionGroup ? "function" : null
      const renderTableItemContextMenu = () => (
        <TableItemContextMenu
          onCreateTable={() => actions.onCreateTable(connection, database, schemaName)}
          onEditTable={() => actions.onEditTable(connection, database, tableSchemaName, tableName)}
          onDeleteTable={() =>
            actions.onDeleteTable(connection, database, tableSchemaName, tableName)
          }
          onSelect100Rows={() =>
            actions.onSelect100Rows(connection, database, tableSchemaName, tableName, "table")
          }
          onGenerateSelectSql={() =>
            actions.onOpenSqlInNewTab(
              generateTableSql(connection, "select", tableReference, columnDetails),
              `SELECT ${tableName}`
            )
          }
          onGenerateInsertSql={() =>
            actions.onOpenSqlInNewTab(
              generateTableSql(connection, "insert", tableReference, columnDetails),
              `INSERT ${tableName}`
            )
          }
          onGenerateUpdateSql={() =>
            actions.onOpenSqlInNewTab(
              generateTableSql(connection, "update", tableReference, columnDetails),
              `UPDATE ${tableName}`
            )
          }
          onGenerateDeleteSql={() =>
            actions.onOpenSqlInNewTab(
              generateTableSql(connection, "delete", tableReference, columnDetails),
              `DELETE ${tableName}`
            )
          }
        />
      )
      const renderViewItemContextMenu = () => (
        <ViewItemContextMenu
          onSelect100Rows={() => actions.onSelect100Rows(connection, database, schemaName, item, "view")}
          onEditView={() => actions.onEditView(connection, database, schemaName, tableReference, item)}
          onDeleteView={() => actions.onDeleteView(connection, database, schemaName, tableReference, item)}
        />
      )
      const renderRoutineItemContextMenu = () =>
        routineKind ? (
          <RoutineItemContextMenu
            onExecute={() => actions.onExecuteRoutine(connection, database, schemaName, item, routineKind)}
            onEdit={() => actions.onEditRoutine(connection, database, schemaName, item, routineKind)}
            onDelete={() => actions.onDeleteRoutine(connection, database, schemaName, item, routineKind)}
          />
        ) : null
      const columnChildren =
        isTableGroup && columnDetails.length
          ? columnDetails.map((column) => ({
              id: `${connection.id}-${schemaName}-${group.label}-${item}-column-${column.name}`,
              label: column.name,
              subtitle: `${column.dataType.toLowerCase()}${column.size ? `(${column.size})` : ""}`,
              icon: Hash,
              isLeaf: true,
              contextActions: renderTableItemContextMenu(),
            }))
          : undefined
      const isLeafItem = !columnChildren?.length

      return {
        id: `${connection.id}-${schemaName}-${group.label}-${item}`,
        label: item,
        icon: Table2,
        badge:
          typeof tableSize === "number" ? (
            <span className="rounded-full border border-white/10 bg-white/4 px-2 py-0.5 text-[10px] font-medium text-white/45">
              {formatTableSize(tableSize)}
            </span>
          ) : undefined,
        children: columnChildren,
        isLeaf: isLeafItem,
        onDoubleClick: supportsQueryActions
          ? () => void actions.onRunTableQuery(tableReference, queryDatabaseName, isViewGroup ? "view" : "table")
          : undefined,
        contextActions: isTableGroup
          ? renderTableItemContextMenu()
          : isViewGroup
            ? renderViewItemContextMenu()
            : routineKind
              ? renderRoutineItemContextMenu()
              : (
                <TreeContextMenu
                  objectPath={tableReference}
                  onInsertText={() => actions.onInsertText(`SELECT *\nFROM ${tableReference};`)}
                  onPreviewTable={() => void actions.onPreviewTable(tableReference)}
                  onExecuteTable={() => void actions.onExecuteTable(tableReference)}
                  supportsQueryActions={supportsQueryActions}
                />
              ),
      }
    }),
  }
}

function RoutineGroupContextMenu({
  createLabel,
  supported = true,
  onCreate,
  onRefresh,
}: {
  createLabel: string
  supported?: boolean
  onCreate: () => void
  onRefresh: () => void
}) {
  return (
    <div className="min-w-52 p-1">
      <ContextMenuItem disabled={!supported} onSelect={onCreate}>{createLabel}</ContextMenuItem>
      <ContextMenuItem onSelect={onRefresh}>Atualizar</ContextMenuItem>
    </div>
  )
}

function RoutineItemContextMenu({
  onExecute,
  onEdit,
  onDelete,
}: {
  onExecute: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="min-w-52 p-1">
      <ContextMenuItem onSelect={onExecute}>Executar</ContextMenuItem>
      <ContextMenuItem onSelect={onEdit}>Editar</ContextMenuItem>
      <ContextMenuItem onSelect={onDelete}>Excluir</ContextMenuItem>
    </div>
  )
}

function ViewGroupContextMenu({
  onCreateView,
  onRefreshStructure,
}: {
  onCreateView: () => void
  onRefreshStructure: () => void
}) {
  return (
    <div className="min-w-52 p-1">
      <ContextMenuItem
        onSelect={onCreateView}
      >
        Criar view
      </ContextMenuItem>
      <ContextMenuItem onSelect={onRefreshStructure}>Atualizar</ContextMenuItem>
    </div>
  )
}

function ViewItemContextMenu({
  onSelect100Rows,
  onEditView,
  onDeleteView,
}: {
  onSelect100Rows: () => void
  onEditView: () => void
  onDeleteView: () => void
}) {
  return (
    <div className="min-w-52 p-1">
      <ContextMenuItem onSelect={onSelect100Rows}>Selecionar 100 linhas</ContextMenuItem>
      <ContextMenuItem onSelect={onEditView}>Editar</ContextMenuItem>
      <ContextMenuItem onSelect={onDeleteView}>Excluir</ContextMenuItem>
    </div>
  )
}

function TreeContextMenu({
  objectPath,
  onInsertText,
  onPreviewTable,
  onExecuteTable,
  supportsQueryActions,
}: {
  objectPath: string
  onInsertText: () => void
  onPreviewTable: () => void
  onExecuteTable: () => void
  supportsQueryActions: boolean
}) {
  return (
    <div className="p-1">
      <ContextMenuItem onSelect={onInsertText}>Inserir {objectPath}</ContextMenuItem>
      {supportsQueryActions ? (
        <>
          <ContextMenuItem onSelect={onPreviewTable}>Pré-visualizar {objectPath}</ContextMenuItem>
          <ContextMenuItem onSelect={onExecuteTable}>Executar {objectPath}</ContextMenuItem>
        </>
      ) : null}
    </div>
  )
}

function TableItemContextMenu({
  onCreateTable,
  onEditTable,
  onDeleteTable,
  onSelect100Rows,
  onGenerateSelectSql,
  onGenerateInsertSql,
  onGenerateUpdateSql,
  onGenerateDeleteSql,
}: {
  onCreateTable: () => void
  onEditTable: () => void
  onDeleteTable: () => void
  onSelect100Rows: () => void
  onGenerateSelectSql: () => void
  onGenerateInsertSql: () => void
  onGenerateUpdateSql: () => void
  onGenerateDeleteSql: () => void
}) {
  return (
    <div className="min-w-52 p-1">
      <ContextMenuItem onSelect={onCreateTable}>Criar tabela</ContextMenuItem>
      <ContextMenuItem onSelect={onEditTable}>Editar tabela</ContextMenuItem>
      <ContextMenuItem onSelect={onDeleteTable}>Excluir tabela</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={onSelect100Rows}>Selecionar 100 linhas</ContextMenuItem>
      <ContextMenuSub>
        <ContextMenuSubTrigger>Gerar SQL</ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuItem onSelect={onGenerateSelectSql}>select</ContextMenuItem>
          <ContextMenuItem onSelect={onGenerateInsertSql}>insert</ContextMenuItem>
          <ContextMenuItem onSelect={onGenerateUpdateSql}>update</ContextMenuItem>
          <ContextMenuItem onSelect={onGenerateDeleteSql}>delete</ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>
    </div>
  )
}

function getDatabaseNodeLabel(connection: SavedConnection) {
  const label = getDatabaseLabel(connection.databaseType)

  if (connection.databaseType === "sqlite") {
    return label
  }

  const databaseName = connection.databaseName.trim()
  return databaseName ? `${label}: ${databaseName}` : label
}

function getConnectionTreeSubtitle(connection: SavedConnection) {
  if (connection.databaseType === "sqlite") {
    return connection.databaseFile.trim() || "SQLite local"
  }

  const host = connection.host.trim() || "localhost"
  const port = connection.port.trim()
  return port ? `${host}:${port}` : host
}

function getDefaultSchemaName(connection: SavedConnection) {
  if (connection.databaseType === "sqlite") {
    return "main"
  }

  return connection.databaseName.trim() || "schema_1"
}

function getEffectiveDatabaseName(
  connection: SavedConnection,
  database: DatabaseStructureDatabase
) {
  if (
    connection.databaseType === "mysql" ||
    connection.databaseType === "mariadb" ||
    connection.databaseType === "postgresql" ||
    connection.databaseType === "sqlserver"
  ) {
    return database.name
  }

  return connection.databaseName || database.name
}

function sortDatabaseGroups(groups: DatabaseStructureGroup[]) {
  const order = ["Tabelas", "Views", "Índices", "Procedures", "Funções"]

  return [...groups].sort((left, right) => {
    const leftIndex = order.indexOf(left.label)
    const rightIndex = order.indexOf(right.label)

    const normalizedLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex
    const normalizedRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex

    if (normalizedLeft !== normalizedRight) {
      return normalizedLeft - normalizedRight
    }

    return left.label.localeCompare(right.label, "pt-BR")
  })
}

function formatTableSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 MB"
  }

  const units = ["MB", "GB", "TB"] as const
  let value = bytes / 1024 / 1024
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const fractionDigits = value < 1 ? 2 : value >= 10 || unitIndex === 0 ? 1 : 2
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: value < 1 ? 2 : 0,
    maximumFractionDigits: fractionDigits,
  })} ${units[unitIndex]}`
}

function getTableReference(
  connection: SavedConnection,
  schemaName: string,
  tableName: string,
  databaseName?: string
) {
  const normalizedSchema = schemaName.trim()
  const normalizedTable = tableName.trim()
  const normalizedDatabase = databaseName?.trim() ?? ""

  if (!normalizedSchema || !normalizedTable) {
    return normalizedTable || normalizedSchema
  }

  if (connection.databaseType === "sqlite" && normalizedSchema === "main") {
    return normalizedTable
  }

  if (connection.databaseType === "postgresql" && normalizedSchema === "public") {
    return normalizedTable
  }

  if (connection.databaseType === "sqlserver") {
    const qualifiedDatabase = normalizedDatabase ? formatSqlServerIdentifier(normalizedDatabase) : ""
    const qualifiedSchema = formatSqlServerIdentifier(normalizedSchema)
    const qualifiedTable = formatSqlServerIdentifier(normalizedTable)

    if (!qualifiedDatabase) {
      return `${qualifiedSchema}.${qualifiedTable}`
    }

    return `${qualifiedDatabase}.${qualifiedSchema}.${qualifiedTable}`
  }

  if (
    (connection.databaseType === "mysql" || connection.databaseType === "mariadb") &&
    normalizedSchema === connection.databaseName.trim()
  ) {
    return normalizedTable
  }

  return `${normalizedSchema}.${normalizedTable}`
}

function generateTableSql(
  connection: SavedConnection,
  action: "select" | "insert" | "update" | "delete",
  tableReference: string,
  columns: Array<{ name: string; dataType: string; size: string }>
) {
  const columnNames = columns.map((column) => quoteIdentifier(connection.databaseType, column.name))

  switch (action) {
    case "select":
      return `SELECT ${columnNames.length ? columnNames.join(", ") : "*"}\nFROM ${tableReference};`
    case "insert":
      return `INSERT INTO ${tableReference} (${columnNames.join(", ")})\nVALUES (${columns
        .map((_, index) => `value${index + 1}`)
        .join(", ")});`
    case "update":
      return `UPDATE ${tableReference}\nSET ${columnNames
        .map((name, index) => `${name} = value${index + 1}`)
        .join(", ")}\nWHERE condition;`
    case "delete":
      return `DELETE FROM ${tableReference}\nWHERE condition;`
  }
}

function formatSqlServerIdentifier(value: string) {
  if (!value) {
    return value
  }

  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    return value
  }

  return `[${value.replace(/\]/g, "]]")}]`
}
