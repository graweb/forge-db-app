import { notFound } from "next/navigation"

import { DashboardShell } from "@/components/dashboard/shell"
import { getConnectionById, listConnections } from "@/lib/connections"

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

  const recentConnections = listConnections(8)

  return <DashboardShell connection={connection} recentConnections={recentConnections} />
}
