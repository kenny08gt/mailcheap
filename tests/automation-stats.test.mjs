import assert from "node:assert/strict";
import { test } from "node:test";
import { isGoalReached, periodBounds, summarizeAutomations } from "../lib/automation-stats.js";
import { formatRate } from "../lib/format.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function automation(id, status, { exitOn = [], createdAt = "2026-01-01" } = {}) {
	return { _id: id, name: id, status, exitOn, createdAt: new Date(createdAt) };
}

function runs(automationId, status, count, { exitReason, started = null, ended = null } = {}) {
	return { _id: { automationId, status, exitReason, started, ended }, count };
}

test("the periods are the last 30 days and the 30 before", () => {
	const now = new Date("2026-10-13T12:00:00Z");
	const { since, previousSince } = periodBounds(now);
	assert.equal(now - since, 30 * DAY_MS);
	assert.equal(now - previousSince, 60 * DAY_MS);
});

test("only an exit event of the automation reaches the goal", () => {
	const exitOn = ["purchased"];
	assert.equal(isGoalReached({ status: "exited", exitReason: "purchased" }, exitOn), true);
	assert.equal(isGoalReached({ status: "exited", exitReason: "unsubscribed" }, exitOn), false);
	assert.equal(isGoalReached({ status: "exited", exitReason: "bounced" }, exitOn), false);
	assert.equal(isGoalReached({ status: "exited", exitReason: "deleted" }, exitOn), false);
	assert.equal(isGoalReached({ status: "exited", exitReason: "purchased" }, []), false);
	assert.equal(isGoalReached({ status: "completed" }, exitOn), false);
});

test("goal reached counts exit events out of every run that ended in the period", () => {
	const { totals, rows } = summarizeAutomations({
		automations: [automation("a", "active", { exitOn: ["purchased"] })],
		messageRows: [],
		enrollmentRows: [
			runs("a", "exited", 3, { exitReason: "purchased", started: "current", ended: "current" }),
			runs("a", "exited", 2, { exitReason: "unsubscribed", started: "previous", ended: "current" }),
			runs("a", "exited", 1, { exitReason: "complained", ended: "current" }),
			runs("a", "completed", 4, { ended: "current" }),
			runs("a", "active", 5, { started: "current" }),
		],
	});
	assert.deepEqual(
		{ ended: totals.current.ended, goalEnded: totals.current.goalEnded, goalReached: totals.current.goalReached },
		{ ended: 10, goalEnded: 10, goalReached: 3 }
	);
	assert.equal(formatRate(rows[0].goalReached, rows[0].goalEnded), "30.0%");
	assert.equal(rows[0].inProgress, 5);
	assert.equal(rows[0].started, 8);
	assert.equal(totals.previous.started, 2);
});

test("an automation without exit events has no goal rate", () => {
	const { totals, rows } = summarizeAutomations({
		automations: [automation("a", "active"), automation("b", "active", { exitOn: ["booked"] })],
		messageRows: [],
		enrollmentRows: [
			runs("a", "completed", 6, { ended: "current" }),
			runs("b", "exited", 1, { exitReason: "booked", ended: "current" }),
			runs("b", "completed", 1, { ended: "current" }),
		],
	});
	const [a] = rows.filter(({ id }) => id === "a");
	assert.equal(formatRate(a.goalReached, a.goalEnded), null);
	assert.equal(totals.current.ended, 8);
	assert.equal(formatRate(totals.current.goalReached, totals.current.goalEnded), "50.0%");
});

test("rates with nothing to divide by are empty, not zero", () => {
	const { totals, rows } = summarizeAutomations({
		automations: [automation("a", "draft", { exitOn: ["booked"] })],
		messageRows: [],
		enrollmentRows: [],
	});
	assert.equal(formatRate(rows[0].opened, rows[0].sent), null);
	assert.equal(formatRate(rows[0].goalReached, rows[0].goalEnded), null);
	assert.equal(formatRate(totals.previous.clicked, totals.previous.sent), null);
});

test("emails and runs fall in their own period, and older ones in neither", () => {
	const { totals, rows } = summarizeAutomations({
		automations: [automation("a", "active", { exitOn: ["booked"] })],
		messageRows: [
			{ _id: { automationId: "a", period: "current" }, sent: 10, opened: 4, clicked: 1 },
			{ _id: { automationId: "a", period: "previous" }, sent: 20, opened: 5, clicked: 2 },
			{ _id: { automationId: "a", period: null }, sent: 99, opened: 99, clicked: 99 },
		],
		enrollmentRows: [
			runs("a", "exited", 2, { exitReason: "booked", started: "previous", ended: "previous" }),
			runs("a", "completed", 7, {}),
		],
	});
	assert.deepEqual(
		{ sent: totals.current.sent, opened: totals.current.opened, clicked: totals.current.clicked },
		{ sent: 10, opened: 4, clicked: 1 }
	);
	assert.deepEqual(
		{ sent: totals.previous.sent, opened: totals.previous.opened, clicked: totals.previous.clicked },
		{ sent: 20, opened: 5, clicked: 2 }
	);
	assert.equal(totals.previous.goalReached, 2);
	assert.equal(totals.current.ended, 0);
	assert.equal(rows[0].sent, 10);
	assert.equal(formatRate(rows[0].opened, rows[0].sent), "40.0%");
});

test("rows list active, then paused, then draft, newest first within each", () => {
	const { rows } = summarizeAutomations({
		automations: [
			automation("draft", "draft", { createdAt: "2026-09-01" }),
			automation("paused", "paused", { createdAt: "2026-01-01" }),
			automation("old active", "active", { createdAt: "2026-02-01" }),
			automation("new active", "active", { createdAt: "2026-08-01" }),
		],
		messageRows: [],
		enrollmentRows: [],
	});
	assert.deepEqual(
		rows.map(({ id }) => id),
		["new active", "old active", "paused", "draft"]
	);
});

test("rows of other automations are ignored", () => {
	const { totals } = summarizeAutomations({
		automations: [automation("a", "active")],
		messageRows: [{ _id: { automationId: "z", period: "current" }, sent: 5, opened: 1, clicked: 1 }],
		enrollmentRows: [runs("z", "active", 3, { started: "current" })],
	});
	assert.equal(totals.current.sent, 0);
	assert.equal(totals.current.started, 0);
});
