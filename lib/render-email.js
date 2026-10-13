import { inlineButtonStyles } from "./buttons.js";
import { inlineCalloutStyles } from "./callouts.js";
import { beforeLastTagEnd, cleanRichHtml, replaceElements } from "./clean-html.js";
import { getEmailPalette } from "./email-theme.js";
import { markdownToHtml } from "./markdown.js";

export const UNSUBSCRIBE_PLACEHOLDER = "{{unsubscribe_url}}";
// Generated HTML prints these instead of its own copy, so editing the campaign changes the email too.
export const SUBJECT_PLACEHOLDER = "{{subject}}";
export const PREVIEW_TEXT_PLACEHOLDER = "{{preview_text}}";
// Parts only the email needs, like a headline the archive page already shows. One can't contain an
// element with its own tag name.
const EMAIL_ONLY_ELEMENT = {
	start: /<([a-z][a-z0-9]*)\b[^>]*>/gi,
	end: /<\/([a-z][a-z0-9]*)>/gi,
	accepts: ([tag]) => /\sdata-email-only\b/i.test(tag),
};
const HIDDEN_ELEMENT = { start: /<(style|script|head)/gi, end: /<\/(style|script|head)>/gi };
const PREHEADER_ELEMENT = { start: /<(div)\b[^>]*>/gi, end: /<\/(div)>/gi, accepts: ([tag]) => /\bdata-preheader\b/i.test(tag) };
const LINK_HREF_PATTERN = /^<a\s[^>]*href="([^"]+)"/i;
const LINK_ELEMENT = { start: /<(a)\s[^>]*>/gi, end: /<\/(a)>/gi, accepts: ([tag]) => LINK_HREF_PATTERN.test(tag), replace: linkText };
const FONT_STACK = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// "pandy tickets." already ends the footer sentence.
function withoutFinalPeriod(name) {
	return String(name ?? "").trim().replace(/\.+$/, "");
}

export function escapeHtml(value) {
	return String(value ?? "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function stripTags(html) {
	return beforeLastTagEnd(html, (part) => part.replace(/<[^>]+>/g, ""));
}

function linkText([tag], label) {
	const href = LINK_HREF_PATTERN.exec(tag)[1];
	const text = stripTags(label).trim();
	return !text || text === href ? href : `${text} (${href})`;
}

export function htmlToText(html) {
	const visible = beforeLastTagEnd(replaceElements(String(html ?? ""), HIDDEN_ELEMENT), (part) =>
		replaceElements(replaceElements(part, PREHEADER_ELEMENT), LINK_ELEMENT)
	);
	const blocks = visible
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/(p|div|h[1-6]|li|tr|table|blockquote)>/gi, "\n\n");
	return stripTags(beforeLastTagEnd(blocks, (part) => part.replace(/<li[^>]*>/gi, "• ")))
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		// Starting only at the first space of a run, so a long run not ending a line is read once.
		.replace(/(?<![ \t])[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

// The editor saves "<p></p>" for an empty document, so content means words or a picture.
export function hasContent(body) {
	return /<img\b/i.test(body ?? "") || htmlToText(body).length > 0;
}

// Some clients drop <style>, so editor content carries its layout inline. Images are centered like
// on the archive, and the paragraph the editor puts inside each list item loses its margin.
function richEmailBody(html, palette) {
	return inlineButtonStyles(inlineCalloutStyles(cleanRichHtml(html), palette), palette)
		.replaceAll("<li><p>", '<li><p style="margin:0;">')
		.replace(
			/<img\b/gi,
			'<img style="display:block;max-width:100%;height:auto;margin:24px auto;border-radius:8px;"'
		);
}

function footerHtml({ newsletter, unsubscribeUrl, palette, padding = "32px 0 0" }) {
	const address = newsletter?.postalAddress
		? `<br>${escapeHtml(newsletter.postalAddress)}`
		: "";
	return `<tr><td style="padding:${padding};font-size:12px;line-height:1.6;color:${palette.muted};border-top:1px solid ${palette.line};">
Recibes este correo porque te suscribiste a ${escapeHtml(withoutFinalPeriod(newsletter?.name) || "este boletín")}.<br>
<a href="${unsubscribeUrl}" style="color:${palette.muted};text-decoration:underline;">Cancelar suscripción</a>${address}
</td></tr>`;
}

function footerText({ newsletter, unsubscribeUrl }) {
	return [
		"—",
		`Recibes este correo porque te suscribiste a ${withoutFinalPeriod(newsletter?.name) || "este boletín"}.`,
		`Cancelar suscripción: ${unsubscribeUrl}`,
		newsletter?.postalAddress,
	]
		.filter(Boolean)
		.join("\n");
}

function preheaderHtml(previewText) {
	if (!previewText) return "";
	// Padding characters stop clients from pulling body text into the inbox preview.
	return `<div style="display:none;max-height:0;overflow:hidden;opacity:0;" data-preheader>${escapeHtml(previewText)}${"&#847;&zwnj;&nbsp;".repeat(40)}</div>`;
}

function linkToWebsite(newsletter, content, style) {
	if (!newsletter.websiteUrl) return content;
	return `<a href="${escapeHtml(newsletter.websiteUrl)}" style="${style}">${content}</a>`;
}

// The newsletter's banner, as wide as the column and linked to its website when it has one.
function bannerHtml(newsletter, padding) {
	const image = `<img src="${escapeHtml(newsletter.headerImageUrl)}" alt="${escapeHtml(newsletter.name)}" width="600" style="display:block;width:100%;max-width:100%;height:auto;border:0;border-radius:8px;">`;
	const linked = linkToWebsite(newsletter, image, "display:block;text-decoration:none;");
	return `<tr><td style="padding:${padding};">${linked}</td></tr>\n`;
}

function headerBandHtml(newsletter, { headerText }) {
	const image = `<img src="${escapeHtml(newsletter.imageUrl)}" alt="" width="32" height="32" style="display:block;width:32px;height:32px;border:0;border-radius:8px;">`;
	const logo = newsletter.imageUrl
		? `<td style="padding:0 12px 0 0;vertical-align:middle;">${linkToWebsite(newsletter, image, "display:block;text-decoration:none;")}</td>`
		: "";
	const name = linkToWebsite(newsletter, escapeHtml(newsletter.name), `color:${headerText};text-decoration:none;`);
	return `<table role="presentation" cellpadding="0" cellspacing="0"><tr>${logo}<td style="vertical-align:middle;font-size:20px;line-height:1.2;font-weight:800;letter-spacing:-0.02em;color:${headerText};">${name}</td></tr></table>`;
}

// Without a banner, a header color makes a band with the logo and the name.
function headerHtml(newsletter, palette) {
	if (newsletter?.headerImageUrl) return bannerHtml(newsletter, palette.card ? "32px 32px 0" : "0 0 24px");
	if (!newsletter?.name || !palette.header) return "";
	const band = headerBandHtml(newsletter, palette);
	if (palette.card) {
		return `<tr><td style="padding:16px 24px;background:${palette.header};border-radius:11px 11px 0 0;">${band}</td></tr>\n`;
	}
	return `<tr><td style="padding:0 0 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 24px;background:${palette.header};border-radius:12px;">${band}</td></tr></table></td></tr>\n`;
}

function readOnlineLink(webUrl, palette) {
	return `<a href="${escapeHtml(webUrl)}" style="color:${palette.faint};text-decoration:none;">Read online</a>`;
}

function fillFields(html, { subject, previewText }) {
	return html
		.replaceAll(SUBJECT_PLACEHOLDER, escapeHtml(subject))
		.replaceAll(PREVIEW_TEXT_PLACEHOLDER, escapeHtml(previewText));
}

// With a card color, the header, body and footer sit in a bordered card, with Read online above it.
function columnHtml({ bodyHtml, footer, webUrl, header, palette }) {
	const readOnline = webUrl
		? `<tr><td align="right" style="padding:0 0 24px;font-size:12px;line-height:1;">${readOnlineLink(webUrl, palette)}</td></tr>\n`
		: "";
	const open = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;font-family:${FONT_STACK};font-size:16px;line-height:1.65;color:${palette.text};">`;
	if (!palette.card) {
		return `${open}
${readOnline}${header}<tr><td class="body">${bodyHtml}</td></tr>
${footer}
</table>`;
	}
	return `${open}
${readOnline}<tr><td style="background:${palette.card};border:1px solid ${palette.line};border-radius:12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${header}<tr><td class="body" style="padding:24px 32px 16px;">${bodyHtml}</td></tr>
${footer}
</table>
</td></tr>
</table>`;
}

function wrapMarkdownBody({ subject, previewText, palette, ...column }) {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(subject)}</title>
<style>
.body a { color: ${palette.link}; }
.body img { max-width: 100%; height: auto; border-radius: 8px; }
.body h1, .body h2, .body h3 { line-height: 1.3; margin: 32px 0 12px; color: ${palette.heading}; }
.body p, .body ul, .body ol { margin: 0 0 16px; }
.body blockquote { margin: 0 0 16px; padding-left: 16px; border-left: 3px solid ${palette.line}; color: ${palette.quote}; }
.body code { font-family: ui-monospace, Menlo, monospace; font-size: 14px; background: ${palette.surface}; padding: 2px 4px; border-radius: 4px; }
.body hr { border: 0; border-top: 1px solid ${palette.line}; margin: 32px 0; }
</style>
</head>
<body style="margin:0;padding:0;background:${palette.background};">
${preheaderHtml(previewText)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${palette.background};">
<tr><td align="center" style="padding:32px 20px;">
${columnHtml({ ...column, palette })}
</td></tr>
</table>
</body>
</html>`;
}

// Generated HTML (an issue built by another app) keeps its own design and gets the footer appended.
function withFooter({ html, newsletter, unsubscribeUrl, previewText, webUrl, palette }) {
	const footer = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:0 20px 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;font-family:${FONT_STACK};">${footerHtml({ newsletter, unsubscribeUrl, palette })}</table></td></tr></table>`;
	// Its column width is unknown, so the link sits centered above it.
	const readOnline = webUrl
		? `<div style="padding:12px 16px 0;text-align:center;font-family:${FONT_STACK};font-size:12px;line-height:1.4;">${readOnlineLink(webUrl, palette)}</div>`
		: "";
	const top = `${preheaderHtml(previewText)}${readOnline}`;
	// Only a <body before the last ">" can match; when one does, so does the first, where the replace stops.
	const hasBody = /<body[^>]*>/i.test(html.slice(0, html.lastIndexOf(">") + 1));
	const withTop = hasBody ? html.replace(/<body[^>]*>/i, (match) => `${match}${top}`) : `${top}${html}`;
	if (withTop.includes(UNSUBSCRIBE_PLACEHOLDER)) return withTop;
	return /<\/body>/i.test(withTop) ? withTop.replace(/<\/body>/i, `${footer}</body>`) : `${withTop}${footer}`;
}

// HTML issues built elsewhere may rely on their own site's CSS to keep images inside the column.
export function withResponsiveImages(html) {
	const style = "<style>img{max-width:100%;height:auto}</style>";
	return beforeLastTagEnd(html, (part) => part.replace(/<head([^>]*)>/i, (head) => `${head}${style}`));
}

export function renderEmail({
	format = "markdown",
	markdown: source = "",
	html = "",
	subject = "",
	previewText = "",
	newsletter,
	unsubscribeUrl = UNSUBSCRIBE_PLACEHOLDER,
	// The issue's archive page, linked at the top of the email.
	webUrl = null,
	// Public archive pages: same design, no subscriber footer.
	isWebVersion = false,
}) {
	const readOnlineUrl = isWebVersion ? null : webUrl;
	const palette = getEmailPalette(newsletter?.theme);
	if (format === "html") {
		const filled = fillFields(html, { subject, previewText });
		const rendered = isWebVersion
			? beforeLastTagEnd(filled, (part) => replaceElements(part, EMAIL_ONLY_ELEMENT))
			: withFooter({ html: filled, newsletter, unsubscribeUrl, previewText, webUrl: readOnlineUrl, palette });
		const text = htmlToText(rendered.replaceAll(UNSUBSCRIBE_PLACEHOLDER, unsubscribeUrl));
		return { html: rendered, text, bytes: byteLength(rendered) };
	}

	const bodyHtml =
		format === "rich" ? richEmailBody(html, palette) : inlineCalloutStyles(markdownToHtml(source), palette);
	const footerPadding = palette.card ? "24px 32px 32px" : undefined;
	const footer = isWebVersion ? "" : footerHtml({ newsletter, unsubscribeUrl, palette, padding: footerPadding });
	const header = isWebVersion ? "" : headerHtml(newsletter, palette);
	const rendered = wrapMarkdownBody({ bodyHtml, subject, previewText, footer, webUrl: readOnlineUrl, header, palette });
	const readOnlineText = readOnlineUrl ? `Read online: ${readOnlineUrl}\n\n` : "";
	const text = isWebVersion
		? htmlToText(bodyHtml)
		: `${readOnlineText}${htmlToText(bodyHtml)}\n\n${footerText({ newsletter, unsubscribeUrl })}`;
	return { html: rendered, text, bytes: byteLength(rendered) };
}

function byteLength(value) {
	return new TextEncoder().encode(value).length;
}
