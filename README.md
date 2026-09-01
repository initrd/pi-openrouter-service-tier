# pi OpenRouter Service Tier

A [pi](https://pi.dev) extension that adds [OpenRouter service tier](https://openrouter.ai/docs/guides/features/service-tiers) support, letting you control the cost/latency trade-off per model.

OpenRouter offers a `service_tier` request parameter with two values:

| Tier | Trade-off |
| --- | --- |
| `flex` | Lower cost, higher latency and lower availability |
| `priority` | Faster and more reliable, higher cost |

This extension injects `service_tier` into the request payload pi sends to OpenRouter for the models you choose. The tier can be a global default with per-model overrides, and is managed from a config file and/or the `/service-tier` command.

## Requirements

- pi (any recent version with the `before_provider_request` extension hook)
- An OpenRouter provider configured in pi (set the `OPENROUTER_API_KEY`
  environment variable, or sign in via OpenRouter OAuth)

## Install

The extension is a pi package (declares a `pi.extensions` manifest). There are
several ways to load it: install from npm/git, point pi at a local checkout, or
copy it into an extensions folder. Choose whichever fits your setup.

**Option A — install from a published source (npm or git).**

```bash
# npm
pi install npm:<your-package-name>

# git (e.g. a hosted repository)
pi install git:github.com/<your-org>/<your-repo>
pi install https://github.com/<your-org>/<your-repo>
```

This adds it to your settings under `packages` and loads it with package rules.

**Option B — point pi at a local checkout (no copy).**

Add the repo to the `extensions` array in your pi settings
(`~/.pi/agent/settings.json` for global, `.pi/settings.json` for project-local):

```json
{
  "extensions": [
    "/absolute/path/to/pi-openrouter-service-tier"
  ]
}
```

Then reload in pi: `/reload`.

**Option C — copy into an extensions folder.**

```bash
# Global (all projects)
cp -r pi-openrouter-service-tier ~/.pi/agent/extensions/openrouter-service-tier

# Or project-local
# cp -r pi-openrouter-service-tier .pi/extensions/openrouter-service-tier
```

Then in pi: `/reload`.

## Configuration

The extension reads a JSON config file. By default it uses
`~/.pi/agent/config/openrouter-service-tier.json`. Override the path with the
`OPENROUTER_SERVICE_TIER_CONFIG` environment variable (useful for project-local
configs or testing).

See [`openrouter-service-tier.example.json`](./openrouter-service-tier.example.json)
for a starting point. Model IDs below are illustrative examples — replace them
with real IDs that support service tiers on OpenRouter.

```jsonc
{
  // Master switch. When false, no service_tier is ever injected.
  "enabled": true,

  // Global default tier applied to every managed OpenRouter model that does
  // not have a per-model override. Omit to opt every model out by default.
  "defaultTier": "flex",

  // Optional allowlist of managed model IDs. When empty/omitted, every
  // OpenRouter model is considered managed.
  "models": [
    "google/gemini-3.7-flash",
    "openai/gpt-5.6-sol",
    "openai/gpt-5.6-sol-pro",
    "x-ai/grok-4.6",
    "google/gemini-3.6-flash",
    "google/gemini-3.5-flash-lite"
  ],

  // Per-model overrides. These take precedence over defaultTier.
  // e.g. x-ai/grok-4.6 only supports the priority tier, so it gets a
  // priority override while the flex default applies to the others.
  "overrides": {
    "x-ai/grok-4.6": "priority"
  }
}
```

### How the tier is chosen

For a given OpenRouter request, the effective tier is:

1. `overrides[modelId]`, if set, otherwise
2. `defaultTier`, if the model is managed, otherwise
3. no tier (the request is sent exactly as pi would normally send it)

A model is *managed* when the `models` allowlist is empty (all OpenRouter
models) or the model id is in the list.

## The `/service-tier` command

Manage the configuration interactively:

| Command | Effect |
| --- | --- |
| `/service-tier` | Show the effective tier for the active model |
| `/service-tier flex` | Set the global default tier to `flex` |
| `/service-tier priority` | Set the global default tier to `priority` |
| `/service-tier <model> <tier>` | Set a per-model override (e.g. `/service-tier google/gemini-3.7-flash priority`) |
| `/service-tier clear` | Reset all service-tier configuration |

Model ids use OpenRouter's full form, e.g. `google/gemini-3.7-flash`,
`openai/gpt-5.6-sol`, `x-ai/grok-4.6`, or `google/gemini-3.5-flash-lite`
(illustrative — use IDs that support service tiers).

## How it works

The extension listens to pi's `before_provider_request` hook. When the request
is headed to the `openrouter` provider and the requested model has a configured
tier, it returns a shallow copy of the payload with `service_tier` injected. It
never mutates the shared payload and only ever touches OpenRouter requests.

## Notes and best practices

- OpenRouter accepts `service_tier` as a top-level chat-completions field, which
  is exactly where this extension places it.
- Tiers are only honored by providers that offer them (OpenAI, Google Vertex,
  Google AI Studio, and SpaceXAI for `priority`). Sending a tier to a model whose
  provider has no such tier is harmless — OpenRouter routes it normally.
- Only `flex` and `priority` are valid, so the extension validates config values
  and ignores anything else.
- The config is re-read on every request, so edits take effect immediately
  without a restart.

## Development

```bash
npm install
npm test        # run the unit tests (node:test + tsx)
npm run typecheck
```

The pure config logic (parsing, tier resolution, persistence) lives in
[`config.ts`](./config.ts) and is unit tested independently of the pi runtime.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for commit message conventions and
development guidance.

## License

MIT — see [`LICENSE`](./LICENSE).

Before publishing, update the package metadata in
[`package.json`](./package.json) (`name`, `version`, `license`) and add a real
`LICENSE` file as appropriate for your project.
