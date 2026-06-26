import { NextResponse, type NextRequest } from "next/server"

import { deleteTable, getConnectionById, getTableDetails, updateTable } from "@/lib/connections"

export const runtime = "nodejs"

function getQueryParams(request: NextRequest) {
  const url = new URL(request.url)
  return {
    databaseName: url.searchParams.get("databaseName") ?? "",
    schemaName: url.searchParams.get("schemaName") ?? "",
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ connectionId: string; tableName: string }> }
) {
  try {
    const { connectionId, tableName } = await params
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

    const { databaseName, schemaName } = getQueryParams(request)
    const result = await getTableDetails(
      connection,
      databaseName,
      schemaName,
      decodeURIComponent(tableName)
    )

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido ao carregar tabela."

    return NextResponse.json(
      {
        success: false,
        message: "Não foi possível carregar a tabela.",
        details: message,
      },
      { status: 400 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ connectionId: string; tableName: string }> }
) {
  try {
    const { connectionId, tableName } = await params
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

    const { databaseName, schemaName } = getQueryParams(request)
    const body = (await request.json()) as {
      nextTableName?: string
      comment?: string
      columns?: Array<{
        sourceName?: string
        name: string
        dataType: string
        size: string
        notNull: boolean
        primaryKey: boolean
        autoIncrement: boolean
        defaultValue: string
        comment: string
      }>
    }
    const result = await updateTable(connection, {
      databaseName,
      schemaName,
      tableName: decodeURIComponent(tableName),
      nextTableName: body.nextTableName ?? "",
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
    const message = error instanceof Error ? error.message : "Erro desconhecido ao atualizar tabela."

    return NextResponse.json(
      {
        success: false,
        message: "Não foi possível atualizar a tabela.",
        details: message,
      },
      { status: 400 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ connectionId: string; tableName: string }> }
) {
  try {
    const { connectionId, tableName } = await params
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

    const { databaseName, schemaName } = getQueryParams(request)
    const result = await deleteTable(
      connection,
      databaseName,
      schemaName,
      decodeURIComponent(tableName)
    )

    return NextResponse.json({
      success: true,
      message: result.message,
      details: result.details,
      tableName: result.tableName,
      schemaName: result.schemaName,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido ao excluir tabela."

    return NextResponse.json(
      {
        success: false,
        message: "Não foi possível excluir a tabela.",
        details: message,
      },
      { status: 400 }
    )
  }
}
