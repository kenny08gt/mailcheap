import assert from "node:assert/strict";
import { test } from "node:test";
import { HOUR_MS, advance, newStepId } from "../lib/automation-steps.js";

const now = new Date("2026-10-13T12:00:00Z");
const email = (id) => ({ id, type: "email", subject: id, html: "<p>x</p>" });
const wait = (id, hours) => ({ id, type: "wait", hours });

test("a new run sends the first emails up to the first wait, then waits", () => {
	const steps = [email("a"), email("b"), wait("w", 24), email("c")];
	const result = advance({ steps, stepId: "a", stepIndex: 0, now });
	assert.deepEqual(result.emails, ["a", "b"]);
	assert.equal(result.stepId, "c");
	assert.equal(result.stepIndex, 3);
	assert.equal(result.status, "active");
	assert.equal(result.nextAt.getTime(), now.getTime() + 24 * HOUR_MS);
});

test("a run that starts on a wait sends nothing yet", () => {
	const steps = [wait("w", 1), email("a")];
	const result = advance({ steps, stepId: "w", stepIndex: 0, now });
	assert.deepEqual(result.emails, []);
	assert.equal(result.stepId, "a");
	assert.equal(result.nextAt.getTime(), now.getTime() + HOUR_MS);
});

test("waits chain: each tick stops at the next wait", () => {
	const steps = [wait("w1", 1), email("a"), wait("w2", 2), email("b")];
	const second = advance({ steps, stepId: "a", stepIndex: 1, now });
	assert.deepEqual(second.emails, ["a"]);
	assert.equal(second.stepId, "b");
	assert.equal(second.nextAt.getTime(), now.getTime() + 2 * HOUR_MS);
});

test("passing the last email completes the run", () => {
	const steps = [wait("w", 1), email("a")];
	const result = advance({ steps, stepId: "a", stepIndex: 1, now });
	assert.deepEqual(result.emails, ["a"]);
	assert.equal(result.status, "completed");
	assert.equal(result.stepId, null);
	assert.equal(result.nextAt, null);
});

test("a trailing wait keeps the run active until it elapses, then completes it", () => {
	const steps = [email("a"), wait("w", 3)];
	const first = advance({ steps, stepId: "a", stepIndex: 0, now });
	assert.equal(first.status, "active");
	assert.equal(first.stepId, null);
	assert.equal(first.stepIndex, 2);
	const after = advance({ steps, stepId: first.stepId, stepIndex: first.stepIndex, now });
	assert.equal(after.status, "completed");
	assert.deepEqual(after.emails, []);
});

test("the current step is found by id after steps are inserted before it", () => {
	const steps = [email("new"), wait("w", 1), email("a"), email("b")];
	const result = advance({ steps, stepId: "a", stepIndex: 1, now });
	assert.deepEqual(result.emails, ["a", "b"]);
	assert.equal(result.status, "completed");
});

test("a deleted current step falls back to the saved position", () => {
	// The run was waiting on "b" at index 2; "b" was deleted, so "c" moved into index 2.
	const steps = [email("a"), wait("w", 1), email("c")];
	const result = advance({ steps, stepId: "b", stepIndex: 2, now });
	assert.deepEqual(result.emails, ["c"]);
	assert.equal(result.status, "completed");
});

test("a saved position past the end completes the run", () => {
	const result = advance({ steps: [email("a")], stepId: "gone", stepIndex: 5, now });
	assert.equal(result.status, "completed");
	assert.deepEqual(result.emails, []);
});

test("an automation with no steps completes the run", () => {
	const result = advance({ steps: [], stepId: null, stepIndex: 0, now });
	assert.equal(result.status, "completed");
});

test("step ids are 12 hex characters and differ", () => {
	const ids = new Set(Array.from({ length: 50 }, newStepId));
	assert.equal(ids.size, 50);
	for (const id of ids) assert.match(id, /^[0-9a-f]{12}$/);
});
