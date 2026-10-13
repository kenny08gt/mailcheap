import assert from "node:assert/strict";
import { test } from "node:test";
import { getEmailPalette, parseTheme } from "../lib/email-theme.js";
import { renderEmail } from "../lib/render-email.js";

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
	name: "pandy tickets.",
	imageUrl: "https://tickets.pandy.cloud/apple-touch-icon.png",
	websiteUrl: "https://tickets.pandy.cloud",
	postalAddress: "Zona 10, Guatemala",
};
const rich =
	'<h2>Hola</h2><p>Lee <a href="https://x.com">esto</a></p><p data-button=""><a href="https://x.com/buy">Compra</a></p><div data-callout=""><p>Aviso</p></div>';

test("a theme colors the page, card, text, links, buttons, boxes and footer", () => {
	const { html } = renderEmail({ format: "rich", html: rich, newsletter: { ...newsletter, theme: PANDY } });
	assert.match(html, /<body style="margin:0;padding:0;background:#f7f5ef;">/);
	assert.ok(html.includes("background:#ffffff;border:1px solid #d8d2cc;border-radius:12px;"));
	assert.ok(html.includes("color:#16141d;"));
	assert.ok(html.includes(".body a { color: #c81e6a; }"));
	assert.ok(
		html.includes(
			'<td style="background:#d9fc79;border-radius:8px;"><a href="https://x.com/buy" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#d9fc79;color:#16141d;'
		)
	);
	assert.ok(html.includes('<div style="margin:24px 0;padding:24px 24px 8px;border-radius:12px;background:#f7f5ef;">'));
	assert.match(html, /color:#605b66;border-top:1px solid #d8d2cc;/);
	assert.ok(html.includes('style="color:#605b66;text-decoration:underline;">Cancelar suscripción'));
	assert.ok(!/#(18181b|e4e4e7|71717a|09090b|52525b|a1a1aa|f4f4f5|27272a)/.test(html));
});

test("a header color without a banner shows a band with the logo and the name", () => {
	const { html } = renderEmail({ markdown: "Hola", newsletter: { ...newsletter, theme: PANDY } });
	assert.ok(html.includes("background:#16141d;border-radius:11px 11px 0 0;"));
	assert.ok(html.includes('<img src="https://tickets.pandy.cloud/apple-touch-icon.png" alt="" width="32" height="32"'));
	assert.match(html, /color:#ffffff;"><a href="https:\/\/tickets\.pandy\.cloud" style="color:#ffffff;text-decoration:none;">pandy tickets\.<\/a>/);
	assert.ok(html.indexOf("pandy tickets.</a>") < html.indexOf("Hola"));

	const light = renderEmail({ markdown: "Hola", newsletter: { name: "Light", theme: { headerBackground: "#d9fc79" } } });
	assert.ok(light.html.includes('color:#18181b;">Light</td>'));
	assert.ok(!light.html.includes("<img"));
});

test("a banner takes the header's place, and the web version has neither", () => {
	const theme = { headerBackground: "#16141d" };
	const banner = renderEmail({
		markdown: "Hola",
		newsletter: { ...newsletter, headerImageUrl: "https://x.com/banner.png", theme },
	}).html;
	assert.ok(banner.includes('src="https://x.com/banner.png"'));
	assert.ok(!banner.includes("background:#16141d"));
	const web = renderEmail({ markdown: "Hola", newsletter: { ...newsletter, theme }, isWebVersion: true }).html;
	assert.ok(!web.includes("background:#16141d"));
});

test("an empty or invalid theme renders exactly like no theme", () => {
	const inputs = [
		{ markdown: "# Hi\n\n:::box\nBox\n:::\n\n[link](https://x.com)", webUrl: "https://n.x.com/p/1" },
		{ format: "rich", html: rich },
		{ format: "html", html: "<html><body><p>Issue</p></body></html>" },
	];
	for (const input of inputs) {
		const plain = renderEmail({ ...input, newsletter });
		assert.ok(plain.html.includes("#18181b") || input.format === "html");
		for (const theme of [{}, { background: "", card: "" }, { accent: "red", text: "#fff", link: '#000000"><b>' }]) {
			assert.deepEqual(renderEmail({ ...input, newsletter: { ...newsletter, theme } }), plain);
		}
	}
	const { html } = renderEmail({ format: "rich", html: rich, newsletter });
	assert.match(html, /<body style="margin:0;padding:0;background:#ffffff;">/);
	assert.ok(html.includes('<td style="background:#18181b;border-radius:8px;">'));
	assert.ok(html.includes("background:#f4f4f5;"));
});

test("theme fields take #rrggbb only, lowercased, and empty fields stay unset", () => {
	assert.deepEqual(parseTheme({ background: " #F7F5EF ", card: "", accent: "#D9FC79" }), {
		theme: { background: "#f7f5ef", accent: "#d9fc79" },
	});
	assert.deepEqual(parseTheme({}), { theme: {} });
	for (const value of ["red", "#fff", "#12345g", "f7f5ef", "#f7f5ef0", '#000000"><script>']) {
		assert.ok(parseTheme({ link: value }).error, value);
	}
	assert.equal(getEmailPalette({ link: '#000000"><script>' }).link, "#18181b");
});
