import { describe, expect, test } from "bun:test"
import { budgetOptions, createBudgetService, credentials, parseBudget } from "./service"
import { details, summary } from "./display"
import { mkdtemp, rm, rmdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

const body = { info: { spend: 12.5, max_budget: 50, budget_reset_at: "2026-12-01T00:00:00Z", budget_duration: "30d", token: "secret", metadata: { private: true } } }

const options = { providerID: "gateway", keyInfoURL: "https://gateway.example/key/info" }
describe("LiteLLM budget", () => {
  test("allowlists valid fields and rejects invalid data", () => {
    const budget = parseBudget(body, 123)
    expect(budget).toEqual({ spend: 12.5, limit: 50, resetAt: "2026-12-01T00:00:00.000Z", period: "30d", updatedAt: 123 })
    expect(parseBudget({ info: { spend: 0, max_budget: null, budget_reset_at: "bad", budget_duration: "x\nsecret" } }, 1)).toEqual({ spend: 0, limit: null, resetAt: null, period: null, updatedAt: 1 })
    expect(() => parseBudget({ info: { spend: NaN } }, 1)).toThrow()
    expect(() => parseBudget({ info: { spend: 1, max_budget: -1 } }, 1)).toThrow()
  })
  test("uses only approved endpoint and omits credentials from URL", async () => {
    const ctx = { provider: { get: async (input: { providerID: string }) => { expect(input.providerID).toBe("gateway"); return { data: { settings: { baseURL: "https://gateway.example/v1", apiKey: "fake-key" } } } } } }
    expect(await credentials(ctx, options)).toEqual({ url: "https://gateway.example/key/info", key: "fake-key" })
    ctx.provider.get = async () => ({ data: { settings: { baseURL: "https://other.example/v1", apiKey: "fake-key" } } })
    await expect(credentials(ctx, options)).rejects.toThrow()
    await expect(credentials({ provider: { get: async () => ({ data: { settings: { baseURL: "https://gateway.example/v1" } } }) } }, options)).rejects.toThrow()
    const valid = { provider: { get: async () => ({ settings: { baseURL: "https://gateway.example/v1", apiKey: "fake-key" } }) } }
    for (const keyInfoURL of ["http://gateway.example/key/info", "https://gateway.example:444/key/info", "https://gateway.example/key/info?key=bad", "https://user@gateway.example/key/info", "https://gateway.example/other"]) {
      await expect(credentials(valid, { ...options, keyInfoURL })).rejects.toThrow()
    }
    expect(() => budgetOptions({})).toThrow()
  })
  test("resolves a configured file-backed credential", async () => {
    const dir = await mkdtemp(join(tmpdir(), "budget-key-test-"))
    try {
      const path = join(dir, "key")
      await writeFile(path, "test-file-key\n")
      const result = await credentials({ provider: { get: async () => ({ data: { settings: { baseURL: "https://gateway.example/v1", apiKey: `{file:${path}}` } } }) } }, options)
      expect(result.key).toBe("test-file-key")
      expect(result.url).toBe("https://gateway.example/key/info")
    } finally {
      await rm(join(dir, "key"), { force: true })
      await rmdir(dir)
    }
  })
  test("caches and deduplicates, marks failures stale, and backs off", async () => {
    let time = 1000, calls = 0, fail = false
    const service = createBudgetService({
      load: async () => ({ url: "https://gateway.example/key/info", key: "fake-key" }),
      now: () => time,
      fetch: async (url, options) => {
        calls++
        expect(String(url)).not.toContain("fake-key")
        expect(options?.redirect).toBe("error")
        expect((options?.headers as any).Authorization).toBe("Bearer fake-key")
        if (fail) throw new Error("fake-key must never leak")
        return new Response(JSON.stringify(body), { status: 200 })
      },
    })
    const [first, second] = await Promise.all([service.get(), service.get()])
    expect(calls).toBe(1)
    expect(first).toEqual(second)
    expect(first.status).toBe("fresh")
    expect(JSON.stringify(first)).not.toContain("secret")
    await service.get(true)
    expect(calls).toBe(1)
    time += 60_001; fail = true
    const stale = await service.get()
    expect(stale.status).toBe("stale")
    expect(JSON.stringify(stale)).not.toContain("fake-key")
    await service.get()
    expect(calls).toBe(2)
    time += 30_001; fail = false
    expect((await service.get()).status).toBe("fresh")
    expect(calls).toBe(3)
  })
  test("shows unlimited, zero and overspent correctly", () => {
    const budget = parseBudget(body, 1)
    expect(summary({ status: "fresh", error: null, budget })).toContain("25%")
    expect(summary({ status: "fresh", error: null, budget: { ...budget, limit: null } })).toContain("limit not reported")
    expect(summary({ status: "fresh", error: null, budget: { ...budget, limit: 0 } })).toContain("/ 0.00")
    expect(details({ status: "stale", error: "Gateway unavailable", budget: { ...budget, limit: 10 } })).toContain("-2.50")
  })
})
