import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import openRouterServiceTier from "../index.ts";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Minimal fakes for pi's ExtensionAPI and ExtensionContext so we can exercise
 * the extension wiring without the pi runtime.
 */

type Handler = (event: any, ctx: any) => any;

function fakePi() {
	const handlers = new Map<string, Handler[]>();
	const commands: Array<{ name: string; handler: (args: string, ctx: any) => Promise<unknown> }> = [];

	const pi = {
		on: (event: string, handler: Handler) => {
			const list = handlers.get(event) ?? [];
			list.push(handler);
			handlers.set(event, list);
		},
		registerCommand: (name: string, opts: { handler: (args: string, ctx: any) => Promise<unknown> }) => {
			commands.push({ name, handler: opts.handler });
		},
	} as unknown as ExtensionAPI;

	return {
		pi,
		handlers,
		commands,
		get: (event: string): Handler[] => handlers.get(event) ?? [],
	};
}

function fakeCtx(modelId: string, isOpenRouter = true) {
	const notifies: string[] = [];
	const ctx: any = {
		model: isOpenRouter ? { id: modelId, provider: "openrouter" } : { id: modelId, provider: "anthropic" },
		ui: {
			notify: (msg: string) => notifies.push(msg),
			select: async () => "flex (default)",
		},
	};
	return { ctx, notifies };
}

describe("extension wiring", () => {
	it("registers the /service-tier command and the before_provider_request hook", () => {
		const { pi, commands, get } = fakePi();
		openRouterServiceTier(pi);

		assert.ok(commands.some((c) => c.name === "service-tier"), "command registered");
		assert.ok(get("before_provider_request").length > 0, "hook registered");
	});

	it("injects service_tier for a configured openrouter model", () => {
		const dir = mkdtempSync(join(tmpdir(), "pi-oar-wiring-"));
		try {
			const configFile = join(dir, "config.json");
			writeFileSync(
				configFile,
				JSON.stringify({ enabled: true, defaultTier: "flex", overrides: {} }),
			);
			process.env.OPENROUTER_SERVICE_TIER_CONFIG = configFile;

			const { pi, get } = fakePi();
			openRouterServiceTier(pi);

			const { ctx } = fakeCtx("google/gemini-3.7-flash");
			const payload = { model: "google/gemini-3.7-flash", messages: [] };
			const result = get("before_provider_request")[0](
				{ type: "before_provider_request", payload },
				ctx,
			);

			assert.deepEqual(result, { ...payload, service_tier: "flex" });
		} finally {
			delete process.env.OPENROUTER_SERVICE_TIER_CONFIG;
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("does not inject service_tier for non-openrouter providers", () => {
		const dir = mkdtempSync(join(tmpdir(), "pi-oar-wiring-"));
		try {
			const configFile = join(dir, "config.json");
			writeFileSync(
				configFile,
				JSON.stringify({ enabled: true, defaultTier: "flex", overrides: {} }),
			);
			process.env.OPENROUTER_SERVICE_TIER_CONFIG = configFile;

			const { pi, get } = fakePi();
			openRouterServiceTier(pi);

			// Anthropic provider: must NOT inject.
			const { ctx } = fakeCtx("claude-sonnet-4", false);
			const result = get("before_provider_request")[0](
				{ type: "before_provider_request", payload: { model: "claude-sonnet-4" } },
				ctx,
			);
			assert.equal(result, undefined);
		} finally {
			delete process.env.OPENROUTER_SERVICE_TIER_CONFIG;
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
