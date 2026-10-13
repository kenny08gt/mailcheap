import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderEmail } from "../lib/render-email.js";
import { getFooterSocialLinks, getSocialIconUrl, parseIconColor } from "../lib/social.js";
import { addUtm, addUtmToText } from "../lib/utm.js";

const APP_URL = "https://mail.pandy.cloud";
const PANDY = {
	background: "#f7f5ef",
	card: "#ffffff",
	text: "#16141d",
	muted: "#605b66",
	line: "#d8d2cc",
	link: "#c81e6a",
	accent: "#d9fc79",
	accentText: "#16141d",
	headerBackground: "#16141d",
};
const newsletter = {
	name: "Pandy Tickets",
	socialLinks: [
		"https://www.instagram.com/pandytickets",
		"https://pandy.cloud/blog",
		"https://www.tiktok.com/@pandytickets",
	],
	footerSocial: { enabled: true, text: "Síguenos" },
};

// Rendered by the code before this feature existed (tests/fixtures/footer-social-off.json).
test("emails without the setting, or without a known social link, render byte for byte as before", () => {
	const cases = JSON.parse(readFileSync(new URL("./fixtures/footer-social-off.json", import.meta.url), "utf8"));
	assert.equal(cases.length, 12);
	for (const { name, input, html, text } of cases) {
		const rendered = renderEmail({ ...input, appUrl: APP_URL });
		assert.equal(rendered.html, html, name);
		assert.equal(rendered.text, text, name);
	}
});

test("the footer shows the line and a linked icon per known network, above the subscription note", () => {
	const { html } = renderEmail({ markdown: "Hola", newsletter, appUrl: APP_URL });
	const footer = html.slice(html.indexOf("border-top:1px solid"));
	assert.ok(footer.indexOf("Síguenos") < footer.indexOf("Recibes este correo"));
	assert.ok(
		footer.includes(
			'<a href="https://www.instagram.com/pandytickets" style="display:inline-block;text-decoration:none;"><img src="https://mail.pandy.cloud/i/social/instagram?c=71717a" alt="Instagram" width="24" height="24" style="display:inline-block;width:24px;height:24px;border:0;"></a>'
		)
	);
	assert.ok(footer.includes('<td style="padding:0 0 0 12px;"><a href="https://www.tiktok.com/@pandytickets"'));
	assert.ok(footer.includes('src="https://mail.pandy.cloud/i/social/tiktok?c=71717a" alt="TikTok"'));
	assert.ok(!footer.includes("pandy.cloud/blog"));
	assert.equal(footer.match(/<img /g).length, 2);
});

test("icons and the line take the theme's muted and text colors", () => {
	const { html } = renderEmail({ format: "rich", html: "<p>Hola</p>", newsletter: { ...newsletter, theme: PANDY }, appUrl: APP_URL });
	assert.ok(html.includes("/i/social/instagram?c=605b66"));
	assert.ok(html.includes('font-weight:600;color:#16141d;">Síguenos</div>'));
	assert.ok(!html.includes("c=71717a"));
});

test("an empty line falls back to Síguenos, and the line is escaped", () => {
	const blank = renderEmail({ markdown: "Hola", newsletter: { ...newsletter, footerSocial: { enabled: true, text: " " } } });
	assert.ok(blank.html.includes(">Síguenos</div>"));
	const custom = renderEmail({ markdown: "Hola", newsletter: { ...newsletter, footerSocial: { enabled: true, text: "Follow <us>" } } });
	assert.ok(custom.html.includes(">Follow &lt;us&gt;</div>"));
	assert.ok(custom.text.includes("Follow <us>: Instagram"));
});

test("previews without an app URL load the icons from the same origin", () => {
	const { html } = renderEmail({ markdown: "Hola", newsletter });
	assert.ok(html.includes('src="/i/social/instagram?c=71717a"'));
});

test("the text part lists the networks before the subscription note", () => {
	const { text } = renderEmail({ markdown: "Hola", newsletter, appUrl: APP_URL });
	assert.ok(
		text.endsWith(
			"—\nSíguenos: Instagram https://www.instagram.com/pandytickets · TikTok https://www.tiktok.com/@pandytickets\nRecibes este correo porque te suscribiste a Pandy Tickets.\nCancelar suscripción: {{unsubscribe_url}}"
		)
	);
});

test("generated HTML gets the icons too, and its text part keeps the links apart", () => {
	const { html, text } = renderEmail({ format: "html", html: "<html><body><p>Hola</p></body></html>", newsletter, appUrl: APP_URL });
	assert.ok(html.includes('src="https://mail.pandy.cloud/i/social/tiktok?c=71717a"'));
	assert.match(text, /Síguenos\n+https:\/\/www\.instagram\.com\/pandytickets https:\/\/www\.tiktok\.com\/@pandytickets\n/);
});

test("UTM tags follow the domain rules: icons stay untouched, profiles only when their domain is tagged", () => {
	const { html, text } = renderEmail({ markdown: "Hola", newsletter, appUrl: APP_URL });
	const options = { source: "pandy", campaign: "Hola", ownUrls: [APP_URL] };
	const onlyOwnSite = addUtm(html, { ...options, domains: ["pandy.cloud"] });
	assert.ok(onlyOwnSite.includes('href="https://www.instagram.com/pandytickets"'));
	assert.ok(onlyOwnSite.includes('src="https://mail.pandy.cloud/i/social/instagram?c=71717a"'));
	const everyLink = addUtm(html, { ...options, domains: [] });
	assert.ok(everyLink.includes('href="https://www.instagram.com/pandytickets?utm_source=pandy&amp;utm_medium=email&amp;utm_campaign=hola"'));
	assert.ok(everyLink.includes('src="https://mail.pandy.cloud/i/social/instagram?c=71717a"'));
	assert.ok(addUtmToText(text, { ...options, domains: [] }).includes("Instagram https://www.instagram.com/pandytickets?utm_source=pandy"));
});

test("only known networks with the setting on make it to the footer", () => {
	assert.deepEqual(getFooterSocialLinks({ ...newsletter, footerSocial: { enabled: false } }), []);
	assert.deepEqual(getFooterSocialLinks({ socialLinks: newsletter.socialLinks }), []);
	assert.deepEqual(
		getFooterSocialLinks(newsletter).map(({ id }) => id),
		["instagram", "tiktok"]
	);
});

test("icon colors are six hex digits, missing means the footer gray", () => {
	assert.equal(parseIconColor(null), "71717a");
	assert.equal(parseIconColor(""), "71717a");
	assert.equal(parseIconColor("605B66"), "605b66");
	assert.equal(parseIconColor("#605b66"), "605b66");
	for (const value of ["fff", "605b6", "605b667", "zzzzzz", "605b66;x", "red"]) assert.equal(parseIconColor(value), null, value);
	assert.equal(getSocialIconUrl({ baseUrl: APP_URL, id: "x", color: "nope" }), `${APP_URL}/i/social/x?c=71717a`);
});
