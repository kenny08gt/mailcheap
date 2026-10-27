export const AUTOMATIONS_TICK_ID = "automations-tick";

// The systemd timer ticks every 5 minutes, so half an hour without a run means it stopped.
const STALE_TICK_MS = 30 * 60 * 1000;

export function isTickStale(ranAt, now = Date.now()) {
	return !ranAt || now - ranAt.getTime() > STALE_TICK_MS;
}
