import { slugify } from "./slug.js";

const MAX_CAMPAIGN_LENGTH = 60;
const MAX_DOMAINS = 20;
const HREF_PATTERN = /(<a\b[^>]*?\shref\s*=\s*)(["'])(https?:\/\/[^"'\s]+)\2/gi;
// In the text version a link often sits in parentheses, as "Label (url)".
const TEXT_URL_PATTERN = /https?:\/\/[^\s<>"'()]+/gi;
const UTM_PARAM_PATTERN = /[?&]utm_[a-z]+=/i;
const DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

function parseUrl(value) {
	try {
		return new URL(value);
	} catch {
		return null;
	}
}

function matchesDomain(hostname, domain) {
	return hostname === domain || hostname.endsWith(`.${domain}`);
}

// Readers' own links (unsubscribe) and Mailcheap's pages (archive, confirm, tracking) stay as they are,
// and so does a link someone already tagged by hand.
function shouldTag(url, { domains, ownOrigins }) {
	const parsed = parseUrl(url);
	if (!parsed || !["http:", "https:"].includes(parsed.protocol)) return false;
	if (ownOrigins.includes(parsed.origin) || /unsubscribe/i.test(parsed.pathname)) return false;
	if (UTM_PARAM_PATTERN.test(parsed.search)) return false;
	return domains.length === 0 || domains.some((domain) => matchesDomain(parsed.hostname.toLowerCase(), domain));
}

// Appended as text so the link's own query string keeps its exact encoding.
function tagUrl(url, query) {
	const hashIndex = url.indexOf("#");
	const [base, hash] = hashIndex === -1 ? [url, ""] : [url.slice(0, hashIndex), url.slice(hashIndex)];
	const separator = !base.includes("?") ? "?" : /[?&]$/.test(base) ? "" : "&";
	return `${base}${separator}${query}${hash}`;
}

function getOptions({ source, campaign, domains = [], ownUrls = [] }) {
	const query = new URLSearchParams({
		utm_source: source,
		utm_medium: "email",
		utm_campaign: slugify(campaign, MAX_CAMPAIGN_LENGTH),
	}).toString();
	const ownOrigins = ownUrls.map((url) => parseUrl(url)?.origin).filter(Boolean);
	return { query, rules: { domains, ownOrigins } };
}

// With no domains every external link is tagged; otherwise only those domains and their subdomains.
export function addUtm(html, options) {
	const { query, rules } = getOptions(options);
	return html.replace(HREF_PATTERN, (link, start, quote, href) => {
		const url = href.replace(/&amp;|&#0*38;|&#x0*26;/gi, "&");
		if (!shouldTag(url, rules)) return link;
		return `${start}${quote}${tagUrl(url, query).replaceAll("&", "&amp;")}${quote}`;
	});
}

export function addUtmToText(text, options) {
	const { query, rules } = getOptions(options);
	return text.replace(TEXT_URL_PATTERN, (url) => (shouldTag(url, rules) ? tagUrl(url, query) : url));
}

// The click report shows links as written, not as tagged.
export function stripUtm(url) {
	const parsed = parseUrl(url);
	if (!parsed || !UTM_PARAM_PATTERN.test(parsed.search)) return url;
	for (const key of [...parsed.searchParams.keys()]) {
		if (key.toLowerCase().startsWith("utm_")) parsed.searchParams.delete(key);
	}
	return parsed.toString();
}

// "example.com, https://shop.example.com/" → ["example.com", "shop.example.com"].
export function parseUtmDomains(value) {
	const domains = [];
	for (const entry of String(value ?? "").split(/[\s,]+/)) {
		const text = entry.trim().toLowerCase();
		if (!text) continue;
		const hostname = (parseUrl(/^https?:\/\//.test(text) ? text : `https://${text}`)?.hostname ?? "").replace(/^www\./, "");
		if (!DOMAIN_PATTERN.test(hostname)) return { error: `"${entry.trim()}" isn't a domain` };
		if (!domains.includes(hostname)) domains.push(hostname);
	}
	if (domains.length > MAX_DOMAINS) return { error: `Use up to ${MAX_DOMAINS} UTM domains` };
	return { domains };
}
