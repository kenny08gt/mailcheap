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
