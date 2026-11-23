import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { resolve } from "node:path"

export type Budget = {
  spend: number
  limit: number | null
  resetAt: string | null
  period: string | null
  updatedAt: number
}
export type Snapshot = { status: "fresh" | "stale" | "unavailable"; budget: Budget | null; error: string | null }

const MAX_AGE = 60_000
const RETRY_DELAY = 30_000
const MIN_REFRESH = 5_000
const TIMEOUT = 10_000

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null
}

export function parseBudget(value: unknown, now: number): Budget {
  const info = (value as any)?.info
  if (!info || typeof info !== "object" || Array.isArray(info)) throw new Error("invalid")
  const spend = number(info.spend)
  if (spend === null) throw new Error("invalid")
  const limit = info.max_budget == null ? null : number(info.max_budget)
  if (info.max_budget != null && limit === null) throw new Error("invalid")
  const reset = typeof info.budget_reset_at === "string" ? Date.parse(info.budget_reset_at) : NaN
  // Do not carry arbitrary upstream strings or metadata into RPC output.
  const period = typeof info.budget_duration === "string" && /^\d{1,5}(?:s|m|h|d|w|mo)$/.test(info.budget_duration) ? info.budget_duration : null
  return { spend, limit, resetAt: Number.isFinite(reset) ? new Date(reset).toISOString() : null, period, updatedAt: now }
}

type ProviderContext = { provider: { get(input: { providerID: string }): Promise<any> } }
export type BudgetOptions = { providerID: string; keyInfoURL: string }
export function budgetOptions(value: Record<string, unknown>): BudgetOptions {
  if (typeof value.providerID !== "string" || !value.providerID.trim() || typeof value.keyInfoURL !== "string") throw new Error("Configure providerID and keyInfoURL")
  return { providerID: value.providerID.trim(), keyInfoURL: value.keyInfoURL }
}
export async function credentials(ctx: ProviderContext, options: BudgetOptions): Promise<{ url: string; key: string }> {
  const response = await ctx.provider.get({ providerID: options.providerID })
  const provider = response?.data ?? response
  const base = provider?.settings?.baseURL
  if (typeof base !== "string") throw new Error("config")
  const providerURL = new URL(base)
  const url = new URL(options.keyInfoURL)
  // Only send the selected provider's key to its exact HTTPS origin.
  if (providerURL.protocol !== "https:" || providerURL.username || providerURL.password || providerURL.search || providerURL.hash || url.protocol !== "https:" || url.origin !== providerURL.origin || url.username || url.password || url.search || url.hash || !url.pathname.endsWith("/key/info")) throw new Error("config")
  let key = provider?.settings?.apiKey
  // An unrelated default key might belong to a different budget than the configured provider.
  if (typeof key !== "string" || !key.trim()) throw new Error("config")
  if (key.startsWith("{file:") && key.endsWith("}")) {
    const path = key.slice(6, -1)
    key = await readFile(path.startsWith("~/") ? resolve(homedir(), path.slice(2)) : resolve(path), "utf8")
  }
  key = key.trim()
  if (!key || /[\r\n]/.test(key) || key.startsWith("{")) throw new Error("config")
  return { url: url.href, key }
}

export function createBudgetService(options: {
  load: () => Promise<{ url: string; key: string }>
  fetch?: typeof fetch
  now?: () => number
}) {
  const request = options.fetch ?? fetch
  const now = options.now ?? Date.now
  let budget: Budget | null = null
  let error: string | null = null
  let nextAttempt = 0
  let lastAttempt = -Infinity
  let pending: Promise<void> | undefined

  async function refresh() {
    lastAttempt = now()
    try {
      const { url, key } = await options.load()
      const response = await request(url, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(TIMEOUT) })
      if (!response.ok) {
        error = response.status === 401 || response.status === 403 ? "Access denied" : "Gateway unavailable"
        nextAttempt = now() + RETRY_DELAY
        return
      }
      budget = parseBudget(await response.json(), now())
      error = null
      nextAttempt = now() + MAX_AGE
    } catch {
      // Errors may contain credentials, URLs or response bodies. Never expose them.
      error = "Budget unavailable"
      nextAttempt = now() + RETRY_DELAY
    }
  }
  async function get(force = false): Promise<Snapshot> {
    const due = now() >= nextAttempt || (force && now() - lastAttempt >= MIN_REFRESH)
    if (!pending && due) pending = refresh().finally(() => { pending = undefined })
    if (pending) await pending
    return { status: budget ? (error || now() - budget.updatedAt >= MAX_AGE ? "stale" : "fresh") : "unavailable", budget, error }
  }
  return { get }
}
