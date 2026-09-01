import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
	defaultConfig,
	isServiceTier,
	loadConfig,
	normalizeConfig,
	resolveTier,
	saveConfig,
	type ServiceTierConfig,
} from "../config.ts";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("isServiceTier", () => {
	it("accepts flex and priority", () => {
		assert.equal(isServiceTier("flex"), true);
		assert.equal(isServiceTier("priority"), true);
	});

	it("rejects invalid values", () => {
		assert.equal(isServiceTier("fast"), false);
		assert.equal(isServiceTier("default"), false);
		assert.equal(isServiceTier(""), false);
		assert.equal(isServiceTier(undefined), false);
		assert.equal(isServiceTier(123), false);
	});
});

describe("normalizeConfig", () => {
	it("returns defaults for garbage input", () => {
		assert.deepEqual(normalizeConfig(null), defaultConfig());
		assert.deepEqual(normalizeConfig(undefined), defaultConfig());
		assert.deepEqual(normalizeConfig("nope"), defaultConfig());
	});

	it("loads a valid config and ignores invalid fields", () => {
		const config = normalizeConfig({
			enabled: false,
			defaultTier: "flex",
			models: ["openai/gpt-5", 42, ""],
			overrides: {
				"openai/gpt-5": "priority",
				"bad/model": "fast",
			},
		});

		assert.equal(config.enabled, false);
		assert.equal(config.defaultTier, "flex");
		assert.deepEqual(config.models, ["openai/gpt-5"]);
		assert.deepEqual(config.overrides, { "openai/gpt-5": "priority" });
	});
});

describe("resolveTier", () => {
	it("returns undefined when disabled", () => {
		const config: ServiceTierConfig = { ...defaultConfig(), enabled: false, defaultTier: "flex" };
		assert.equal(resolveTier(config, "openai/gpt-5"), undefined);
	});

	it("applies the default tier to all models when no allowlist is set", () => {
		const config: ServiceTierConfig = { ...defaultConfig(), defaultTier: "priority" };
		assert.equal(resolveTier(config, "openai/gpt-5"), "priority");
	});

	it("applies the allowlist: unlisted models get no tier", () => {
		const config: ServiceTierConfig = {
			...defaultConfig(),
			defaultTier: "priority",
			models: ["openai/gpt-5"],
		};
		assert.equal(resolveTier(config, "openai/gpt-5"), "priority");
		assert.equal(resolveTier(config, "openai/gpt-5-mini"), undefined);
	});

	it("prefers a per-model override over the default", () => {
		const config: ServiceTierConfig = {
			...defaultConfig(),
			defaultTier: "flex",
			overrides: { "openai/gpt-5": "priority" },
		};
		assert.equal(resolveTier(config, "openai/gpt-5"), "priority");
		assert.equal(resolveTier(config, "openai/gpt-6"), "flex");
	});

	it("respects the allowlist combined with overrides", () => {
		const config: ServiceTierConfig = {
			...defaultConfig(),
			defaultTier: "flex",
			models: ["openai/gpt-5", "openai/gpt-5-mini"],
			overrides: { "openai/gpt-5": "priority" },
		};
		assert.equal(resolveTier(config, "openai/gpt-5"), "priority");
		assert.equal(resolveTier(config, "openai/gpt-5-mini"), "flex");
		assert.equal(resolveTier(config, "google/gemini-2.5-flash"), undefined);
	});

	it("returns undefined when no tier is configured at all", () => {
		assert.equal(resolveTier(defaultConfig(), "openai/gpt-5"), undefined);
	});
});

describe("loadConfig / saveConfig round-trip", () => {
	it("persists and reloads a config", () => {
		const dir = mkdtempSync(join(tmpdir(), "pi-oar-tier-"));
		try {
			const file = join(dir, "config.json");
			const before: ServiceTierConfig = {
				enabled: true,
				defaultTier: "flex",
				models: ["openai/gpt-5"],
				overrides: { "openai/gpt-5": "priority" },
			};
			saveConfig(file, before);
			const onDisk = JSON.parse(readFileSync(file, "utf8"));
			assert.equal(onDisk.defaultTier, "flex");
			assert.deepEqual(loadConfig(file), {
				enabled: true,
				defaultTier: "flex",
				models: ["openai/gpt-5"],
				overrides: { "openai/gpt-5": "priority" },
			});
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("falls back to defaults for a missing file", () => {
		assert.deepEqual(loadConfig("/does/not/exist.json"), defaultConfig());
	});
});
