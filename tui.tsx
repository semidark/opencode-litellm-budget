import { Plugin } from "@opencode/plugin/tui"
import { createSignal } from "solid-js"
import { BudgetRPC } from "./rpc"
import { details, summary } from "./display"
import type { Snapshot } from "./service"

export default Plugin.define({
  id: "semidark.litellm-budget.tui",
  setup(ctx) {
    const [snapshot, setSnapshot] = createSignal<Snapshot>()
    let disposed = false
    let generation = 0
    async function refresh(force = false) {
      const current = ++generation
      try {
        const result = await ctx.client.rpc(BudgetRPC).get({ refresh: force }, { location: ctx.location ?? ctx.data.location.default() }) as Snapshot
        if (!disposed && current === generation) setSnapshot(result)
      } catch {
        if (!disposed && current === generation) setSnapshot((old) => ({ status: old?.budget ? "stale" : "unavailable", budget: old?.budget ?? null, error: "OpenCode server unavailable" }))
      }
    }
    void refresh()
    const timer = setInterval(() => void refresh(), 60_000)
    const unregister = ctx.ui.slot({ append: "prompt.footer.status", render: () => <text>{summary(snapshot())}</text> })
    ctx.keymap.layer(() => ({
      mode: "global",
      commands: [{
        id: "semidark.litellm-budget.details", title: "Key budget", group: "Budget", palette: true,
        slash: { name: "budget" },
        run: async () => {
          await refresh(true)
          await ctx.ui.dialog.alert({ title: "Budget", message: details(snapshot()) })
        },
      }],
    }))
    return () => { disposed = true; clearInterval(timer); unregister() }
  },
})
