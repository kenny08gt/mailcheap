import { cleanRichHtml } from "./clean-html.js";

export const MAX_SUBJECT_LENGTH = 120;
export const MAX_PREVIEW_TEXT_LENGTH = 150;
export const MAX_BRIEF_LENGTH = 4000;
export const MAX_SELECTION_LENGTH = 20_000;
export const DEFAULT_ANALYSIS_LIMIT = 10;

// US dollars per million tokens.
export const AI_PRICING = {
	"claude-opus-5-5": { input: 4, output: 20 },
	"claude-sonnet-5-5": { input: 2, output: 10 },
	"claude-haiku-5-5": { input: 0.1, output: 0.5 },
};

export const REWRITE_PRESETS = {
	shorter: "Make it noticeably shorter while keeping every key fact and link.",
	formal: "Make it more formal and professional.",
	urgent: "Make it more urgent, so readers want to act now, without exaggerating or inventing deadlines.",
};

// What survives lib/clean-html.js and the editor: anything else is stripped before readers see it.
const ALLOWED_BLOCKS = `Write the body as an HTML fragment using only these elements:
- <h1>, <h2>, <h3> for headings (no h4-h6)
- <p> for paragraphs, <br> for a line break inside one
- <strong> and <em> for bold and italic
- <a href="https://..."> for links (http, https or mailto only)
- <ul>, <ol>, <li> for bulleted and numbered lists
- <blockquote> for quotes
- <hr> for a divider
- <img src="https://..." alt="..."> only for image URLs given in the brief; never invent an image URL
- <div data-callout=""> around one or more blocks for a highlighted gray box (an announcement, an offer, a key date)
No other elements and no attributes besides href, src, alt and data-callout: inline styles, classes, tables, scripts and <html>/<body> wrappers are removed. Don't add an unsubscribe link, postal address or footer: the template adds them.`;

const LANGUAGE = `Write all email content in Spanish (Latin American, as read in Guatemala) unless the brief explicitly asks for another language. Address readers as "tú", like the rest of the newsletter's emails and pages.`;

export function buildSystemPrompt({ newsletterName, fromName }) {
	const sender = fromName ? `${fromName}, for the newsletter "${newsletterName}"` : `the newsletter "${newsletterName}"`;
	return `You help write email newsletter campaigns sent by ${sender}. Most readers are in Guatemala.

${LANGUAGE}

${ALLOWED_BLOCKS}

Keep emails scannable: a clear first paragraph, short paragraphs, descriptive link text (never "click here"). Never make up facts, prices, dates, phone numbers or URLs that the brief doesn't give; leave a clear placeholder like [fecha] instead.`;
}

export function buildDraftPrompt(brief) {
	return `Write a complete campaign from this brief.

Return:
- subject: under ${MAX_SUBJECT_LENGTH} characters, specific, no clickbait or all caps
- previewText: under ${MAX_PREVIEW_TEXT_LENGTH} characters, complements the subject instead of repeating it
- html: the body, using only the allowed elements

Brief:
${brief}`;
}

export function buildRewritePrompt({ html, instruction, isInline }) {
	const shape = isInline
		? "The selection is part of one paragraph: return inline HTML only (text with <strong>, <em>, <a>), no block elements."
		: "Return the rewritten blocks using only the allowed elements.";
	return `Rewrite the selected part of a campaign. ${instruction}
Keep its language unless the instruction says otherwise, and keep its links. ${shape}

Selection:
${html}`;
}

export function buildAnalysisPrompt({ newsletterName, campaigns }) {
	return `Here are the last ${campaigns.length} campaigns of the newsletter "${newsletterName}", newest first, with aggregate results. Rates are percentages: opens, clicks and unsubscribes of emails reached (delivered, or sent when delivery isn't reported), bounces and complaints of emails sent. Opens are approximate (image blocking and privacy proxies). topLinks counts unique clickers per link.

${JSON.stringify(campaigns, null, 2)}

Return:
- insights: 3 to 6 short observations backed by the numbers (what works, what doesn't, trends, inbox providers that stand out)
- suggestions: 3 to 6 concrete ideas for the next campaign (topic, subject line style, length, structure, calls to action, send practices)

Write insights and suggestions in English; quote any example subject lines or copy in Spanish.`;
}

function strictObject(properties) {
	return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
}

const stringList = { type: "array", items: { type: "string" } };

export const DRAFT_SCHEMA = strictObject({
	subject: { type: "string" },
	previewText: { type: "string" },
	html: { type: "string" },
});
export const REWRITE_SCHEMA = strictObject({ html: { type: "string" } });
export const ANALYSIS_SCHEMA = strictObject({ insights: stringList, suggestions: stringList });

function cleanLine(value, maxLength) {
	return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength).trim();
}

// The editor only has h1-h3, so it would turn deeper headings into paragraphs.
export function normalizeBodyHtml(html) {
	return cleanRichHtml(html).replace(/<(\/?)h[4-6]>/g, "<$1h3>");
}

// Inline insertions keep text marks; block tags would split the paragraph they land in.
function keepInline(html) {
	return normalizeBodyHtml(html)
		.replace(/<(?!\/?(?:a|strong|b|em|i|br)\b)[^>]*>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export function normalizeDraft(data) {
	return {
		subject: cleanLine(data?.subject, MAX_SUBJECT_LENGTH),
		previewText: cleanLine(data?.previewText, MAX_PREVIEW_TEXT_LENGTH),
		html: normalizeBodyHtml(data?.html),
	};
}

export function normalizeRewrite(data, { isInline }) {
	return { html: isInline ? keepInline(data?.html) : normalizeBodyHtml(data?.html) };
}

export function normalizeAnalysis(data) {
	const list = (items) => (Array.isArray(items) ? items.map((item) => cleanLine(item, 600)).filter(Boolean) : []);
	return { insights: list(data?.insights), suggestions: list(data?.suggestions) };
}

export function getCostUsd(model, { inputTokens, outputTokens }) {
	const price = AI_PRICING[model];
	if (!price) return null;
	return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

const EMAIL_PATTERN = /[^\s@<>"'/?#&=]+@[^\s@<>"'/?#&=]+\.[a-z]{2,}/gi;

function redactEmails(value) {
	return String(value ?? "").replace(EMAIL_PATTERN, "[email]");
}

// Query strings and fragments can carry per-reader data, so links go without them.
function linkWithoutQuery(url) {
	try {
		const { origin, pathname } = new URL(url);
		return redactEmails(origin + pathname);
	} catch {
		return null;
	}
}

export function countWords(text) {
	const plain = String(text ?? "")
		.replace(/<[^>]*>/g, " ")
		.replace(/&[a-z#0-9]+;/gi, " ");
	return plain.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

function percent(part, total) {
	return total ? Math.round((part / total) * 1000) / 10 : null;
}

function mergeLinks(links) {
	const clickers = new Map();
	for (const { url, clickers: count } of links) {
		const key = linkWithoutQuery(url);
		if (key) clickers.set(key, (clickers.get(key) ?? 0) + count);
	}
	return [...clickers]
		.map(([url, count]) => ({ url, clickers: count }))
		.sort((a, b) => b.clickers - a.clickers)
		.slice(0, 10);
}

// What the provider sees: campaign content and aggregate counts, picked field by field, never a
// contact's address or anything per reader.
export function summarizeCampaigns(campaigns, { providers, links }) {
	return campaigns.map((campaign) => {
		const id = String(campaign._id);
		const stats = campaign.stats ?? {};
		const sent = stats.sent ?? 0;
		const reached = stats.delivered || sent;
		return {
			sentOn: campaign.sentAt ? new Date(campaign.sentAt).toISOString().slice(0, 10) : null,
			subject: redactEmails(campaign.subject),
			previewText: redactEmails(campaign.previewText),
			words: countWords(campaign.format === "markdown" ? campaign.markdown : campaign.html),
			sent,
			delivered: stats.delivered ?? 0,
			openRate: percent(stats.opened ?? 0, reached),
			clickRate: percent(stats.clicked ?? 0, reached),
			bounceRate: percent(stats.bounced ?? 0, sent),
			complaintRate: percent(stats.complained ?? 0, sent),
			unsubscribeRate: percent(stats.unsubscribed ?? 0, reached),
			providers: (providers.get(id) ?? []).map((row) => ({
				provider: String(row.provider),
				sent: row.sent,
				openRate: percent(row.opened, row.delivered || row.sent),
				clickRate: percent(row.clicked, row.delivered || row.sent),
				bounceRate: percent(row.bounced, row.sent),
			})),
			topLinks: mergeLinks(links.get(id) ?? []),
		};
	});
}
