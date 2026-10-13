import { escapeHtml } from "./render-email.js";

// Filled in later by buildRecipientEmail, or meaningful only in other emails.
export const RESERVED_VARIABLES = ["unsubscribe_url", "subject", "preview_text", "confirm_url", "keep_url"];

const VARIABLE = /\{\{\s*([a-z][a-z0-9_]{0,39})\s*(?:\|([^}]*))?\}\}/g;

function isReserved(key) {
	return RESERVED_VARIABLES.includes(key);
}

function readValue(values, key) {
	const value = values?.[key];
	return value === undefined || value === null || value === "" ? null : String(value);
}

function isHttpsUrl(value) {
	try {
		return new URL(value).protocol === "https:";
	} catch {
		return false;
	}
}

export function fillText(text, values) {
	return String(text ?? "").replace(VARIABLE, (match, key, fallback) =>
		isReserved(key) ? match : (readValue(values, key) ?? fallback ?? "")
	);
}

// One pass, so a substituted value is never scanned again for placeholders. An href only takes an
// https URL: a bad value can't become a javascript: link and an empty one doesn't leave a dead link.
const HTML_VARIABLE = /\s+href="\{\{\s*([a-z][a-z0-9_]{0,39})\s*(?:\|([^}"]*))?\}\}"|\{\{\s*([a-z][a-z0-9_]{0,39})\s*(?:\|([^}]*))?\}\}/g;

export function fillHtml(html, values) {
	return String(html ?? "").replace(HTML_VARIABLE, (match, hrefKey, hrefFallback, key, fallback) => {
		if (isReserved(hrefKey ?? key)) return match;
		if (hrefKey) {
			const url = [readValue(values, hrefKey), hrefFallback?.trim()].find((candidate) => candidate && isHttpsUrl(candidate));
			return url ? ` href="${escapeHtml(url)}"` : "";
		}
		const value = readValue(values, key);
		return value === null ? (fallback ?? "") : escapeHtml(value);
	});
}

export function listVariables(texts) {
	const keys = new Set();
	for (const text of texts) {
		for (const [, key] of String(text ?? "").matchAll(VARIABLE)) if (!isReserved(key)) keys.add(key);
	}
	return [...keys];
}

export function buildAutomationContent({ automation, step, properties, email }) {
	const values = { ...properties, email };
	return {
		_id: automation._id,
		kind: "automation",
		format: "rich",
		subject: fillText(step.subject, values).trim(),
		previewText: fillText(step.previewText, values).trim(),
		html: fillHtml(step.html, values),
	};
}
