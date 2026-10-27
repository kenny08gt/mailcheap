import "server-only";
import { connectDb } from "@/lib/db";
import {
	HYGIENE_LIMITS,
	STOPPABLE_STATUSES,
	isConfirmedWithoutMail,
	isSuspiciousRun,
	nextMailDomain,
} from "@/lib/list-hygiene-rules";
import { checkMailDomain } from "@/lib/mail-domains";
import { mailboxProvider } from "@/lib/providers";
import Contact from "@/models/Contact";
import JobRun from "@/models/JobRun";
import MailDomain from "@/models/MailDomain";

export const LIST_HYGIENE_ID = "list-hygiene";
const REASON = "no-mail-server";
const DOMAIN_EXPRESSION = { $toLower: { $arrayElemAt: [{ $split: ["$email", "@"] }, 1] } };

// Every domain with contacts who get emails or may again, with how many. Big mailbox providers are left out.
async function listContactDomains() {
	const rows = await Contact.aggregate([
		{ $match: { status: { $in: STOPPABLE_STATUSES } } },
		{ $group: { _id: DOMAIN_EXPRESSION, contacts: { $sum: 1 } } },
	]).option({ allowDiskUse: true });
	return rows.filter(({ _id }) => _id && mailboxProvider(`x@${_id}`) === "other");
}

function findContactsOn(domains, match, limit) {
	if (domains.length === 0 || limit <= 0) return [];
	return Contact.aggregate([
		{ $match: match },
		{ $addFields: { domain: DOMAIN_EXPRESSION } },
		{ $match: { domain: { $in: domains } } },
		{ $limit: limit },
		{ $project: { _id: 1, status: 1, undeliverableFrom: 1 } },
	]);
}

// Stopped as bounced with the reason and the status to give back. Only from the status it was read with, so a run
// that overlaps another changes nothing twice.
async function stopContacts(domains, limit, at) {
	const contacts = await findContactsOn(domains, { status: { $in: STOPPABLE_STATUSES } }, limit);
	if (contacts.length === 0) return 0;
	const { modifiedCount } = await Contact.bulkWrite(
		contacts.map((contact) => ({
			updateOne: {
				filter: { _id: contact._id, status: contact.status },
				update: { $set: { status: "bounced", undeliverableReason: REASON, undeliverableAt: at, undeliverableFrom: contact.status } },
			},
		})),
		{ ordered: false }
	);
	return modifiedCount;
}

// Contacts it stopped, back to the status they had now that their domain takes email again. A real bounce has no
// undeliverableReason and never comes back.
async function restoreContacts(domains) {
	const contacts = await findContactsOn(domains, { status: "bounced", undeliverableReason: REASON }, Number.MAX_SAFE_INTEGER);
	if (contacts.length === 0) return 0;
	const { modifiedCount } = await Contact.bulkWrite(
		contacts.map((contact) => ({
			updateOne: {
				filter: { _id: contact._id, status: "bounced", undeliverableReason: REASON },
				update: {
					$set: { status: STOPPABLE_STATUSES.includes(contact.undeliverableFrom) ? contact.undeliverableFrom : "active" },
					$unset: { undeliverableReason: 1, undeliverableAt: 1, undeliverableFrom: 1 },
				},
			},
		})),
		{ ordered: false }
	);
	return modifiedCount;
}

async function checkDomains(domains, checkDomain, { concurrency, budgetMs }, started) {
	const verdicts = new Map();
	for (let index = 0; index < domains.length; index += concurrency) {
		if (Date.now() - started > budgetMs) break;
		const group = domains.slice(index, index + concurrency);
		const answers = await Promise.all(group.map((domain) => checkDomain(domain).catch(() => "unknown")));
		group.forEach((domain, position) => verdicts.set(domain, answers[position]));
	}
	return verdicts;
}

// Each run (app/api/jobs/list-hygiene, every 6 hours): each domain with contacts is asked whether it takes email, at
// most once a month, and contacts on a domain confirmed without mail stop, until a later check finds it working again.
// dryRun: looks things up and reports what would change, writing nothing. Returns counts only.
export async function runListHygiene({ dryRun = false, now = new Date(), checkDomain = checkMailDomain, limits = HYGIENE_LIMITS } = {}) {
	const started = Date.now();
	const report = { dryRun, domains: 0, checked: 0, ok: 0, none: 0, unknown: 0, stopped: 0, restored: 0, capped: false, suspicious: false };

	await connectDb();
	const contactDomains = await listContactDomains();
	const contactsByDomain = new Map(contactDomains.map(({ _id, contacts }) => [_id, contacts]));
	report.domains = contactDomains.length;

	// Busiest domains first, so the first runs over a large list cover most of its contacts.
	const names = [...contactsByDomain.keys()].sort((a, b) => contactsByDomain.get(b) - contactsByDomain.get(a));
	const records = new Map((await MailDomain.find({}).lean()).map((record) => [record.domain, record]));
	// Domains whose contacts all stopped are asked again too, so they can come back.
	const isListed = new Set(names);
	const rechecks = [...records.values()].filter(({ domain, verdict, nextCheckAt }) => verdict === "none" && nextCheckAt <= now && !isListed.has(domain));
	const due = [...names.filter((domain) => !records.get(domain) || records.get(domain).nextCheckAt <= now), ...rechecks.map(({ domain }) => domain)];
	const verdicts = await checkDomains(due.slice(0, limits.domainsPerRun), checkDomain, limits, started);
	if (isSuspiciousRun([...verdicts.values()])) {
		report.checked = verdicts.size;
		report.suspicious = true;
		if (!dryRun) await JobRun.updateOne({ _id: LIST_HYGIENE_ID }, { $set: { ranAt: now, result: report } }, { upsert: true });
		console.warn(`[list-hygiene] ${JSON.stringify(report)}: too many domains without mail at once, nothing changed`);
		return report;
	}

	const writes = [];
	const cameBack = [];
	for (const [domain, verdict] of verdicts) {
		report.checked++;
		report[verdict]++;
		const previous = records.get(domain);
		const next = nextMailDomain(previous, verdict, now);
		if (!next) continue;
		if (verdict === "ok" && previous?.verdict === "none") cameBack.push(domain);
		records.set(domain, { ...next, domain });
		writes.push({ updateOne: { filter: { domain }, update: { $set: next }, upsert: true } });
	}

	const confirmed = names.filter((domain) => isConfirmedWithoutMail(records.get(domain), now));
	if (dryRun) {
		// A first answer can't stop anyone yet: these are the contacts a second one, a day later, would stop.
		const atRisk = names.filter((domain) => records.get(domain)?.verdict === "none");
		report.stopped = Math.min(limits.contactsPerRun, atRisk.reduce((sum, domain) => sum + contactsByDomain.get(domain), 0));
	} else {
		if (writes.length > 0) await MailDomain.bulkWrite(writes, { ordered: false });
		report.stopped = await stopContacts(confirmed, limits.contactsPerRun, now);
		report.restored = await restoreContacts(cameBack);
	}
	report.capped = report.stopped >= limits.contactsPerRun || verdicts.size < due.length;
	if (!dryRun) await JobRun.updateOne({ _id: LIST_HYGIENE_ID }, { $set: { ranAt: now, result: report } }, { upsert: true });
	console.info(`[list-hygiene] ${JSON.stringify(report)}`);
	return report;
}

// A newsletter's contacts the list hygiene stopped.
export function countStoppedContacts(newsletterId) {
	return Contact.countDocuments({ newsletterId, status: "bounced", undeliverableReason: REASON });
}
