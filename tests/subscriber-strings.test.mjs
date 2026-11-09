import assert from "node:assert/strict";
import { test } from "node:test";
import { getConfirmationContent, getDefaultConfirmation } from "../lib/confirmation-content.js";
import { KEEP_URL_PLACEHOLDER, getLastChanceContent } from "../lib/last-chance-content.js";
import { UNSUBSCRIBE_PLACEHOLDER, renderEmail } from "../lib/render-email.js";
import { getLanguage, getSubscriberStrings, getUnsubscribeCopy } from "../lib/subscriber-strings.js";

const VIEWS = ["invalid", "confirm", "error", "done"];

function allText(value) {
	if (typeof value === "function") return value("Freezelog");
	if (typeof value === "string") return value;
	return Object.values(value).map(allText).join("\n");
}

test("a newsletter without a language, or with an unknown one, reads Spanish", () => {
	assert.equal(getLanguage({ name: "Field notes" }), "es");
	assert.equal(getLanguage(null), "es");
	assert.equal(getLanguage({ language: "fr" }), "es");
	assert.equal(getLanguage({ language: "toString" }), "es");
	assert.equal(getLanguage({ language: "en" }), "en");
	assert.equal(getSubscriberStrings(undefined), getSubscriberStrings("es"));
});

test("the confirm page speaks the newsletter's language", () => {
	const es = getSubscriberStrings("es").confirm;
	assert.equal(es.pageTitle, "Confirma tu suscripción");
	assert.equal(es.title("Field notes"), "Confirma tu suscripción a Field notes");
	assert.equal(es.body, "Un clic y el próximo envío llegará a tu bandeja.");
	assert.equal(es.button, "Confirmar mi suscripción");
	assert.equal(es.doneTitle, "¡Listo, ya estás dentro!");
	assert.equal(getSubscriberStrings("es").brokenLinkTitle, "Este enlace no funciona");

	const en = getSubscriberStrings("en").confirm;
	assert.equal(en.pageTitle, "Confirm your subscription");
	assert.equal(en.title("Freezelog"), "Confirm your subscription to Freezelog");
	assert.equal(en.body, "One tap and the next issue lands in your inbox.");
	assert.equal(en.button, "Confirm my subscription");
	assert.equal(en.doneTitle, "You're in!");
	assert.equal(getSubscriberStrings("en").brokenLinkTitle, "This link doesn't work");
	assert.equal(en.expired, "It may be more than 30 days old. Sign up again and use the newest confirmation email.");
});

test("the unsubscribe page has every view in both languages", () => {
	const es = (view) => getUnsubscribeCopy({ view, newsletterName: "Field notes", language: "es" });
	assert.equal(es("confirm").title, "¿Cancelar tu suscripción a Field notes?");
	assert.equal(es("confirm").description, "Dejarás de recibir sus correos.");
	assert.equal(es("error").description, "Sigues suscrito a Field notes. Inténtalo de nuevo en un minuto.");
	assert.equal(es("done").title, "Cancelaste tu suscripción");
	assert.equal(es("done").description, "Ya no recibirás correos de Field notes.");
	assert.equal(es("invalid").title, "Este enlace no funciona");

	const en = (view) => getUnsubscribeCopy({ view, newsletterName: "Freezelog", language: "en" });
	assert.equal(en("confirm").title, "Unsubscribe from Freezelog?");
	assert.equal(en("confirm").description, "You'll stop getting its emails.");
	assert.equal(en("error").description, "You're still subscribed to Freezelog. Try again in a minute.");
	assert.equal(en("done").title, "You're unsubscribed");
	assert.equal(en("done").description, "You won't get emails from Freezelog anymore.");
	assert.equal(en("invalid").title, "This link doesn't work");

	for (const view of VIEWS) {
		assert.deepEqual(
			getUnsubscribeCopy({ view, newsletterName: "Field notes" }),
			es(view),
			`${view}: no language reads Spanish`
		);
	}
	assert.equal(getUnsubscribeCopy({ view: "done", language: "es" }).description, "Ya no recibirás correos de este boletín.");
	assert.equal(getUnsubscribeCopy({ view: "done", language: "en" }).description, "You won't get emails from this newsletter anymore.");
});

test("the built-in confirmation email follows the newsletter's language", () => {
	const es = getDefaultConfirmation({ name: "Field notes" });
	assert.equal(es.subject, "Confirma tu suscripción a Field notes");
	assert.equal(es.previewText, "Un clic y listo. Sin confirmar, no recibirás Field notes.");
	assert.ok(es.markdown.startsWith("**Un clic y listo.**\n\nPediste recibir Field notes."));
	assert.ok(es.markdown.includes(">Confirmar mi suscripción</a>"));
	assert.deepEqual(getDefaultConfirmation({ name: "Field notes", language: "es" }), es);

	const en = getDefaultConfirmation({ name: "Freezelog", language: "en" });
	assert.equal(en.subject, "Confirm your subscription to Freezelog");
	assert.ok(en.markdown.includes('href="{{confirm_url}}"'));
	assert.ok(en.markdown.includes(">Confirm my subscription</a>"));
	assert.ok(!/[áéíóúñ¿¡]/.test(Object.values(en).join("\n")), "no Spanish left in the English email");

	assert.equal(getDefaultConfirmation({ language: "en" }).subject, "Confirm your subscription to the newsletter");
	assert.equal(getDefaultConfirmation({}).subject, "Confirma tu suscripción a el boletín");
});

test("English copy has no em dashes and no Spanish", () => {
	const english = allText(getSubscriberStrings("en"));
	assert.ok(!english.includes("—"));
	assert.ok(!/[áéíóúñ¿¡]/.test(english));
	assert.ok(!Object.values(getDefaultConfirmation({ name: "Freezelog", language: "en" })).join("").includes("—"));
});

const SOCIAL = { socialLinks: ["https://www.instagram.com/freezelog"], footerSocial: { enabled: true } };

function footerOf(newsletter) {
	const { html, text } = renderEmail({ markdown: "Hi", subject: "Hi", newsletter });
	return { html: html.slice(html.lastIndexOf("border-top")), text: text.slice(text.lastIndexOf("—")) };
}

test("the email footer speaks the newsletter's language", () => {
	const en = footerOf({ name: "Freezelog", language: "en", ...SOCIAL });
	assert.ok(en.html.includes("You&#39;re getting this email because you subscribed to Freezelog."));
	assert.ok(en.html.includes(">Unsubscribe</a>"));
	assert.ok(en.html.includes(">Follow us</div>"));
	assert.ok(en.text.includes("You're getting this email because you subscribed to Freezelog."));
	assert.ok(en.text.includes(`Unsubscribe: ${UNSUBSCRIBE_PLACEHOLDER}`));
	assert.ok(en.text.includes("Follow us: Instagram https://www.instagram.com/freezelog"));
	assert.ok(!/[áéíóúñ¿¡]|Recibes|Síguenos/.test(en.html + en.text), "nothing Spanish left in the footer");

	for (const newsletter of [{ name: "Field notes", ...SOCIAL }, { name: "Field notes", language: "es", ...SOCIAL }]) {
		const es = footerOf(newsletter);
		assert.ok(es.html.includes("Recibes este correo porque te suscribiste a Field notes."));
		assert.ok(es.html.includes(">Cancelar suscripción</a>"));
		assert.ok(es.html.includes(">Síguenos</div>"));
		assert.ok(es.text.includes(`Cancelar suscripción: ${UNSUBSCRIBE_PLACEHOLDER}`));
	}

	const ownLine = footerOf({ name: "Freezelog", language: "en", ...SOCIAL, footerSocial: { enabled: true, text: "Find us" } });
	assert.ok(ownLine.html.includes(">Find us</div>"), "a newsletter's own line wins over the default");
	assert.ok(footerOf({ language: "en" }).text.includes("because you subscribed to this newsletter."));
});

test("the last-chance email follows the newsletter's language", () => {
	const es = getLastChanceContent({ name: "Field notes" });
	assert.equal(es.subject, "¿Todavía quieres recibir Field notes?");
	assert.ok(es.markdown.includes(">Sí, sigan enviándolo</a>"));

	const en = getLastChanceContent({ name: "Freezelog", language: "en" });
	assert.equal(en.subject, "Do you still want Freezelog?");
	assert.equal(en.previewText, "Click the button and we'll keep sending it.");
	assert.ok(en.markdown.includes(`href="${KEEP_URL_PLACEHOLDER}"`));
	assert.ok(en.markdown.includes(">Yes, keep sending it</a>"));
	assert.ok(en.markdown.endsWith("If we don't hear from you, this is the last email from Freezelog you'll get."));
	assert.ok(!/[áéíóúñ¿¡]/.test(Object.values(en).join("\n")));
});

test("the keep page speaks the newsletter's language", () => {
	const es = getSubscriberStrings(undefined).keep;
	assert.equal(es.pageTitle, "Seguir recibiendo el boletín");
	assert.equal(es.title("Field notes"), "¿Seguir recibiendo Field notes?");
	assert.equal(es.button, "Sí, sigan enviándolo");

	const en = getSubscriberStrings("en").keep;
	assert.equal(en.pageTitle, "Keep getting the newsletter");
	assert.equal(en.title("Freezelog"), "Keep getting Freezelog?");
	assert.equal(en.doneTitle("Freezelog"), "You'll keep getting Freezelog");
	assert.equal(en.button, "Yes, keep sending it");
});

test("a saved copy of the built-in email follows a later language change", () => {
	// What the settings form stores when confirmation is on and the email was left as it was.
	const saved = getDefaultConfirmation({ name: "Freezelog", language: "es" });
	const posted = { ...saved, markdown: saved.markdown.replaceAll("\n", "\r\n") };

	assert.equal(getConfirmationContent({ name: "Freezelog", confirmation: posted }).subject, saved.subject);
	const english = getConfirmationContent({ name: "Freezelog", language: "en", confirmation: posted });
	assert.equal(english.subject, "Confirm your subscription to Freezelog");

	const edited = { ...posted, subject: "Una última cosa antes de Freezelog" };
	assert.equal(
		getConfirmationContent({ name: "Freezelog", language: "en", confirmation: edited }).subject,
		"Una última cosa antes de Freezelog",
		"an edited email is the newsletter's own and stays as written"
	);
});
