import { getLanguage, getSubscriberStrings } from "./subscriber-strings.js";

export const KEEP_URL_PLACEHOLDER = "{{keep_url}}";

// What a cold contact gets instead of an issue (lib/cleanup.js). One question, one button.
export function getLastChanceContent(newsletter) {
	const strings = getSubscriberStrings(getLanguage(newsletter));
	const copy = strings.lastChanceEmail;
	const name = newsletter?.name?.trim() || strings.someNewsletter;
	return {
		format: "markdown",
		subject: copy.question(name),
		previewText: copy.previewText,
		markdown: `**${copy.question(name)}**

${copy.body}

<a href="${KEEP_URL_PLACEHOLDER}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:17px;font-weight:600;padding:14px 28px;border-radius:10px;">${copy.button}</a>

${copy.last(name)}`,
	};
}
