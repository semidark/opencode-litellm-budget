import { Plugin } from "@opencode/plugin"
import { BudgetRPC } from "./rpc"
import { budgetOptions, createBudgetService, credentials } from "./service"

export default Plugin.define({
  id: "semidark.litellm-budget",
  async setup(ctx) {
    const options = budgetOptions(ctx.options)
    const service = createBudgetService({ load: () => credentials(ctx, options) })
    await ctx.rpc.register(BudgetRPC, {
      get: async (input) => service.get((input as { refresh?: boolean }).refresh === true),
    })
  },
})
