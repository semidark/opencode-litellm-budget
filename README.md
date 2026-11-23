# OpenCode LiteLLM budget

An OpenCode V2 plugin showing a LiteLLM **key** budget in the terminal footer. `/budget` refreshes and opens details. A Desktop session-header indicator is included but experimental and has not been verified in a real Desktop app. Browser-only web clients do not load the Desktop entry.

The key's spend can include other sessions and applications, may lag, and is not necessarily denominated in any particular currency. This is not a spending limit and the plugin cannot enforce one.

## Installation

Requires OpenCode V2. The original local implementation was tested for loading on 2.2.7. **The standalone Git package has not yet been verified:** installation currently fails against the development registry because a required OpenCode SDK dependency is unavailable. Desktop compatibility also needs verification. Once resolved, add the following to `plugins` in your global `opencode.json(c)`, preserving existing entries:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [{
    "package": "github:semidark/opencode-litellm-budget",
    "options": {
      "providerID": "my-litellm",
      "keyInfoURL": "https://gateway.example/key/info",
    },
  }],
}
```

Replace both values with the configured OpenCode provider ID and your LiteLLM gateway's HTTPS key-info URL. The provider's `baseURL` and the URL above must have the same HTTPS origin (including port), and the key-info path must end in `/key/info`. This deliberately requires explicit endpoint selection; subpath deployments can use e.g. `https://gateway.example/proxy/key/info`. Requests do not follow redirects. The server uses the selected provider's configured `apiKey`, supporting literal and `{file:...}` values; unresolved or other credential forms make the budget unavailable. Never put credentials in the URL.

Configuring globally is required for Desktop. Use `/reload` if needed. Only configure an endpoint you trust with the provider's key; protect the OpenCode server because callers of this plugin's RPC can view sanitized budget data. The response body, key, and provider error details are not sent to clients or logged. The plugin reads no unrelated fallback key.

Values refresh approximately once a minute while a client is open. Requests are deduplicated, failures back off, and older successful data is marked stale. Gateway support for the authenticated `/key/info` endpoint and its permissions varies by LiteLLM deployment.

## Development

Run `bun install` and `bun test`. The Desktop entry is a standalone CommonJS file using host-provided modules; its RPC contract is duplicated and must stay in sync with `rpc.ts`. See [OpenCode plugin documentation](https://opencode.ai/docs/build/plugins). No npm release is implied by the GitHub repository.

MIT licensed; see [LICENSE](LICENSE).
