import assert from "node:assert/strict";
import { test } from "node:test";
import { countLinkClicks } from "../lib/message-stats.js";
import { UNSUBSCRIBE_PLACEHOLDER } from "../lib/render-email.js";
import { TEST_SUBJECT_PREFIX, buildRecipientEmail } from "../lib/sending-rules.js";
import { readClickToken } from "../lib/tracking.js";
import { addUtm, addUtmToText, parseUtmDomains, stripUtm } from "../lib/utm.js";

process.env.SESSION_SECRET = "test-session-secret-with-at-least-32-characters";
process.env.APP_URL = "https://news.pandy.cloud";

const options = {
	source: "pandy",
	campaign: "¡Nuevo congreso médico 2026!",
	domains: ["pandy.cloud"],
	ownUrls: ["https://news.pandy.cloud"],
};
const TAGS = "utm_source=pandy&utm_medium=email&utm_campaign=nuevo-congreso-medico-2026";

function hrefs(html) {
	return [...html.matchAll(/href="([^"]*)"/g)].map(([, href]) => href.replaceAll("&amp;", "&"));
}

test("links to a listed domain or its subdomains are tagged, others aren't", () => {
	const html = addUtm(
		'<a href="https://pandy.cloud/">a</a><a href="https://tickets.pandy.cloud/e/1?ref=x#top">b</a><a href="https://notpandy.cloud/">c</a><a href="https://example.com/">d</a>',
		options
	);
	assert.deepEqual(hrefs(html), [
		`https://pandy.cloud/?${TAGS}`,
		`https://tickets.pandy.cloud/e/1?ref=x&${TAGS}#top`,
		"https://notpandy.cloud/",
		"https://example.com/",
	]);
	assert.ok(!/href="[^"]*&(?!amp;)/.test(html), "ampersands stay encoded in the HTML");
});

test("without domains every external link is tagged", () => {
	const html = addUtm('<a href="https://example.com/x">x</a>', { ...options, domains: [] });
	assert.deepEqual(hrefs(html), [`https://example.com/x?${TAGS}`]);
});

test("existing UTM tags, unsubscribe, mailto and Mailcheap's own links stay as they are", () => {
	const links = [
		"https://pandy.cloud/?utm_source=instagram",
		"https://pandy.cloud/unsubscribe?token=abc",
		"mailto:hola@pandy.cloud",
		"https://news.pandy.cloud/archive/pandy/p/hola",
		"https://news.pandy.cloud/c/abc",
		UNSUBSCRIBE_PLACEHOLDER,
	];
	const html = links.map((href) => `<a href="${href}">x</a>`).join("");
	assert.equal(addUtm(html, { ...options, domains: [] }), html);
});

test("the text version is tagged the same way, without swallowing the parenthesis", () => {
	const text = addUtmToText(
		"Compra (https://pandy.cloud/tienda)\nArchivo: https://news.pandy.cloud/archive/x\nOtro https://example.com/",
		options
	);
	assert.equal(
		text,
		`Compra (https://pandy.cloud/tienda?${TAGS})\nArchivo: https://news.pandy.cloud/archive/x\nOtro https://example.com/`
	);
});

test("domains are read from a comma-separated list of names or URLs", () => {
	assert.deepEqual(parseUtmDomains("Pandy.cloud, https://www.shop.example.org/path , pandy.cloud"), {
		domains: ["pandy.cloud", "shop.example.org"],
	});
	assert.deepEqual(parseUtmDomains(""), { domains: [] });
	assert.ok(parseUtmDomains("not a domain").error);
});

test("the click report groups links without their UTM tags, once per reader", () => {
	assert.equal(stripUtm(`https://pandy.cloud/e?id=1&${TAGS}`), "https://pandy.cloud/e?id=1");
	const rows = countLinkClicks([
		{ clickedUrls: [`https://pandy.cloud/?${TAGS}`, "https://pandy.cloud/"] },
		{ clickedUrls: ["https://pandy.cloud/"] },
	]);
	assert.deepEqual(rows, [{ url: "https://pandy.cloud/", clickers: 2 }]);
});

const newsletter = {
	_id: "65f000000000000000000002",
	name: "Pandy al día",
	slug: "pandy",
	fromEmail: "hola@pandy.cloud",
	utm: { enabled: true, domains: [] },
};
const campaign = {
	_id: "65f000000000000000000001",
	format: "rich",
	subject: "Nuevo congreso médico 2026",
	html: '<p>Hola</p><p data-button=""><a href="https://pandy.cloud/congreso">Inscríbete</a></p>',
};
const contact = { _id: "65f000000000000000000003", email: "lector@example.com" };

test("sent issues are tagged before tracking, so the redirect lands on the tagged URL", () => {
	const email = buildRecipientEmail({ campaign, newsletter, contact, messageId: "65f000000000000000000004" });
	const clickUrls = hrefs(email.html).filter((href) => href.startsWith("https://news.pandy.cloud/c/"));
	assert.equal(clickUrls.length, 1);
	assert.equal(readClickToken(clickUrls[0].split("/c/")[1]).url, `https://pandy.cloud/congreso?${TAGS}`);
	assert.ok(email.text.includes(`Inscríbete (https://pandy.cloud/congreso?${TAGS})`));
	assert.ok(email.html.includes(email.unsubscribeUrl), "unsubscribe link stays direct");
	assert.ok(!email.unsubscribeUrl.includes("utm_"));
});

test("test sends show the real tags; untagged newsletters and non-issues are left alone", () => {
	const test = buildRecipientEmail({ campaign: { ...campaign, subject: `${TEST_SUBJECT_PREFIX}${campaign.subject}` }, newsletter, contact });
	assert.ok(test.text.includes(`?${TAGS}`));
	const off = buildRecipientEmail({ campaign, newsletter: { ...newsletter, utm: { enabled: false } }, contact });
	assert.ok(!off.html.includes("utm_"));
	const welcome = buildRecipientEmail({ campaign: { ...campaign, _id: undefined }, newsletter, contact });
	assert.ok(!welcome.html.includes("utm_"));
});
