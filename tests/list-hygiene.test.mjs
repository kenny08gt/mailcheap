import assert from "node:assert/strict";
import { test } from "node:test";
import { isConfirmedWithoutMail, isSuspiciousRun, nextMailDomain } from "../lib/list-hygiene-rules.js";
import { checkMailDomain } from "../lib/mail-domains.js";
import Contact from "../models/Contact.js";

const HOUR_MS = 60 * 60 * 1000;

function dnsError(code) {
	return Object.assign(new Error(code), { code });
}

// A resolver whose lookups answer from answers[lookup]: records, or an error code that rejects.
function fakeDns(answers) {
	const calls = [];
	const lookup = (name) => async (domain) => {
		calls.push(`${name} ${domain}`);
		const answer = answers[name] ?? "ENODATA";
		if (typeof answer === "string") throw dnsError(answer);
		return answer;
	};
	return { calls, resolveMx: lookup("resolveMx"), resolve4: lookup("resolve4"), resolve6: lookup("resolve6") };
}

test("a domain with a mail server takes email", async () => {
	assert.equal(await checkMailDomain("example.com", fakeDns({ resolveMx: [{ exchange: "mx.example.com", priority: 10 }] })), "ok");
});

test("DNS saying no is the only way to lose a domain", async () => {
	assert.equal(await checkMailDomain("gone.example", fakeDns({ resolveMx: "ENOTFOUND" })), "none", "no such domain");
	assert.equal(await checkMailDomain("nomail.example", fakeDns({ resolveMx: [{ exchange: ".", priority: 0 }] })), "none", "MX 0 . says it takes no email");
	assert.equal(await checkMailDomain("bare.example", fakeDns({})), "none", "no MX and no address");
	assert.equal(await checkMailDomain("slow.example", fakeDns({ resolveMx: "ETIMEOUT" })), "unknown", "a timeout counts for nothing");
	assert.equal(await checkMailDomain("broken.example", fakeDns({ resolve4: "ESERVFAIL" })), "unknown");
});

test("without an MX record, mail goes to the domain's own address", async () => {
	assert.equal(await checkMailDomain("a.example", fakeDns({ resolve4: ["192.0.2.1"] })), "ok");
	assert.equal(await checkMailDomain("aaaa.example", fakeDns({ resolve6: ["2001:db8::1"] })), "ok");
});

test("big mailbox providers are never looked up", async () => {
	const dns = fakeDns({ resolveMx: "ENOTFOUND" });
	assert.equal(await checkMailDomain("gmail.com", dns), "ok");
	assert.deepEqual(dns.calls, []);
});

test("contacts only stop after two answers without mail at least 20 hours apart", () => {
	const first = new Date("2026-10-27T00:00:00Z");
	const once = nextMailDomain(null, "none", first);
	assert.equal(isConfirmedWithoutMail(once, first), false, "one answer is never enough");

	const soon = new Date(+first + 2 * HOUR_MS);
	const twiceSoon = nextMailDomain(once, "none", soon);
	assert.equal(twiceSoon.noneChecks, 2);
	assert.equal(isConfirmedWithoutMail(twiceSoon, soon), false, "two answers within hours could be one outage");

	const nextDay = new Date(+first + 21 * HOUR_MS);
	const twice = nextMailDomain(once, "none", nextDay);
	assert.equal(+twice.noneSince, +first, "the streak keeps its start");
	assert.equal(isConfirmedWithoutMail(twice, nextDay), true);
});

test("one working answer clears a domain, and an unanswered one changes nothing", () => {
	const now = new Date("2026-10-27T00:00:00Z");
	const twice = { verdict: "none", noneChecks: 2, noneSince: new Date(+now - 48 * HOUR_MS), checkedAt: now, nextCheckAt: now };
	const ok = nextMailDomain(twice, "ok", now);
	assert.equal(ok.verdict, "ok");
	assert.equal(ok.noneChecks, 0);
	assert.equal(isConfirmedWithoutMail(ok, now), false);

	const unknown = nextMailDomain(twice, "unknown", now);
	assert.equal(unknown.verdict, "none");
	assert.equal(unknown.noneChecks, 2);
	assert.ok(unknown.nextCheckAt > now, "asked again later");
	assert.equal(nextMailDomain(null, "unknown", now), null, "nothing known, nothing written");
});

test("a run with many dead domains at once is DNS trouble and changes nothing", () => {
	const run = (none, total) => [...Array(none).fill("none"), ...Array(total - none).fill("ok")];
	assert.equal(isSuspiciousRun(run(30, 100)), true);
	assert.equal(isSuspiciousRun(run(20, 100)), false);
	assert.equal(isSuspiciousRun(run(40, 49)), false, "too few answers to judge");
});

test("a stopped contact keeps why and the status to give back", () => {
	const contact = new Contact({ newsletterId: "74f1a2b3c4d5e6f7a8b9c0d2", email: "a@gone.example", status: "bounced", undeliverableReason: "no-mail-server", undeliverableFrom: "dormant" });
	assert.equal(contact.validateSync(), undefined);
	assert.equal(contact.undeliverableFrom, "dormant");
	contact.undeliverableReason = "made-up";
	assert.ok(contact.validateSync()?.errors.undeliverableReason);
});
