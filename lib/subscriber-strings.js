// What subscribers read: the email footer, the confirm, unsubscribe and keep pages, and the built-in
// confirmation and last-chance emails.
// A newsletter saved before it had a language has none, and stays Spanish.
export const LANGUAGES = [
	{ value: "es", label: "Spanish" },
	{ value: "en", label: "English" },
];

const STRINGS = {
	es: {
		someNewsletter: "este boletín",
		brokenLinkTitle: "Este enlace no funciona",
		confirm: {
			pageTitle: "Confirma tu suscripción",
			title: (name) => `Confirma tu suscripción a ${name}`,
			body: "Un clic y el próximo envío llegará a tu bandeja.",
			button: "Confirmar mi suscripción",
			pending: "Confirmando…",
			expired: "Puede que tenga más de 30 días. Suscríbete de nuevo y usa el correo de confirmación más reciente.",
			doneTitle: "¡Listo, ya estás dentro!",
			doneFrom: (name) => `El próximo envío de ${name} llegará de `,
			donePromotions: ". Si llega a Promociones, arrástralo a Principal.",
			archive: "Ver envíos anteriores",
		},
		unsubscribe: {
			pageTitle: "Cancelar suscripción",
			button: "Cancelar suscripción",
			invalid:
				"Abre de nuevo el enlace para cancelar la suscripción desde el correo, o responde al correo para pedir que te quitemos de la lista.",
			confirmTitle: (name) => `¿Cancelar tu suscripción a ${name}?`,
			confirm: "Dejarás de recibir sus correos.",
			errorTitle: "Algo salió mal",
			error: (name) => `Sigues suscrito a ${name}. Inténtalo de nuevo en un minuto.`,
			doneTitle: "Cancelaste tu suscripción",
			done: (name) => `Ya no recibirás correos de ${name}.`,
		},
		confirmationEmail: {
			someNewsletter: "el boletín",
			subject: (name) => `Confirma tu suscripción a ${name}`,
			previewText: (name) => `Un clic y listo. Sin confirmar, no recibirás ${name}.`,
			heading: "Un clic y listo.",
			body: (name) => `Pediste recibir ${name}. Confirma tu correo y el próximo envío llegará a tu bandeja.`,
			button: "Confirmar mi suscripción",
			notYou: "¿No fuiste tú? Ignora este correo y no te escribiremos más.",
		},
		footer: {
			reason: (name) => `Recibes este correo porque te suscribiste a ${name}.`,
			unsubscribe: "Cancelar suscripción",
			follow: "Síguenos",
		},
		keep: {
			pageTitle: "Seguir recibiendo el boletín",
			expired: "Puede que tenga más de 90 días. Suscríbete de nuevo para seguir recibiendo el boletín.",
			title: (name) => `¿Seguir recibiendo ${name}?`,
			body: "Un clic y te lo seguimos enviando.",
			busy: "Demasiados clics desde tu red. Inténtalo de nuevo en unos minutos.",
			button: "Sí, sigan enviándolo",
			pending: "Guardando…",
			doneTitle: (name) => `Seguirás recibiendo ${name}`,
			done: "Gracias por avisarnos. El próximo envío llegará a tu bandeja.",
			archive: "Ver envíos anteriores",
			invalid: (name) => `Puede que tenga más de 90 días, o cancelaste tu suscripción. Suscríbete de nuevo para recibir ${name}.`,
			resubscribe: "Suscribirme de nuevo",
		},
		lastChanceEmail: {
			question: (name) => `¿Todavía quieres recibir ${name}?`,
			previewText: "Haz clic en el botón y te lo seguimos enviando.",
			body: "Hace tiempo que no lo abres, así que te preguntamos antes de dejar de enviarlo.",
			button: "Sí, sigan enviándolo",
			last: (name) => `Si no sabemos de ti, este será el último correo de ${name} que recibas.`,
		},
	},
	en: {
		someNewsletter: "this newsletter",
		brokenLinkTitle: "This link doesn't work",
		confirm: {
			pageTitle: "Confirm your subscription",
			title: (name) => `Confirm your subscription to ${name}`,
			body: "One tap and the next issue lands in your inbox.",
			button: "Confirm my subscription",
			pending: "Confirming…",
			expired: "It may be more than 30 days old. Sign up again and use the newest confirmation email.",
			doneTitle: "You're in!",
			doneFrom: (name) => `The next issue of ${name} comes from `,
			donePromotions: ". If it lands in Promotions, drag it to Primary.",
			archive: "Read past issues",
		},
		unsubscribe: {
			pageTitle: "Unsubscribe",
			button: "Unsubscribe",
			invalid: "Open the unsubscribe link in the email again, or reply to the email and ask us to take you off the list.",
			confirmTitle: (name) => `Unsubscribe from ${name}?`,
			confirm: "You'll stop getting its emails.",
			errorTitle: "Something went wrong",
			error: (name) => `You're still subscribed to ${name}. Try again in a minute.`,
			doneTitle: "You're unsubscribed",
			done: (name) => `You won't get emails from ${name} anymore.`,
		},
		confirmationEmail: {
			someNewsletter: "the newsletter",
			subject: (name) => `Confirm your subscription to ${name}`,
			previewText: (name) => `One tap and you're set. Until you confirm, you won't get ${name}.`,
			heading: "One tap and you're set.",
			body: (name) => `You asked to get ${name}. Confirm your email and the next issue lands in your inbox.`,
			button: "Confirm my subscription",
			notYou: "Wasn't you? Ignore this email and we won't write again.",
		},
		footer: {
			reason: (name) => `You're getting this email because you subscribed to ${name}.`,
			unsubscribe: "Unsubscribe",
			follow: "Follow us",
		},
		keep: {
			pageTitle: "Keep getting the newsletter",
			expired: "It may be more than 90 days old. Sign up again to keep getting the newsletter.",
			title: (name) => `Keep getting ${name}?`,
			body: "One tap and we'll keep sending it.",
			busy: "Too many clicks from your network. Try again in a few minutes.",
			button: "Yes, keep sending it",
			pending: "Saving…",
			doneTitle: (name) => `You'll keep getting ${name}`,
			done: "Thanks for letting us know. The next issue lands in your inbox.",
			archive: "Read past issues",
			invalid: (name) => `It may be more than 90 days old, or you unsubscribed. Sign up again to get ${name}.`,
			resubscribe: "Sign up again",
		},
		lastChanceEmail: {
			question: (name) => `Do you still want ${name}?`,
			previewText: "Click the button and we'll keep sending it.",
			body: "You haven't opened it in a while, so we're asking before we stop sending it.",
			button: "Yes, keep sending it",
			last: (name) => `If we don't hear from you, this is the last email from ${name} you'll get.`,
		},
	},
};

export function getLanguage(newsletter) {
	return Object.hasOwn(STRINGS, newsletter?.language ?? "") ? newsletter.language : "es";
}

export function getSubscriberStrings(language) {
	return STRINGS[getLanguage({ language })];
}

// The unsubscribe page's title and line for each of its views: invalid, confirm, error, done.
export function getUnsubscribeCopy({ view, newsletterName, language }) {
	const strings = getSubscriberStrings(language);
	const name = newsletterName || strings.someNewsletter;
	const copy = strings.unsubscribe;
	return {
		invalid: { title: strings.brokenLinkTitle, description: copy.invalid },
		confirm: { title: copy.confirmTitle(name), description: copy.confirm },
		error: { title: copy.errorTitle, description: copy.error(name) },
		done: { title: copy.doneTitle, description: copy.done(name) },
	}[view];
}
