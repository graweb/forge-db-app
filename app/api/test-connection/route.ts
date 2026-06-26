import { NextResponse } from "next/server"

import { testConnection } from "@/lib/connections"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const result = await testConnection(body)

    return NextResponse.json({
      success: true,
      message: result.message,
      details: result.details,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido ao testar conexão."

    return NextResponse.json(
      {
        success: false,
        message: "Não foi possível conectar ao banco.",
        details: message,
      },
      { status: 400 }
    )
  }
}
