// The host supplies these modules. This entry contains no provider credentials.
const { Plugin, Slot } = require("@opencode/plugin/gui")
const { Rpc } = require("@opencode/plugin/rpc")
const { createSignal, createEffect, onCleanup } = require("solid-js")

// Keep this portable contract in sync with rpc.ts.
const BudgetRPC = Rpc.define({
  id: "semidark-litellm-budget",
  methods: { get: {
    input: { type: "object", properties: { refresh: { type: "boolean" } }, additionalProperties: false },
    output: { type: "object", properties: {
      status: { type: "string", enum: ["fresh", "stale", "unavailable"] },
      error: { anyOf: [{ type: "string" }, { type: "null" }] },
      budget: { anyOf: [{ type: "null" }, { type: "object", properties: {
        spend: { type: "number" }, limit: { anyOf: [{ type: "number" }, { type: "null" }] },
        resetAt: { anyOf: [{ type: "string" }, { type: "null" }] }, period: { anyOf: [{ type: "string" }, { type: "null" }] },
        updatedAt: { type: "number" },
      }, required: ["spend", "limit", "resetAt", "period", "updatedAt"], additionalProperties: false }] },
    }, required: ["status", "budget", "error"], additionalProperties: false },
  } },
  events: {},
})

const amount = (n) => new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
const percentage = (snapshot) => {
  const budget = snapshot?.budget
  return budget && Number.isFinite(budget.spend) && Number.isFinite(budget.limit) && budget.limit > 0 ? budget.spend / budget.limit * 100 : undefined
}
const label = (snapshot) => {
  if (!snapshot?.budget) return "Budget unavailable"
  const { spend, limit } = snapshot.budget
  const value = limit === null ? `${amount(spend)} used (limit not reported)` : limit === 0 ? `${amount(spend)} / 0.00` : `${Math.round(spend / limit * 100)}%`
  return `Budget ${value}${snapshot.status === "stale" ? " · stale" : ""}`
}
const detailRows = (snapshot) => {
  if (!snapshot?.budget) return [["Status", `Unavailable${snapshot?.error ? `: ${snapshot.error}` : ""}`]]
  const { spend, limit, resetAt, period, updatedAt } = snapshot.budget
  return [
    ["Used", amount(spend)],
    ["Limit", limit === null ? "No key limit reported" : amount(limit)],
    ["Remaining", limit === null ? "Unknown" : amount(limit - spend)],
    ["Period", period ?? "Not reported"],
    ["Resets", resetAt ? new Date(resetAt).toLocaleString() : "Not reported"],
    ["Updated", `${new Date(updatedAt).toLocaleString()}${snapshot.status === "stale" ? " (stale)" : ""}`],
    ...(snapshot.error ? [["Last refresh", snapshot.error]] : []),
  ]
}

module.exports = { default: Plugin.define({
  setup(ctx) {
    const [snapshot, setSnapshot] = createSignal()
    let refreshCurrent
    createEffect(() => {
      const session = ctx.sessions.current()
      // Desktop only loads this GUI from its own server; never show its budget on another server's session.
      if (!session?.server?.builtin) { setSnapshot(undefined); return }
      const directory = session.directory
      let disposed = false
      let generation = 0
      async function refresh(force = false) {
        const current = ++generation
        try {
          const result = await ctx.client.rpc(BudgetRPC).get({ refresh: force }, { location: { directory } })
          if (!disposed && current === generation) setSnapshot(result)
        } catch {
          if (!disposed && current === generation) setSnapshot((old) => ({ status: old?.budget ? "stale" : "unavailable", budget: old?.budget ?? null, error: "OpenCode server unavailable" }))
        }
      }
      refreshCurrent = refresh
      setSnapshot(undefined)
      void refresh()
      const timer = setInterval(() => void refresh(), 60_000)
      onCleanup(() => { disposed = true; refreshCurrent = undefined; clearInterval(timer) })
    })
    ctx.add(Slot, {
      at: "session.header",
      render(input) {
        const button = document.createElement("button")
        button.type = "button"
        button.className = "text-12-regular text-text-weak whitespace-nowrap cursor-pointer inline-flex items-center gap-1"
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
        svg.setAttribute("width", "14")
        svg.setAttribute("height", "14")
        svg.setAttribute("viewBox", "0 0 14 14")
        svg.setAttribute("fill", "none")
        svg.setAttribute("aria-hidden", "true")
        svg.style.transform = "rotate(-90deg)"
        const circle = (stroke) => {
          const node = document.createElementNS("http://www.w3.org/2000/svg", "circle")
          for (const [name, value] of Object.entries({ cx: "7", cy: "7", r: "6.25", "stroke-width": "1.5", stroke })) node.setAttribute(name, value)
          return node
        }
        const track = circle("var(--v2-background-bg-layer-04, #dedede)")
        const progress = circle("var(--v2-icon-icon-base, currentColor)")
        const circumference = 2 * Math.PI * 6.25
        progress.setAttribute("stroke-dasharray", String(circumference))
        svg.append(track, progress)
        const text = document.createElement("span")
        button.append(svg, text)
        createEffect(() => {
          const session = input.session
          const current = ctx.sessions.current()
          button.hidden = !input.active || !session.server.builtin || current?.server?.id !== session.server.id || current?.id !== session.id
          const value = snapshot()
          const used = percentage(value)
          svg.style.display = used === undefined ? "none" : "block"
          progress.setAttribute("stroke-dashoffset", String(circumference * (1 - Math.max(0, Math.min(100, used ?? 0)) / 100)))
          text.textContent = label(value)
          button.title = "Show API key budget details and refresh"
        })
        button.onclick = () => {
          const session = input.session
          const current = ctx.sessions.current()
          if (!input.active || !session.server.builtin || current?.server?.id !== session.server.id || current?.id !== session.id) return
          void refreshCurrent?.(true)
          const value = snapshot()
          ctx.dialogs.open((dialog) => {
            const content = document.createElement("div")
            const note = document.createElement("p")
            note.className = "text-12-regular text-text-weak"
            note.textContent = "API key budget · currency not verified"
            const list = document.createElement("dl")
            list.style.display = "grid"
            list.style.gridTemplateColumns = "max-content minmax(0, 1fr)"
            list.style.gap = "8px 24px"
            list.style.marginTop = "16px"
            for (const [label, fieldValue] of detailRows(value)) {
              const name = document.createElement("dt")
              name.className = "text-text-weak"
              name.textContent = label
              const field = document.createElement("dd")
              field.style.margin = "0"
              field.style.textAlign = "right"
              field.textContent = fieldValue
              list.append(name, field)
            }
            content.append(note, list)
            return ctx.ui.Dialog({ title: "Budget", children: content, footer: ctx.ui.Button({ variant: "contrast", onClick: dialog.close, children: "OK" }) })
          })
        }
        return button
      },
    })
  },
}) }
