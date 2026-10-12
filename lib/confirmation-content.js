import { renderEmail } from "./render-email.js";

export const CONFIRM_URL_PLACEHOLDER = "{{confirm_url}}";
const CONFIRM_LINK = `href="${CONFIRM_URL_PLACEHOLDER}"`;

// The built-in email, and where a newsletter's own version starts. Kept short: one job, one button.
function getDefaultConfirmation(newsletter) {
	const name = newsletter?.name?.trim() || "el boletín";
	return {
		subject: `Confirma tu suscripción a ${name}`,
		previewText: `Un clic y listo. Sin confirmar, no recibirás ${name}.`,
		markdown: `**Un clic y listo.**

Pediste recibir ${name}. Confirma tu correo y el próximo envío llegará a tu bandeja.

<a ${CONFIRM_LINK} style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px;">Confirmar mi suscripción</a>

¿No fuiste tú? Ignora este correo y no te escribiremos más.`,
	};
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
	const { subject, previewText, markdown } =
		custom && !getConfirmationProblem(custom) ? custom : getDefaultConfirmation(newsletter);
	return { format: "markdown", subject: subject.trim(), previewText: previewText?.trim() ?? "", markdown };
}
