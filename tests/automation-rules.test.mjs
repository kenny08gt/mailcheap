import assert from "node:assert/strict";
import { test } from "node:test";
import {
	canStartAgain,
	getAutomationProblem,
	readAutomationInput,
	readEventName,
	readProperties,
} from "../lib/automation-rules.js";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-13T12:00:00Z");

test("event names follow the pattern and contact_active is reserved", () => {
	assert.equal(readEventName("plan_checkout_started"), "plan_checkout_started");
	assert.equal(readEventName("  Plan_Purchased "), "plan_purchased");
	assert.equal(readEventName("contact_active"), null);
	assert.equal(readEventName("1st"), null);
	assert.equal(readEventName("has-dash"), null);
	assert.equal(readEventName("a".repeat(51)), null);
	assert.equal(readEventName(42), null);
});

test("properties are a flat object of short scalars", () => {
	assert.deepEqual(readProperties(undefined), { properties: {} });
	assert.deepEqual(readProperties({ plan: "Pro", seats: 3, trial: true }), {
		properties: { plan: "Pro", seats: 3, trial: true },
	});
	assert.ok(readProperties([]).error);
	assert.ok(readProperties({ nested: { a: 1 } }).error);
	assert.ok(readProperties({ BadKey: "x" }).error);
	assert.ok(readProperties({ long: "x".repeat(501) }).error);
	assert.ok(readProperties({ n: Number.NaN }).error);
	assert.ok(readProperties({ name: "Ana\r\nBcc: x@y.com" }).error);
	assert.ok(readProperties(Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, i]))).error);
});

test("re-entry: never, or after the cooldown", () => {
	assert.equal(canStartAgain({ reentry: { allowed: false }, lastEnrolledAt: null, now }), true);
	assert.equal(canStartAgain({ reentry: { allowed: false }, lastEnrolledAt: new Date(now - 400 * DAY), now }), false);
	const weekly = { allowed: true, cooldownDays: 7 };
	assert.equal(canStartAgain({ reentry: weekly, lastEnrolledAt: new Date(now - 6 * DAY), now }), false);
	assert.equal(canStartAgain({ reentry: weekly, lastEnrolledAt: new Date(now - 7 * DAY), now }), true);
});

test("saved input is cleaned and checked", () => {
	const { automation } = readAutomationInput({
		name: "  Plan dropout ",
		trigger: "plan_checkout_started",
		exitOn: ["plan_purchased", "plan_purchased", "bad name"],
		reentry: { allowed: true, cooldownDays: "7" },
		steps: [
			{ id: "aaaaaaaaaaaa", type: "wait", hours: 1 },
			{ id: "bbbbbbbbbbbb", type: "email", subject: " Hola ", previewText: "", html: "<p>x</p>" },
		],
	});
	assert.equal(automation.name, "Plan dropout");
	assert.deepEqual(automation.trigger, { event: "plan_checkout_started" });
	assert.deepEqual(automation.exitOn, ["plan_purchased"]);
	assert.deepEqual(automation.reentry, { allowed: true, cooldownDays: 7 });
	assert.equal(automation.steps[1].subject, "Hola");
	assert.equal(readAutomationInput({ trigger: "contact_active", steps: [] }).automation.trigger.event, "contact_active");
});

test("saved input refuses bad steps", () => {
	const base = { name: "x", trigger: "contact_active" };
	assert.ok(readAutomationInput({ ...base, steps: [{ id: "x", type: "wait", hours: 1 }] }).error);
	assert.ok(readAutomationInput({ ...base, steps: [{ id: "aaaaaaaaaaaa", type: "wait", hours: 0 }] }).error);
	assert.ok(readAutomationInput({ ...base, steps: [{ id: "aaaaaaaaaaaa", type: "wait", hours: 24 * 366 }] }).error);
	assert.ok(readAutomationInput({ ...base, steps: [{ id: "aaaaaaaaaaaa", type: "sms" }] }).error);
	const dup = { id: "aaaaaaaaaaaa", type: "wait", hours: 1 };
	assert.ok(readAutomationInput({ ...base, steps: [dup, dup] }).error);
	assert.ok(readAutomationInput({ ...base, trigger: "Bad Name", steps: [] }).error);
});

test("activation needs an email step, with a subject and content in each", () => {
	const ok = {
		trigger: { event: "contact_active" },
		steps: [{ id: "a", type: "email", subject: "Hola", html: "<p>x</p>" }],
	};
	assert.equal(getAutomationProblem(ok), null);
	assert.match(getAutomationProblem({ ...ok, steps: [{ id: "w", type: "wait", hours: 1 }] }), /email/);
	assert.match(getAutomationProblem({ ...ok, steps: [{ id: "a", type: "email", subject: "", html: "<p>x</p>" }] }), /subject/);
	assert.match(getAutomationProblem({ ...ok, steps: [{ id: "a", type: "email", subject: "x", html: "<p></p>" }] }), /content/);
	assert.match(getAutomationProblem({ ...ok, trigger: {} }), /trigger/);
});
