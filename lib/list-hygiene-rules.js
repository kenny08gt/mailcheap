const DAY_MS = 24 * 60 * 60 * 1000;

// Contacts who get emails, or may again.
export const STOPPABLE_STATUSES = ["active", "pending", "dormant"];
// One run's share, every 6 hours: whatever is left waits for the next run. The lookups stop well before the job's
// 290 seconds: a group of slow domains can take 15 more, and the scans of contacts around them take their own time.
export const HYGIENE_LIMITS = { domainsPerRun: 4_000, contactsPerRun: 500, concurrency: 40, budgetMs: 170_000 };
// Real dead domains are rare. A run where this many answers say "no mail server" is DNS trouble on the server's side:
// it keeps every record and contact as they were.
const SUSPICIOUS_NONE_SHARE = 0.2;
const SUSPICIOUS_MIN_CHECKED = 50;
const RECHECK_OK_MS = 30 * DAY_MS;
const RECHECK_NONE_MS = 7 * DAY_MS;
// A domain's contacts only stop after a second "no mail server" at least this long after the first, so a DNS outage
// or a domain being moved never costs anyone their subscription. Asked again after as long, so the next run does it
// whatever its timing.
const CONFIRM_AFTER_MS = 20 * 60 * 60 * 1000;

// What a DNS answer does to the domain's record. Unknown keeps what was known and asks again soon; null when there
// was nothing known.
export function nextMailDomain(previous, verdict, now) {
	if (verdict === "ok") return { verdict: "ok", checkedAt: now, nextCheckAt: new Date(+now + RECHECK_OK_MS), noneChecks: 0, noneSince: null };
	if (verdict === "none") {
		const isRepeat = previous?.verdict === "none";
		const noneChecks = (isRepeat ? previous.noneChecks : 0) + 1;
		const noneSince = isRepeat ? previous.noneSince : now;
		const nextCheckAt = new Date(+now + (noneChecks >= 2 ? RECHECK_NONE_MS : CONFIRM_AFTER_MS));
		return { verdict: "none", checkedAt: now, nextCheckAt, noneChecks, noneSince };
	}
	return previous ? { ...previous, nextCheckAt: new Date(+now + CONFIRM_AFTER_MS) } : null;
}

export function isConfirmedWithoutMail(record, now) {
	return record?.verdict === "none" && record.noneChecks >= 2 && now - record.noneSince >= CONFIRM_AFTER_MS;
}

export function isSuspiciousRun(verdicts) {
	if (verdicts.length < SUSPICIOUS_MIN_CHECKED) return false;
	return verdicts.filter((verdict) => verdict === "none").length / verdicts.length > SUSPICIOUS_NONE_SHARE;
}
