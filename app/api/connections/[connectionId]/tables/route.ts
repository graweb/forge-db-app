import { NextResponse, type NextRequest } from "next/server"

import { createTable, getConnectionById } from "@/lib/connections"

export const runtime = "nodejs"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  try {
    const { connectionId } = await params
    const connection = getConnectionById(connectionId)

    if (!connection) {
      return NextResponse.json(
        {
          success: false,
          message: "Conexão não encontrada.",
          details: "A conexão informada não existe.",
        },
        { status: 404 }
      )
    }

    const body = (await request.json()) as {
      databaseName?: string
      schemaName?: string
      tableName?: string
      comment?: string
      columns?: Array<{
        name?: string
        dataType?: string
        size?: string
        notNull?: boolean
        primaryKey?: boolean
        autoIncrement?: boolean
        defaultValue?: string
        comment?: string
      }>
    }

    const result = await createTable(connection, {
      databaseName: body.databaseName ?? "",
      schemaName: body.schemaName ?? "",
      tableName: body.tableName ?? "",
      comment: body.comment ?? "",
      columns: body.columns ?? [],
    })

    return NextResponse.json({
      success: true,
      message: result.message,
      details: result.details,
      tableName: result.tableName,
      schemaName: result.schemaName,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido ao criar tabela."

    return NextResponse.json(
      {
        success: false,
        message: "Não foi possível criar a tabela.",
        details: message,
      },
      { status: 400 }
    )
  }
}
