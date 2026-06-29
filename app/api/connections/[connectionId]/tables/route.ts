import { NextResponse, type NextRequest } from "next/server"

import { createTable, getConnectionById } from "@/lib/connections"
import type { CreateTableInput } from "@/types/connections"

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

    const body = (await request.json()) as Partial<CreateTableInput> & {
      columns?: Array<Partial<CreateTableInput["columns"][number]>>
      foreignKeys?: Array<Partial<NonNullable<CreateTableInput["foreignKeys"]>[number]>>
      indexes?: Array<Partial<NonNullable<CreateTableInput["indexes"]>[number]>>
      triggers?: Array<Partial<NonNullable<CreateTableInput["triggers"]>[number]>>
      functions?: Array<Partial<NonNullable<CreateTableInput["functions"]>[number]>>
    }

    const result = await createTable(connection, {
      databaseName: body.databaseName ?? "",
      schemaName: body.schemaName ?? "",
      tableName: body.tableName ?? "",
      comment: body.comment ?? "",
      columns: (body.columns ?? []).map((column) => ({
        name: column?.name ?? "",
        dataType: column?.dataType ?? "",
        size: column?.size ?? "",
        unsigned: Boolean(column?.unsigned),
        notNull: Boolean(column?.notNull),
        primaryKey: Boolean(column?.primaryKey),
        unique: Boolean(column?.unique),
        autoIncrement: Boolean(column?.autoIncrement),
        defaultValue: column?.defaultValue ?? "",
        comment: column?.comment ?? "",
      })),
      foreignKeys: (body.foreignKeys ?? []).map((foreignKey) => ({
        sourceColumn: foreignKey?.sourceColumn ?? "",
        referencedSchemaName: foreignKey?.referencedSchemaName ?? "",
        referencedTableName: foreignKey?.referencedTableName ?? "",
        referencedColumnName: foreignKey?.referencedColumnName ?? "",
        onDelete: foreignKey?.onDelete ?? "",
        onUpdate: foreignKey?.onUpdate ?? "",
      })),
      indexes: (body.indexes ?? []).map((index) => ({
        name: index?.name ?? "",
        columns: (index?.columns ?? []).map((columnName) => columnName ?? "").filter(Boolean),
        unique: Boolean(index?.unique),
      })),
      triggers: (body.triggers ?? []).map((trigger) => ({
        name: trigger?.name ?? "",
        description: trigger?.description ?? "",
        timing: trigger?.timing ?? "",
        event: trigger?.event ?? "",
        body: trigger?.body ?? "",
      })),
      functions: (body.functions ?? []).map((item) => ({
        name: item?.name ?? "",
        description: item?.description ?? "",
        parameters: item?.parameters ?? "",
        returnType: item?.returnType ?? "",
        body: item?.body ?? "",
      })),
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
