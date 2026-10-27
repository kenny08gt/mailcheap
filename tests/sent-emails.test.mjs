import assert from "node:assert/strict";
import { test } from "node:test";
import { countEmails, describeSource, emailsHref, parseEmailFilters } from "../lib/sent-emails.js";

test("unknown, inherited or missing filters fall back to everything on page one", () => {
	assert.deepEqual(parseEmailFilters({}), { kind: null, status: null, page: 1 });
	assert.deepEqual(parseEmailFilters({ kind: "constructor", status: "nope", page: "-3" }), { kind: null, status: null, page: 1 });
	assert.deepEqual(parseEmailFilters({ kind: "automation", status: "failed", page: "2" }), {
		kind: "automation",
		status: "failed",
		page: 2,
	});
});

test("each pill row counts within the other filter", () => {
	const rows = [
		{ _id: { kind: "campaign", status: "delivered" }, count: 10 },
		{ _id: { kind: "campaign", status: "failed" }, count: 2 },
		{ _id: { kind: "automation", status: "delivered" }, count: 4 },
		{ _id: { kind: "automation", status: "failed" }, count: 1 },
	];
	assert.deepEqual(countEmails(rows, { kind: null, status: null }), {
		kinds: { all: 17, campaign: 12, automation: 5 },
		statuses: { all: 17, delivered: 14, failed: 3 },
	});
	assert.deepEqual(countEmails(rows, { kind: "automation", status: "failed" }), {
		kinds: { all: 3, campaign: 2, automation: 1 },
		statuses: { all: 5, delivered: 4, failed: 1 },
	});
});

test("links drop empty filters and page one", () => {
	assert.equal(emailsHref({}), "/emails");
	assert.equal(emailsHref({ kind: "automation", status: null, page: 1 }), "/emails?kind=automation");
	assert.equal(emailsHref({ kind: null, status: "failed", page: 3 }), "/emails?status=failed&page=3");
});

test("the source names the campaign or the automation's email step", () => {
	const campaigns = new Map([["c1", { subject: "October news" }]]);
	const automations = new Map([
		[
			"a1",
			{
				name: "Activación",
				steps: [
					{ id: "s1", type: "email" },
					{ id: "w1", type: "wait" },
					{ id: "s2", type: "email" },
				],
			},
		],
	]);
	const lookups = { campaigns, automations };
	assert.deepEqual(describeSource({ kind: "campaign", campaignId: "c1" }, lookups), {
		label: "October news",
		href: "/campaigns/c1",
	});
	assert.deepEqual(describeSource({ kind: "campaign", campaignId: "gone" }, lookups), {
		label: "Deleted campaign",
		href: null,
	});
	assert.deepEqual(describeSource({ kind: "automation", automationId: "a1", stepId: "s2" }, lookups), {
		label: "Activación · email 2",
		href: "/automations/a1",
	});
	assert.equal(describeSource({ kind: "automation", automationId: "a1", stepId: "old" }, lookups).label, "Activación · removed email");
	assert.deepEqual(describeSource({ kind: "welcome" }, lookups), { label: "Welcome", href: null });
});
