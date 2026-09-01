/**
 * Configuration for the OpenRouter Service Tier pi extension.
 *
 * This module contains only the pure config helpers (types, defaults,
 * validation, and tier resolution). It has no dependency on the pi runtime,
 * which keeps it easy to unit test.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** A service tier supported by OpenRouter's `service_tier` parameter. */
export type ServiceTier = "flex" | "priority";

export const SERVICE_TIERS: readonly ServiceTier[] = ["flex", "priority"] as const;

/**
 * A resolved service tier for a model, or `undefined` when no tier is
 * configured and the request should be left untouched.
 */
export type ResolvedTier = ServiceTier | undefined;

/** The on-disk configuration schema. */
export interface ServiceTierConfig {
	/** Master switch. When false the extension never injects a service_tier. */
	enabled: boolean;
	/**
	 * Global default tier applied to every managed OpenRouter model that does
	 * not have a per-model override. Leave undefined to opt every model out by
	 * default and rely solely on per-model overrides.
	 */
	defaultTier?: ServiceTier;
	/**
	 * Optional allowlist of managed OpenRouter model IDs (e.g. "openai/gpt-5").
	 * When empty or undefined, every OpenRouter model is considered managed.
	 */
	models?: string[];
	/** Per-model tier overrides. Takes precedence over `defaultTier`. */
	overrides?: Record<string, ServiceTier>;
}

export function defaultConfig(): ServiceTierConfig {
	return {
		enabled: true,
		models: [],
		overrides: {},
	};
}

/** Returns `true` if `value` is a valid OpenRouter service tier. */
export function isServiceTier(value: unknown): value is ServiceTier {
	return (
		typeof value === "string" &&
		(SERVICE_TIERS as readonly string[]).includes(value)
	);
}

/** Normalizes an unknown config value (from JSON) into `ServiceTierConfig`. */
export function normalizeConfig(raw: unknown): ServiceTierConfig {
	const config = defaultConfig();

	if (typeof raw !== "object" || raw === null) {
		return config;
	}

	const source = raw as Record<string, unknown>;

	if (typeof source.enabled === "boolean") {
		config.enabled = source.enabled;
	}

	if (isServiceTier(source.defaultTier)) {
		config.defaultTier = source.defaultTier;
	}

	if (Array.isArray(source.models)) {
		config.models = source.models.filter(
			(m): m is string => typeof m === "string" && m.length > 0,
		);
	}

	if (typeof source.overrides === "object" && source.overrides !== null) {
		for (const [modelId, tier] of Object.entries(source.overrides as Record<string, unknown>)) {
			if (isServiceTier(tier)) {
				config.overrides![modelId] = tier;
			}
		}
	}

	return config;
}

/**
 * Resolves the effective service tier for a model.
 *
 * Precedence:
 *  1. A per-model override in `overrides[modelId]`.
 *  2. The global `defaultTier`.
 *
 * Only models that are managed (in `models`, or `models` empty = all) are
 * eligible. Returns `undefined` when no tier applies so callers can leave the
 * request untouched.
 */
export function resolveTier(
	config: ServiceTierConfig,
	modelId: string,
): ResolvedTier {
	if (!config.enabled) {
		return undefined;
	}

	const isManaged =
		!config.models || config.models.length === 0 || config.models.includes(modelId);
	if (!isManaged) {
		return undefined;
	}

	return config.overrides?.[modelId] ?? config.defaultTier;
}

/**
 * Reads and normalizes the config from disk. Missing or invalid files fall
 * back to the defaults.
 */
export function loadConfig(filePath: string): ServiceTierConfig {
	try {
		const raw = readFileSync(filePath, "utf8");
		return normalizeConfig(JSON.parse(raw));
	} catch {
		return defaultConfig();
	}
}

/** Writes the config to disk, creating the parent directory as needed. */
export function saveConfig(filePath: string, config: ServiceTierConfig): void {
	mkdirSync(dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}
