// What subscribers read on the confirm and unsubscribe pages and in the built-in confirmation email.
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
