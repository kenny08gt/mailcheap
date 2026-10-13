// A call-to-action button: <p data-button=""><a href="…">Label</a></p>. The editor, the cleaner, the
// archive and the AI assistant all use this exact markup.
export const BUTTON_ATTRIBUTES = ' data-button=""';

const BUTTON_OPEN_TAG = `<p${BUTTON_ATTRIBUTES}>`;
const BUTTON_LINK_PATTERN = /^\s*<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*)<\/a>\s*$/;

// Email clients ignore margins and padding on links, so the table cell is the button (Outlook) and
// the link fills it (everyone else). Same look as the confirmation email's button.
function emailButton(content, { accent, accentText }) {
	const match = BUTTON_LINK_PATTERN.exec(content);
	const label = match?.[2].replace(/<[^>]*>/g, "").trim();
	if (!match || !label || !match[1]) return content.trim() ? `<p>${content}</p>` : "";
	const linkStyle = `display:inline-block;padding:12px 22px;border-radius:8px;background:${accent};color:${accentText};font-weight:600;text-decoration:none;`;
	return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="background:${accent};border-radius:8px;"><a href="${match[1]}" style="${linkStyle}">${label}</a></td></tr></table>`;
}

// Runs on cleaned HTML, where a button is always exactly the markup above and holds no other <p>.
// The palette is getEmailPalette's (lib/email-theme.js).
export function inlineButtonStyles(html, palette) {
	const [before, ...buttons] = html.split(BUTTON_OPEN_TAG);
	return buttons.reduce((result, part) => {
		const end = part.indexOf("</p>");
		if (end === -1) return result + BUTTON_OPEN_TAG + part;
		return result + emailButton(part.slice(0, end), palette) + part.slice(end + 4);
	}, before);
}
