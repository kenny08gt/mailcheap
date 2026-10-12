import assert from "node:assert/strict";
import { test } from "node:test";
import {
	ANALYSIS_SCHEMA,
	DRAFT_SCHEMA,
	REWRITE_SCHEMA,
	buildSystemPrompt,
	getCostUsd,
	normalizeDraft,
	normalizeRewrite,
	summarizeCampaigns,
} from "../lib/ai-assistant.js";
import { isAiEnabled } from "../lib/config.js";
import { countLinkClicks } from "../lib/message-stats.js";

test("the system prompt asks for Spanish and lists the blocks the renderer keeps", () => {
	const prompt = buildSystemPrompt({ newsletterName: "Pandy al día", fromName: "Pandy Medical" });
	assert.match(prompt, /Spanish/);
	assert.match(prompt, /Pandy al día/);
	assert.match(prompt, /Pandy Medical/);
	for (const tag of ["<h1>", "<h2>", "<h3>", "<p>", "<strong>", "<em>", "<a href", "<ul>", "<ol>", "<li>", "<blockquote>", "<hr>", "<img", "data-callout"]) {
		assert.ok(prompt.includes(tag), `mentions ${tag}`);
	}
	assert.match(prompt, /never invent an image URL/);
	assert.match(prompt, /inline styles, classes/);
});

test("every output schema is strict: no extra properties and every property required", () => {
	function check(schema, path) {
		if (schema.type === "array") return check(schema.items, `${path}[]`);
		if (schema.type !== "object") return;
		assert.equal(schema.additionalProperties, false, `${path} forbids extra properties`);
		assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort(), `${path} requires all`);
		for (const [key, value] of Object.entries(schema.properties)) check(value, `${path}.${key}`);
	}
	check(DRAFT_SCHEMA, "draft");
	check(REWRITE_SCHEMA, "rewrite");
	check(ANALYSIS_SCHEMA, "analysis");
	assert.deepEqual(Object.keys(DRAFT_SCHEMA.properties).sort(), ["html", "previewText", "subject"]);
});

test("generated drafts go through the editor's cleaner and fit the subject and preview limits", () => {
	const draft = normalizeDraft({
		subject: `  ${"Asunto ".repeat(40)}  `,
		previewText: "x".repeat(400),
		html: `<html><body><h2 style="color:red" class="title">Hola</h2><script>alert(1)</script><p onclick="x()">Texto <span style="font-weight:bold">fuerte</span></p><h5>Detalle</h5><div data-callout="" style="background:blue"><p>Caja</p></div><img src="javascript:alert(1)"><img src="https://cdn.example.com/a.png" alt="A" style="width:10px"><table><tr><td>t</td></tr></table></body></html>`,
	});
	assert.ok(draft.subject.length <= 120);
	assert.equal(draft.subject, draft.subject.trim());
	assert.ok(draft.previewText.length <= 150);
	assert.doesNotMatch(draft.html, /style=|class=|onclick|<script|alert\(1\)|javascript:|<html|<body/);
	assert.match(draft.html, /<h2>Hola<\/h2>/);
	assert.match(draft.html, /<h3>Detalle<\/h3>/, "h5 becomes the editor's deepest heading");
	assert.match(draft.html, /<div data-callout=""><p>Caja<\/p><\/div>/);
	assert.match(draft.html, /<img src="https:\/\/cdn\.example\.com\/a\.png" alt="A">/);
});

test("an inline rewrite comes back without block elements, keeping marks and links", () => {
	const { html } = normalizeRewrite(
		{ html: '<p>Lea <strong>ya</strong> el <a href="https://pandy.example/x" style="color:red">artículo</a></p><h2>extra</h2>' },
		{ isInline: true }
	);
	assert.equal(html, 'Lea <strong>ya</strong> el <a href="https://pandy.example/x">artículo</a> extra');
	const block = normalizeRewrite({ html: '<p style="margin:0">Uno</p><ul><li>Dos</li></ul>' }, { isInline: false });
	assert.equal(block.html, "<p>Uno</p><ul><li>Dos</li></ul>");
});

test("cost uses the model's price per million tokens, and unknown models have none", () => {
	assert.equal(getCostUsd("claude-opus-5-5", { inputTokens: 1_000_000, outputTokens: 1_000_000 }), 24);
	assert.equal(getCostUsd("claude-sonnet-5-5", { inputTokens: 500_000, outputTokens: 100_000 }), 2);
	assert.equal(getCostUsd("claude-haiku-5-5", { inputTokens: 2_000_000, outputTokens: 0 }), 0.2);
	assert.equal(getCostUsd("kimi-k2", { inputTokens: 1000, outputTokens: 1000 }), null);
});

test("the analysis summary carries aggregates and content, never an email address", () => {
	const campaign = {
		_id: "64f1a2b3c4d5e6f7a8b9c0d1",
		subject: "Escríbanos a info@pandy.example",
		previewText: "Novedades",
		format: "rich",
		html: "<p>Hola a <strong>todos</strong>, nos vemos pronto.</p>",
		sentAt: new Date("2026-09-01T15:00:00Z"),
		stats: { sent: 200, delivered: 190, opened: 95, clicked: 19, bounced: 10, complained: 1, unsubscribed: 2 },
		email: "reader@example.com",
	};
	const providers = new Map([[campaign._id, [{ provider: "gmail", sent: 120, delivered: 118, opened: 60, clicked: 12, bounced: 2, complained: 0, email: "x@gmail.com" }]]]);
	const links = new Map([
		[
			campaign._id,
			[
				{ url: "https://pandy.example/citas?email=reader@example.com&utm=1", clickers: 7 },
				{ url: "https://pandy.example/citas?ref=2", clickers: 3 },
				{ url: "https://pandy.example/u/reader@example.com", clickers: 1 },
			],
		],
	]);
	const [summary] = summarizeCampaigns([campaign], { providers, links });

	assert.doesNotMatch(JSON.stringify(summary), /[^\s"@]+@[^\s"@]+\.[a-z]{2,}/i);
	assert.equal(summary.sentOn, "2026-09-01");
	assert.equal(summary.words, 6);
	assert.equal(summary.openRate, 50);
	assert.equal(summary.clickRate, 10);
	assert.equal(summary.bounceRate, 5);
	assert.equal(summary.complaintRate, 0.5);
	assert.deepEqual(summary.providers, [{ provider: "gmail", sent: 120, openRate: 50.8, clickRate: 10.2, bounceRate: 1.7 }]);
	assert.deepEqual(summary.topLinks[0], { url: "https://pandy.example/citas", clickers: 10 });
});

test("link clicks count each contact once per link, most clicked first", () => {
	const rows = countLinkClicks([
		{ clickedUrls: ["https://a.example/", "https://b.example/"] },
		{ clickedUrls: ["https://b.example/"] },
		{ clickedUrls: ["https://b.example/", "https://c.example/"] },
		{},
	]);
	assert.deepEqual(rows, [
		{ url: "https://b.example/", clickers: 3 },
		{ url: "https://a.example/", clickers: 1 },
		{ url: "https://c.example/", clickers: 1 },
	]);
	assert.equal(countLinkClicks(rows.map(() => ({ clickedUrls: ["https://x.example/"] })), 1).length, 1);
});

test("the assistant is on only with a key and a provider that has an adapter", () => {
	assert.equal(isAiEnabled({ AI_API_KEY: "k" }), true, "Anthropic by default");
	assert.equal(isAiEnabled({ AI_API_KEY: "k", AI_PROVIDER: "anthropic" }), true);
	assert.equal(isAiEnabled({ AI_API_KEY: "k", AI_PROVIDER: "openai-compatible" }), false);
	assert.equal(isAiEnabled({ AI_PROVIDER: "anthropic" }), false);
});
