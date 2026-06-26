"use client"

import { useState } from "react"
import type { ComponentType } from "react"
import { useRouter } from "next/navigation"
import {
  BrainCircuit,
  CheckCircle2,
  Code2,
  Database,
  Eye,
  EyeOff,
  FileStack,
  HardDrive,
  Import,
  Info,
  Loader2,
  Plug,
  Server,
  Shield,
  SquareTerminal,
  Zap,
  MoveRight,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { DatabaseType } from "@/lib/connections"

type ConnectionForm = {
  connectionName: string
  databaseName: string
  databaseFile: string
  host: string
  port: string
  user: string
  password: string
  additional: string
}

type TestResult =
  | {
      status: "success"
      message: string
      details: string
      durationMs: number
    }
  | {
      status: "error"
      message: string
      details: string
      durationMs?: number
    }

const databaseOptions: Array<{
  id: DatabaseType
  label: string
  accent: string
  icon: ComponentType<{ className?: string }>
}> = [
  { id: "mysql", label: "MySQL", accent: "from-[#4f8cff] to-[#1f6fff]", icon: Database },
  { id: "mariadb", label: "MariaDB", accent: "from-[#ffb07a] to-[#ff7b54]", icon: Server },
  {
    id: "postgresql",
    label: "PostgreSQL",
    accent: "from-[#7db7ff] to-[#4a77ff]",
    icon: HardDrive,
  },
  {
    id: "sqlserver",
    label: "SQL Server",
    accent: "from-[#ff6969] to-[#dd2e44]",
    icon: FileStack,
  },
  { id: "sqlite", label: "SQLite", accent: "from-[#8bc6ff] to-[#4d97ff]", icon: Code2 },
]

const highlights = [
  {
    icon: Shield,
    title: "Seguro",
    description: "As credenciais ficam apenas no formulário enquanto o teste é executado.",
    accent: "text-sky-400",
  },
  {
    icon: Zap,
    title: "Rápido",
    description: "A validação tenta abrir a conexão e retorna o resultado imediatamente.",
    accent: "text-amber-400",
  },
  {
    icon: BrainCircuit,
    title: "Multi-plataforma",
    description: "Funciona com MySQL, MariaDB, PostgreSQL, SQL Server e SQLite.",
    accent: "text-emerald-400",
  },
]

const tips = [
  "Use \"Testar Conexão\" para validar as credenciais antes de salvar.",
  "Use \"Salvar e Conectar\" para gravar no SQLite local e abrir a área de trabalho.",
  "Para SQLite, informe o caminho do arquivo .db ou .sqlite.",
  "O teste verifica se o servidor responde e se a autenticação funciona.",
]

const defaultPorts: Record<Exclude<DatabaseType, "sqlite">, string> = {
  mysql: "3306",
  mariadb: "3306",
  postgresql: "5432",
  sqlserver: "1433",
}

const initialForm: ConnectionForm = {
  connectionName: "Produção MySQL",
  databaseName: "",
  databaseFile: "",
  host: "localhost",
  port: "3306",
  user: "root",
  password: "",
  additional: "",
}

export default function Home() {
  const router = useRouter()
  const [databaseType, setDatabaseType] = useState<DatabaseType>("mysql")
  const [showPassword, setShowPassword] = useState(false)
  const [useSsl, setUseSsl] = useState(false)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)
  const [form, setForm] = useState<ConnectionForm>(initialForm)

  const updateForm = (field: keyof ConnectionForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const buildPayload = () => ({
    databaseType,
    connectionName: form.connectionName,
    host: form.host,
    port: form.port,
    user: form.user,
    password: form.password,
    databaseName: form.databaseName,
    databaseFile: form.databaseFile,
    additional: form.additional,
    useSsl,
  })

  const handleTestConnection = async () => {
    setTesting(true)
    setResult(null)

    const startedAt = performance.now()

    try {
      const response = await fetch("/api/test-connection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildPayload()),
      })

      const payload: {
        success: boolean
        message: string
        details: string
      } = await response.json()

      const durationMs = Math.round(performance.now() - startedAt)

      if (!response.ok || !payload.success) {
        setResult({
          status: "error",
          message: payload.message || "Não foi possível testar a conexão.",
          details: payload.details || "Verifique os campos e tente novamente.",
          durationMs,
        })
        return
      }

      setResult({
        status: "success",
        message: payload.message,
        details: payload.details,
        durationMs,
      })
    } catch {
      const durationMs = Math.round(performance.now() - startedAt)

      setResult({
        status: "error",
        message: "Falha inesperada ao testar a conexão.",
        details: "O servidor não respondeu como esperado.",
        durationMs,
      })
    } finally {
      setTesting(false)
    }
  }

  const handleSaveAndConnect = async () => {
    setSaving(true)
    setResult(null)

    const startedAt = performance.now()

    try {
      const response = await fetch("/api/connections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildPayload()),
      })

      const payload: {
        success: boolean
        message: string
        details: string
        connectionId?: string
      } = await response.json()

      const durationMs = Math.round(performance.now() - startedAt)

      if (!response.ok || !payload.success || !payload.connectionId) {
        setResult({
          status: "error",
          message: payload.message || "Não foi possível salvar e conectar.",
          details: payload.details || "Verifique os campos e tente novamente.",
          durationMs,
        })
        return
      }

      router.push(`/dashboard/${payload.connectionId}`)
    } catch {
      const durationMs = Math.round(performance.now() - startedAt)
      setResult({
        status: "error",
        message: "Falha inesperada ao salvar e conectar.",
        details: "O servidor não respondeu como esperado.",
        durationMs,
      })
    } finally {
      setSaving(false)
    }
  }

  const isSqlite = databaseType === "sqlite"
  const selectedDatabaseLabel =
    databaseOptions.find((option) => option.id === databaseType)?.label ?? "Banco"

  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,rgba(72,116,255,0.16),transparent_30%),radial-gradient(circle_at_85%_0%,rgba(32,80,180,0.22),transparent_28%),linear-gradient(180deg,#050816_0%,#07111f_52%,#03060b_100%)] text-white">
      <div className="relative mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-4 py-6 sm:px-6 lg:px-10">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[460px] bg-[radial-gradient(circle_at_20%_20%,rgba(84,131,255,0.18),transparent_32%),radial-gradient(circle_at_80%_10%,rgba(76,108,255,0.22),transparent_26%)]" />

        <section className="relative grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="space-y-4">
            <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
              <span className="bg-gradient-to-r from-sky-400 via-blue-400 to-indigo-300 bg-clip-text text-transparent">
                Forge DB
              </span>
            </h1>
          </div>
        </section>

        <section className="relative mt-7 grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_420px]">
          <Card className="border-white/8 bg-[linear-gradient(180deg,rgba(14,19,35,0.92),rgba(9,14,27,0.92))] p-1.5">
            <CardContent className="rounded-[1.1rem] border border-white/8 bg-[#090e1b]/70 p-5">
              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                    {databaseOptions.map((option) => {
                      const Icon = option.icon
                      const active = databaseType === option.id

                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => {
                            setDatabaseType(option.id)
                            setForm((current) => ({
                              ...current,
                              port: option.id === "sqlite" ? "" : defaultPorts[option.id],
                            }))
                            setResult(null)
                          }}
                          className={cn(
                            "group flex min-h-28 flex-col items-center justify-center gap-3 rounded-xl border bg-white/3 px-3 py-4 text-white transition-all hover:-translate-y-0.5 hover:border-sky-400/35 hover:bg-white/6",
                            active
                              ? "border-sky-400/90 bg-[linear-gradient(180deg,rgba(58,99,255,0.24),rgba(13,22,43,0.92))] shadow-[0_0_0_1px_rgba(80,135,255,0.2),0_18px_40px_-20px_rgba(63,114,255,0.8)]"
                              : "border-white/10"
                          )}
                        >
                          <div
                            className={cn(
                              "flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-3xl text-white/90 transition-transform group-hover:scale-105",
                              active && "border-sky-400/25 bg-white/10"
                            )}
                          >
                            <Icon className={cn("size-7", active ? "text-white" : "text-white/82")} />
                          </div>
                          <div className="text-sm font-medium">{option.label}</div>
                          <div
                            className={cn(
                              "h-1 w-14 rounded-full bg-gradient-to-r opacity-35 transition-opacity",
                              option.accent,
                              active ? "opacity-100" : "opacity-0"
                            )}
                          />
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="connectionName">Nome da conexão</Label>
                    <Input
                      id="connectionName"
                      value={form.connectionName}
                      onChange={(event) => updateForm("connectionName", event.target.value)}
                      placeholder="Ex.: Produção MySQL"
                    />
                  </div>

                  {isSqlite ? (
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="databaseFile">Arquivo do banco SQLite</Label>
                      <Input
                        id="databaseFile"
                        value={form.databaseFile}
                        onChange={(event) => updateForm("databaseFile", event.target.value)}
                        placeholder="Ex.: /caminho/para/meu-banco.sqlite"
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="databaseName">Banco de dados</Label>
                      <Input
                        id="databaseName"
                        value={form.databaseName}
                        onChange={(event) => updateForm("databaseName", event.target.value)}
                        placeholder={`Ex.: ${selectedDatabaseLabel.toLowerCase()} (opcional)`}
                      />
                    </div>
                  )}

                  {!isSqlite ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="host">Host</Label>
                        <Input
                          id="host"
                          value={form.host}
                          onChange={(event) => updateForm("host", event.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="port">Porta</Label>
                        <Input
                          id="port"
                          value={form.port}
                          onChange={(event) => updateForm("port", event.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="user">Usuário</Label>
                        <Input
                          id="user"
                          value={form.user}
                          onChange={(event) => updateForm("user", event.target.value)}
                          placeholder="root"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="password">Senha</Label>
                        <div className="relative">
                          <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            value={form.password}
                            onChange={(event) => updateForm("password", event.target.value)}
                            placeholder="Digite a senha"
                            className="pr-11"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((current) => !current)}
                            className="absolute inset-y-0 right-1.5 flex items-center justify-center rounded-md px-2 text-white/50 transition-colors hover:text-white"
                            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                          >
                            {showPassword ? (
                              <EyeOff className="size-4" />
                            ) : (
                              <Eye className="size-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-xl border border-dashed border-white/10 bg-white/4 p-4 text-sm leading-6 text-white/65 md:col-span-2">
                      SQLite usa um arquivo local. Host, porta, usuário e senha não são
                      necessários para esse teste.
                    </div>
                  )}

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="additional">Parâmetros adicionais (opcional)</Label>
                    <Textarea
                      id="additional"
                      value={form.additional}
                      onChange={(event) => updateForm("additional", event.target.value)}
                      placeholder="Ex.: charset=utf8mb4&sslMode=require"
                      className="min-h-24"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-6 border-t border-white/8 pt-4">
                  <label className="inline-flex cursor-pointer items-center gap-3 text-sm text-white/78">
                    <Switch checked={useSsl} onClick={() => setUseSsl((current) => !current)} />
                    Usar SSL
                  </label>
                  <span className="inline-flex items-center gap-2 text-xs text-white/45">
                    <Info className="size-3.5" />
                    A conexão será testada sem salvar as credenciais.
                  </span>
                </div>

                {result ? (
                  <div
                    className={cn(
                      "rounded-2xl border p-4",
                      result.status === "success"
                        ? "border-emerald-400/25 bg-emerald-400/10"
                        : "border-red-400/25 bg-red-400/10"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full",
                          result.status === "success"
                            ? "bg-emerald-400/20 text-emerald-300"
                            : "bg-red-400/20 text-red-300"
                        )}
                      >
                        {result.status === "success" ? (
                          <CheckCircle2 className="size-4.5" />
                        ) : (
                          <SquareTerminal className="size-4.5" />
                        )}
                      </div>
                      <div className="space-y-1">
                        <p className="font-medium text-white">{result.message}</p>
                        <p className="text-sm leading-6 text-white/70">{result.details}</p>
                        {result.durationMs ? (
                          <p className="text-xs text-white/45">{result.durationMs} ms</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={handleTestConnection}
                    disabled={testing || saving}
                    className="border-white/10 bg-white/4 text-white hover:bg-white/8"
                  >
                    {testing ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
                    {testing ? "Testando..." : "Testar Conexão"}
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    onClick={handleSaveAndConnect}
                    disabled={testing || saving}
                    className="bg-gradient-to-r from-[#3f7bff] to-[#2a61ef] text-white shadow-[0_18px_45px_-18px_rgba(59,113,255,0.9)] hover:from-[#4a84ff] hover:to-[#2457da]"
                  >
                    {saving ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />}
                    {saving ? "Salvando..." : "Salvar e Conectar"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/8 bg-[linear-gradient(180deg,rgba(15,20,35,0.9),rgba(8,12,22,0.92))] p-1.5">
            <CardHeader className="rounded-[1.1rem] border border-white/8 bg-white/4">
              <CardTitle className="text-xl text-white">Recursos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 rounded-[1.1rem] border border-white/8 bg-[#090e1b]/70 pt-5">
              <div className="space-y-4">
                {highlights.map((item) => {
                  const Icon = item.icon

                  return (
                    <div key={item.title} className="flex gap-4">
                      <div className={cn("mt-0.5 shrink-0", item.accent)}>
                        <Icon className="size-6" />
                      </div>
                      <div className="space-y-1">
                        <div className="font-medium text-white">{item.title}</div>
                        <p className="text-sm leading-6 text-white/62">{item.description}</p>
                      </div>
                    </div>
                  )
                })}
              </div>

              <Separator className="bg-white/10" />

              <div className="space-y-4">
                <CardTitle className="text-xl text-white">Dicas</CardTitle>
                <div className="space-y-3">
                  {tips.map((tip) => (
                    <div key={tip} className="flex gap-3 text-sm leading-6 text-white/70">
                      <Info className="mt-0.5 size-4 shrink-0 text-sky-400/90" />
                      <span>{tip}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto w-full justify-start gap-3 px-1 py-1.5 text-left text-white hover:bg-transparent"
                >
                  <span className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/6 text-white/85">
                    <Import className="size-4" />
                  </span>
                  <span className="flex flex-col items-start">
                    <span className="text-sm font-medium">Importar conexão</span>
                    <span className="text-xs text-white/55">Importe conexões de outros clientes</span>
                  </span>
                  <MoveRight className="ml-auto size-4 text-white/45" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  )
}
