import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

test("budget footer uses the host theme instead of invisible white text on light backgrounds", async () => {
  const child = Bun.spawn([process.execPath, "-e", `
    import plugin from "./dist/tui.js";
    import { testRender } from "@opentui/solid";
    let slot;
    const cleanup = plugin.setup({
      theme: { text: { muted: "#555555" } },
      client: { rpc: () => ({ get: async () => ({ status: "fresh", budget: { spend: 25, limit: 100 }, error: null }) }) },
      data: { location: { default: () => ({ directory: "/test" }) } },
      ui: { slot: value => { slot = value; return () => {}; } },
      keymap: { layer: () => {} },
    });
    const renderer = await testRender(() => slot.render({}), { width: 60, height: 4 });
    try {
      await new Promise(resolve => setImmediate(resolve));
      await renderer.renderOnce();
      const span = renderer.captureSpans().lines[0].spans.find(span => span.text.includes("Budget:"));
      if (!renderer.captureCharFrame().includes("Budget: 25% used")) throw new Error("Missing budget text");
      if (!span || span.fg.buffer[0] !== 85 || span.fg.buffer[1] !== 85 || span.fg.buffer[2] !== 85) throw new Error("Host theme colour not applied");
    } finally { cleanup(); renderer.renderer.destroy(); }
  `], { cwd: import.meta.dir, stdout: "pipe", stderr: "pipe" })
  const error = await new Response(child.stderr).text()
  expect(await child.exited, error).toBe(0)
})

test("Git consumers install the committed artifact without dependency preparation", async () => {
  const manifest = await Bun.file(join(import.meta.dir, "package.json")).json()
  for (const name of ["build", "prepare", "prepack", "preinstall", "install", "postinstall"]) {
    expect(manifest.scripts[name]).toBeUndefined()
  }
  expect(manifest.exports["./tui"]).toBe("./dist/tui.js")
})

test("published TUI entry imports without falling back to React", async () => {
  const directory = await mkdtemp(join(tmpdir(), "litellm-budget-package-"))
  try {
    const pack = Bun.spawn(["npm", "pack", "--pack-destination", directory, "--json"], {
      cwd: import.meta.dir,
      stdout: "pipe",
      stderr: "pipe",
    })
    const output = await new Response(pack.stdout).text()
    const errors = await new Response(pack.stderr).text()
    expect(await pack.exited, errors).toBe(0)
    const [manifest] = JSON.parse(output)
    expect(manifest.files.some((file: { path: string }) => file.path === "dist/tui.js")).toBe(true)
    const extract = Bun.spawn(["tar", "-xzf", join(directory, manifest.filename), "-C", directory])
    expect(await extract.exited).toBe(0)
    // Resolve dependencies from the development checkout, but load the shipped
    // files outside it so a checkout-only tsconfig cannot mask packaging bugs.
    const { symlink } = await import("node:fs/promises")
    await symlink(join(import.meta.dir, "node_modules"), join(directory, "package", "node_modules"))
    const entrypoint = join(directory, "package", "dist", "tui.js")
    const child = Bun.spawn([process.execPath, "-e", `await import(${JSON.stringify(entrypoint)}); console.log("TUI imported")`], {
      cwd: directory,
      stdout: "pipe",
      stderr: "pipe",
    })
    const stdout = await new Response(child.stdout).text()
    const stderr = await new Response(child.stderr).text()
    expect(await child.exited, stderr).toBe(0)
    expect(stdout).toContain("TUI imported")

  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
