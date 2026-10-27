import { Resolver } from "node:dns/promises";
import { mailboxProvider } from "./providers.js";

let resolver;

function getResolver() {
	resolver ??= new Resolver({ timeout: 2500, tries: 2 });
	return resolver;
}

// No MX record: mail goes to the domain's own address (RFC 5321), so the domain needs one.
async function checkAddress(domain, dns) {
	for (const lookup of ["resolve4", "resolve6"]) {
		try {
			if ((await dns[lookup](domain)).length > 0) return "ok";
		} catch (error) {
			if (error.code === "ENOTFOUND") return "none";
			if (error.code !== "ENODATA") return "unknown";
		}
	}
	return "none";
}

// ok: the domain takes email. none: DNS says it can't: no such domain, "MX 0 ." (RFC 7505), or no MX and no address.
// unknown: DNS didn't answer (a timeout, a broken name server), which never counts against an address. Big mailbox
// providers are known to take email and aren't looked up.
export async function checkMailDomain(domain, dns = getResolver()) {
	if (mailboxProvider(`x@${domain}`) !== "other") return "ok";
	try {
		const records = await dns.resolveMx(domain);
		return records.some(({ exchange }) => exchange && exchange !== ".") ? "ok" : "none";
	} catch (error) {
		if (error.code === "ENOTFOUND") return "none";
		if (error.code !== "ENODATA") return "unknown";
	}
	return checkAddress(domain, dns);
}

export const NO_MAIL_MESSAGE = "This email's domain can't receive email";
const CACHE_MS = 24 * 60 * 60 * 1000;
// A lookup DNS couldn't answer is tried again soon rather than trusted for a day.
const UNKNOWN_CACHE_MS = 10 * 60 * 1000;
const MAX_CACHED = 50_000;
// Domain -> { verdict, at }, shared by the signups of one server.
const cache = new Map();

// Signups: false only when DNS says the address's domain can't receive email. A lookup that fails lets it in.
export async function canReceiveMail(email, { dns, now = Date.now() } = {}) {
	const domain = String(email).split("@")[1]?.toLowerCase();
	if (!domain) return false;
	const cached = cache.get(domain);
	if (cached && now - cached.at < (cached.verdict === "unknown" ? UNKNOWN_CACHE_MS : CACHE_MS)) return cached.verdict !== "none";
	const verdict = await checkMailDomain(domain, dns).catch(() => "unknown");
	if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value);
	cache.set(domain, { verdict, at: now });
	return verdict !== "none";
}
