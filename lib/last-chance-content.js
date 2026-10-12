export const KEEP_URL_PLACEHOLDER = "{{keep_url}}";

// What a cold contact gets instead of an issue (lib/cleanup.js). One question, one button.
export function getLastChanceContent(newsletter) {
	const name = newsletter?.name?.trim() || "este boletín";
	return {
		format: "markdown",
		subject: `¿Todavía quieres recibir ${name}?`,
		previewText: "Haz clic en el botón y te lo seguimos enviando.",
		markdown: `**¿Todavía quieres recibir ${name}?**

Hace tiempo que no lo abres, así que te preguntamos antes de dejar de enviarlo.

<a href="${KEEP_URL_PLACEHOLDER}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:17px;font-weight:600;padding:14px 28px;border-radius:10px;">Sí, sigan enviándolo</a>

Si no sabemos de ti, este será el último correo de ${name} que recibas.`,
	};
}
