import { PERIOD_DAYS } from "./overview-series.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const STATUS_ORDER = ["active", "paused", "draft"];
const PERIODS = ["current", "previous"];

export function periodBounds(now = new Date()) {
	return {
		since: new Date(now.getTime() - PERIOD_DAYS * DAY_MS),
		previousSince: new Date(now.getTime() - 2 * PERIOD_DAYS * DAY_MS),
	};
}

// A run reached its goal when one of the automation's exit events ended it. Runs the automation ended
// itself carry the contact's status (unsubscribed, bounced, deleted...) as the reason instead. This
// reads the automation's exit events as they are now, so editing them reclassifies past runs.
export function isGoalReached({ status, exitReason }, exitOn) {
	return status === "exited" && exitOn.includes(exitReason);
}

function emptyTotals() {
	return { sent: 0, opened: 0, clicked: 0, started: 0, ended: 0, goalEnded: 0, goalReached: 0 };
}

// messageRows: { _id: { automationId, period }, sent, opened, clicked }, period "current" or "previous".
// enrollmentRows: { _id: { automationId, status, exitReason, started, ended }, count }, where started
// and ended are the period of enrolledAt and endedAt, or null when outside both periods (or not ended).
// Goal reached counts only automations with exit events: the others have no goal to reach, so their
// ended runs (goalEnded) stay out of the rate.
export function summarizeAutomations({ automations, messageRows, enrollmentRows }) {
	const totals = { current: emptyTotals(), previous: emptyTotals() };
	const byId = new Map(
		automations.map((automation) => [
			String(automation._id),
			{ automation, inProgress: 0, periods: { current: emptyTotals(), previous: emptyTotals() } },
		])
	);

	for (const { _id, sent, opened, clicked } of messageRows) {
		const entry = byId.get(String(_id.automationId));
		if (!entry || !PERIODS.includes(_id.period)) continue;
		for (const target of [entry.periods[_id.period], totals[_id.period]]) {
			target.sent += sent;
			target.opened += opened;
			target.clicked += clicked;
		}
	}

	for (const { _id, count } of enrollmentRows) {
		const entry = byId.get(String(_id.automationId));
		if (!entry) continue;
		const exitOn = entry.automation.exitOn ?? [];
		if (_id.status === "active") entry.inProgress += count;
		if (PERIODS.includes(_id.started)) {
			entry.periods[_id.started].started += count;
			totals[_id.started].started += count;
		}
		if (_id.status !== "active" && PERIODS.includes(_id.ended)) {
			const reached = isGoalReached(_id, exitOn) ? count : 0;
			const goalEnded = exitOn.length > 0 ? count : 0;
			for (const target of [entry.periods[_id.ended], totals[_id.ended]]) {
				target.ended += count;
				target.goalEnded += goalEnded;
				target.goalReached += reached;
			}
		}
	}

	const rows = [...byId.values()]
		.sort(
			(a, b) =>
				STATUS_ORDER.indexOf(a.automation.status) - STATUS_ORDER.indexOf(b.automation.status) ||
				b.automation.createdAt - a.automation.createdAt
		)
		.map(({ automation, inProgress, periods }) => ({
			id: String(automation._id),
			name: automation.name,
			status: automation.status,
			inProgress,
			...periods.current,
		}));

	return { totals, rows };
}
