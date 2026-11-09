import { renderEmail } from "./render-email.js";
import { LANGUAGES, getLanguage, getSubscriberStrings } from "./subscriber-strings.js";

export const CONFIRM_URL_PLACEHOLDER = "{{confirm_url}}";
const CONFIRM_LINK = `href="${CONFIRM_URL_PLACEHOLDER}"`;

// The built-in email, and where a newsletter's own version starts. Kept short: one job, one button.
export function getDefaultConfirmation(newsletter) {
	const strings = getSubscriberStrings(getLanguage(newsletter)).confirmationEmail;
	const name = newsletter?.name?.trim() || strings.someNewsletter;
	return {
		subject: strings.subject(name),
		previewText: strings.previewText(name),
		markdown: `**${strings.heading}**

${strings.body(name)}

<a ${CONFIRM_LINK} style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px;">${strings.button}</a>

${strings.notYou}`,
	};
}

// Saving the settings with confirmation on stores whatever the fields held, the built-in email included.
// A stored copy of a built-in email, in either language, isn't the newsletter's own.
export function isBuiltInConfirmation({ name, confirmation }) {
	if (!confirmation?.subject) return false;
	return LANGUAGES.some(({ value }) => {
		const builtIn = getDefaultConfirmation({ name, language: value });
		return (
			confirmation.subject.trim() === builtIn.subject &&
			(confirmation.previewText ?? "").trim() === builtIn.previewText &&
			(confirmation.markdown ?? "").replaceAll("\r\n", "\n").trim() === builtIn.markdown
		);
	});
}

// Markdown links encode the braces (%7B%7B), so only an HTML link keeps the placeholder.
export function getConfirmationProblem({ subject, markdown }) {
	if (!subject?.trim()) return "Confirmation email needs a subject";
	if (!renderEmail({ markdown }).html.includes(CONFIRM_LINK)) {
		return `Confirmation email needs its button: a link like <a ${CONFIRM_LINK}>Confirm</a>`;
	}
	return null;
}

// What a new subscriber gets when their newsletter asks them to confirm. It's the only email they get,
// so a newsletter can write its own; without one, or if it lost its button, the built-in one goes out.
export function getConfirmationContent(newsletter) {
	const custom = newsletter?.confirmation;
	const isOwn = custom && !getConfirmationProblem(custom) && !isBuiltInConfirmation(newsletter);
	const { subject, previewText, markdown } = isOwn ? custom : getDefaultConfirmation(newsletter);
	return { format: "markdown", subject: subject.trim(), previewText: previewText?.trim() ?? "", markdown };
}
