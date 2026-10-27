import assert from "node:assert/strict";
import { test } from "node:test";
import { AUDIENCE_SORT } from "../lib/audience.js";
import { toSearchPattern } from "../lib/contact-search.js";
import Contact from "../models/Contact.js";

// JavaScript has no atomic groups; a plain group matches the same addresses, only with backtracking MongoDB avoids.
function matches(query, email) {
	return new RegExp(toSearchPattern(query).replaceAll("(?>", "(?:")).test(email);
}

test("a search finds its text anywhere in an address", () => {
	assert.ok(matches("@example.com", "jane@example.com"));
	assert.ok(matches("jane", "mary.jane@example.com"));
	assert.ok(!matches("@example.com", "jane@example.org"));
});

test("* stands for any characters, its parts in order", () => {
	assert.ok(matches("*@example.com", "jane@example.com"));
	assert.ok(matches("jane*@example.com", "jane.doe@example.com"));
	assert.ok(!matches("jane*@example.com", "jane@other.com"));
	assert.ok(!matches("example*jane", "jane@example.com"), "parts match in the order they're typed");
});

test("regex characters are literal and an empty search matches nothing", () => {
	assert.ok(matches("a+b@x.com", "a+b@x.com"));
	assert.ok(!matches("a.b", "axb@example.com"));
	assert.equal(toSearchPattern(""), null);
	assert.equal(toSearchPattern("***"), null);
	assert.equal(toSearchPattern("Jane*@Example.com"), "^(?>.*?jane)(?>.*?@example\\.com)");
});

test("a send's audience has an index in its order, so a big list never sorts in memory", () => {
	const keys = Contact.schema.indexes().map(([fields]) => fields);
	assert.ok(keys.some((fields) => JSON.stringify(fields) === JSON.stringify({ newsletterId: 1, status: 1, ...AUDIENCE_SORT })));
});
