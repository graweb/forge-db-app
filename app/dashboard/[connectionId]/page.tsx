import { notFound } from "next/navigation"

import { DashboardShell } from "@/components/dashboard/shell"
import { getConnectionById, getDatabaseStructure, listConnections } from "@/lib/connections"

export const runtime = "nodejs"

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ connectionId: string }>
}) {
  const { connectionId } = await params
  const connection = getConnectionById(connectionId)

  if (!connection) {
    notFound()
  }

  const connections = listConnections(100)
  const databaseStructuresById = Object.fromEntries(
    await Promise.all(
      connections.map(async (item) => [item.id, await getDatabaseStructure(item)] as const)
    )
  )
  const databaseStructure = databaseStructuresById[connection.id] ?? (await getDatabaseStructure(connection))

  return (
    <DashboardShell
      connection={connection}
      connections={connections}
      databaseStructure={databaseStructure}
      databaseStructuresById={databaseStructuresById}
    />
  )
}
