export const MAX_SAVED_LINKS = 20;
export const MAX_LINK_LABEL_LENGTH = 60;
const MAX_URL_LENGTH = 500;
const WEBSITE_LABEL = "Website";

export function isHttpsUrl(value) {
	const text = String(value ?? "");
	if (text.length > MAX_URL_LENGTH || /[\s"'<>]/.test(text)) return false;
	try {
		const url = new URL(text);
		return url.protocol === "https:" && url.hostname.includes(".");
	} catch {
		return false;
	}
}

// One link per line, the label first and the URL last: "Tienda https://example.com/shop".
export function parseNamedLinks(value) {
	const links = [];
	for (const line of String(value ?? "").split("\n")) {
		const text = line.trim();
		if (!text) continue;
		const split = text.lastIndexOf(" ");
		const label = split === -1 ? "" : text.slice(0, split).trim();
		const url = text.slice(split + 1);
		if (!label) return { error: `Give "${text}" a label before the link` };
		if (label.length > MAX_LINK_LABEL_LENGTH) return { error: `Keep link labels under ${MAX_LINK_LABEL_LENGTH} characters` };
		if (!isHttpsUrl(url)) return { error: `The link for "${label}" must be an https:// URL` };
		if (links.some((link) => link.label.toLowerCase() === label.toLowerCase())) {
			return { error: `Two links are labeled "${label}"` };
		}
		links.push({ label, url });
	}
	if (links.length > MAX_SAVED_LINKS) return { error: `Save up to ${MAX_SAVED_LINKS} links` };
	return { links };
}

export function formatNamedLinks(links) {
	return (links ?? []).map(({ label, url }) => `${label} ${url}`).join("\n");
}

// What the editor offers and the AI assistant may link to: the website first, then the saved links.
export function getSavedLinks(newsletter) {
	const links = newsletter?.websiteUrl ? [{ label: WEBSITE_LABEL, url: newsletter.websiteUrl }] : [];
	return [...links, ...(newsletter?.links ?? []).map(({ label, url }) => ({ label, url }))];
}
