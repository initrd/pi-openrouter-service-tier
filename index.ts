/**
 * OpenRouter Service Tier — a pi extension.
 *
 * Injects OpenRouter's `service_tier` request parameter (flex / priority) for
 * configured models, so you can control the cost/latency tradeoff per model.
 *
 * The tier is selected from a config file (a global default plus per-model
 * overrides) and can also be managed interactively with the `/service-tier`
 * command.
 *
 * Install: copy this directory into `~/.pi/agent/extensions/` (global) or
 * `.pi/extensions/` (project-local), then run `/reload`.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { join } from "node:path";

import {
	loadConfig,
	resolveTier,
	saveConfig,
	type ServiceTier,
	type ServiceTierConfig,
} from "./config.ts";
/** Loose shape of the chat-completions payload pi sends to OpenRouter. */
interface CompletablePayload {
	model?: unknown;
	service_tier?: unknown;
	[key: string]: unknown;
}

/** The OpenRouter provider id as registered by pi's built-in provider. */
const OPENROUTER_PROVIDER = "openrouter";

/**
 * Default location of the extension config file (global, i.e. applies to all
 * projects). Override by setting OPENROUTER_SERVICE_TIER_CONFIG.
 */
function defaultConfigPath(): string {
	return join(homedir(), ".pi", "agent", "config", "openrouter-service-tier.json");
}

function resolveConfigPath(): string {
	const override = process.env.OPENROUTER_SERVICE_TIER_CONFIG;
	return override ? override : defaultConfigPath();
}

/**
 * Defensive access to the active model. Returns the full model id (e.g.
 * "openai/gpt-5") and whether the provider is OpenRouter.
 */
function activeModelInfo(ctx: ExtensionContext): {
	modelId?: string;
	isOpenRouter: boolean;
} {
	const model = ctx.model as { id?: string; provider?: string } | undefined;
	return {
		modelId: model?.id,
		isOpenRouter: model?.provider === OPENROUTER_PROVIDER,
	};
}

export default function openRouterServiceTier(pi: ExtensionAPI) {
	const configPath = resolveConfigPath();

	// Read the config on every request so edits to the config file (or via
	// /service-tier) take effect without a restart. Config parsing is cheap
	// relative to an LLM round-trip.
	const readConfig = (): ServiceTierConfig => loadConfig(configPath);

	pi.on("before_provider_request", (event, ctx) => {
		// Only OpenRouter requests are eligible for service tiers.
		const { modelId: activeModelId, isOpenRouter } = activeModelInfo(ctx);
		if (!isOpenRouter) {
			return;
		}

		const payload = event.payload as CompletablePayload | undefined;
		if (typeof payload !== "object" || payload === null) {
			return;
		}

		// Use the model id actually being sent; fall back to the active model.
		const requestedModelId =
			typeof payload.model === "string" ? payload.model : activeModelId;
		if (!requestedModelId) {
			return;
		}

		const tier = resolveTier(readConfig(), requestedModelId);
		if (tier === undefined) {
			// Ensure a stale tier is not left on the payload (e.g. if the user
			// cleared the configuration for a model that previously had one).
			if ("service_tier" in payload) {
				return { ...payload, service_tier: undefined };
			}
			return;
		}

		// Return a shallow copy with service_tier injected rather than mutating
		// the shared payload object. Collaborating extensions and pi both read
		// the returned value.
		return { ...payload, service_tier: tier };
	});

	pi.registerCommand("service-tier", {
		description:
			"View or set the OpenRouter service tier (flex/priority) for models. " +
			"Usage: /service-tier, /service-tier <tier>, /service-tier <model> <tier>, /service-tier clear",
		getArgumentCompletions: (prefix) => {
			const options = ["flex", "priority", "clear"];
			const filtered = options.filter((o) => o.startsWith(prefix.trim()));
			return filtered.length > 0
				? filtered.map((value) => ({ value, label: value }))
				: null;
		},
		handler: async (args, ctx) => {
			const config = readConfig();
			const parts = args.trim().split(/\s+/).filter(Boolean);
			const { modelId: activeModelId } = activeModelInfo(ctx);

			// No arguments: report the effective tier for the active model.
			if (parts.length === 0) {
				if (!activeModelId) {
					ctx.ui.notify("No active model.", "info");
					return;
				}
				const tier = resolveTier(config, activeModelId);
				ctx.ui.notify(
					tier
						? `OpenRouter service tier for ${activeModelId}: ${tier}`
						: `OpenRouter service tier for ${activeModelId}: (none configured)`,
					"info",
				);
				return;
			}

			// `clear` resets all service-tier configuration.
			if (parts.length === 1 && parts[0] === "clear") {
				config.enabled = true;
				config.defaultTier = undefined;
				config.models = [];
				config.overrides = {};
				saveConfig(configPath, config);
				ctx.ui.notify("Cleared all OpenRouter service tier configuration.", "info");
				return;
			}

			const isTier = (v: string): v is ServiceTier =>
				v === "flex" || v === "priority";

			// `/service-tier <tier>` — set the global default tier.
			if (parts.length === 1 && isTier(parts[0])) {
				config.defaultTier = parts[0];
				saveConfig(configPath, config);
				ctx.ui.notify(
					`OpenRouter default service tier set to ${parts[0]}.`,
					"info",
				);
				return;
			}

			// `/service-tier <model> <tier>` — set a per-model override.
			if (parts.length === 2 && isTier(parts[1])) {
				const [modelId, tier] = parts as [string, ServiceTier];
				config.overrides = config.overrides ?? {};
				config.overrides[modelId] = tier;
				// Ensure the model is added to the managed list so the override
				// takes effect even when an explicit model allowlist is set.
				if (config.models) {
					config.models = [...new Set([...config.models, modelId])];
				}
				saveConfig(configPath, config);
				ctx.ui.notify(
					`OpenRouter service tier for ${modelId} set to ${tier}.`,
					"info",
				);
				return;
			}

			// Everything else is a usage error. Prompt interactively so the
			// command is still usable without memorizing the exact syntax.
			const modelChoices = ["flex (default)", "priority"];
			const chosen = await ctx.ui.select("Select service tier", modelChoices);
			if (!chosen) return;
			const tier = chosen.startsWith("flex") ? "flex" : "priority";
			const modelId = parts[0] ?? activeModelId;
			if (!modelId) {
				ctx.ui.notify("No model to configure.", "error");
				return;
			}
			config.overrides = config.overrides ?? {};
			config.overrides[modelId] = tier;
			saveConfig(configPath, config);
			ctx.ui.notify(
				`OpenRouter service tier for ${modelId} set to ${tier}.`,
				"info",
			);
		},
	});
}
