import assert from "node:assert/strict";
import { test } from "node:test";
import { ALL_RECIPIENTS, RECIPIENT_FILTERS, getRecipientFilter, getRecipientStatus } from "../lib/campaign-recipients.js";

const at = new Date("2026-10-20T10:00:00Z");

test("unknown or inherited filter keys fall back to every recipient", () => {
	assert.equal(getRecipientFilter(undefined), ALL_RECIPIENTS);
	assert.equal(getRecipientFilter("nope"), ALL_RECIPIENTS);
	assert.equal(getRecipientFilter("constructor"), ALL_RECIPIENTS);
	assert.equal(getRecipientFilter("bounced"), RECIPIENT_FILTERS.bounced);
});

test("not opened means delivered and never opened", () => {
	assert.deepEqual(RECIPIENT_FILTERS["not-opened"].match, { deliveredAt: { $ne: null }, openedAt: null });
});

test("the worst thing that happened to an email is its status", () => {
	assert.equal(getRecipientStatus({ status: "delivered" }), "delivered");
	assert.equal(getRecipientStatus({ status: "delivered", openedAt: at }), "opened");
	assert.equal(getRecipientStatus({ status: "delivered", openedAt: at, clickedAt: at }), "clicked");
	assert.equal(getRecipientStatus({ status: "delivered", clickedAt: at, unsubscribedAt: at }), "unsubscribed");
	assert.equal(getRecipientStatus({ status: "complained", openedAt: at, complainedAt: at }), "complained");
	assert.equal(getRecipientStatus({ status: "bounced", bouncedAt: at }), "bounced");
	assert.equal(getRecipientStatus({ status: "failed" }), "failed");
});
