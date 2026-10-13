import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { renderIssueBody } from "../lib/archive-content.js";
import { parseNamedLinks } from "../lib/brand-links.js";
import { cleanRichHtml } from "../lib/clean-html.js";
import { buildUploadName, putImageOnDisk } from "../lib/disk-uploads.js";
import { renderEmail } from "../lib/render-email.js";
import { addTracking } from "../lib/tracking.js";

process.env.SESSION_SECRET = "test-session-secret-with-at-least-32-characters";

const BUTTON = '<p data-button=""><a href="https://pandy.cloud/congreso">Inscríbete</a></p>';

test("the cleaner keeps a button's marker and drops every other attribute", () => {
	const html = cleanRichHtml(
		'<p data-button="yes" class="cta" style="color:red" onclick="x()"><a href="https://pandy.cloud/congreso" style="x">Inscríbete</a></p><p data-other="1">Hola</p>'
	);
	assert.equal(html, `${BUTTON}<p>Hola</p>`);
});

test("buttons become table-based email buttons, and 'Label (url)' in the text version", () => {
	const { html, text } = renderEmail({ format: "rich", html: `<p>Hola</p>${BUTTON}`, newsletter: { name: "Pandy" } });
	assert.match(
		html,
		/<table role="presentation"[^>]*><tr><td style="background:#18181b;border-radius:8px;"><a href="https:\/\/pandy\.cloud\/congreso" style="[^"]*padding:12px 22px;[^"]*color:#ffffff;font-weight:600;[^"]*">Inscríbete<\/a><\/td><\/tr><\/table>/
	);
	assert.ok(!html.includes("data-button"));
	assert.ok(text.includes("Inscríbete (https://pandy.cloud/congreso)"));
	const targeted = renderEmail({ format: "rich", html: '<p data-button=""><a target="_blank" href="https://x.example/">Ir</a></p>' });
	assert.match(targeted.html, /<td style="background:#18181b;border-radius:8px;"><a href="https:\/\/x\.example\/" style="/);
});

test("a button without a link or label is not drawn as an empty button", () => {
	const { html } = renderEmail({ format: "rich", html: '<p data-button=""><a href="https://x.example/"></a></p><p data-button="">Solo texto</p>' });
	assert.ok(!html.includes("<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin:24px 0;\">"));
	assert.ok(html.includes("<p>Solo texto</p>"));
});

test("button links are tracked like any other link", () => {
	const { html } = renderEmail({ format: "rich", html: BUTTON });
	const tracked = addTracking(html, { baseUrl: "https://news.pandy.cloud", messageId: "65f000000000000000000004" });
	assert.ok(!tracked.includes('href="https://pandy.cloud/congreso"'));
	assert.match(tracked, /href="https:\/\/news\.pandy\.cloud\/c\/[^"]+" style="display:inline-block;/);
});

test("the archive keeps buttons for its own styling", () => {
	const { html } = renderIssueBody({ format: "rich", html: BUTTON });
	assert.equal(html, BUTTON);
});

const newsletter = {
	name: "Pandy & co",
	headerImageUrl: "https://news.pandy.cloud/uploads/images/banner-abc.png",
	websiteUrl: "https://pandy.cloud",
};

test("the banner opens the email, linked to the website, and stays out of the text version", () => {
	const { html, text } = renderEmail({ format: "rich", html: "<p>Hola</p>", newsletter, webUrl: "https://news.pandy.cloud/p/hola" });
	const banner = html.indexOf('<a href="https://pandy.cloud" style="display:block;text-decoration:none;"><img src="https://news.pandy.cloud/uploads/images/banner-abc.png" alt="Pandy &amp; co"');
	assert.ok(banner > 0);
	assert.ok(banner < html.indexOf("<p>Hola</p>"));
	assert.match(html, /<img src="https:\/\/news\.pandy\.cloud\/uploads\/images\/banner-abc\.png"[^>]*style="[^"]*max-width:100%;height:auto;/);
	assert.ok(!text.includes("banner-abc") && !text.includes("https://pandy.cloud"));
});

test("without a website the banner isn't a link, and archive pages have no banner", () => {
	const { html } = renderEmail({ format: "rich", html: "<p>Hola</p>", newsletter: { ...newsletter, websiteUrl: "" } });
	assert.ok(html.includes('<td style="padding:0 0 24px;"><img src="https://news.pandy.cloud/uploads/images/banner-abc.png"'));
	const web = renderEmail({ format: "rich", html: "<p>Hola</p>", newsletter, isWebVersion: true });
	assert.ok(!web.html.includes("banner-abc"));
});

test("saved links need a label, an https URL and a unique label", () => {
	assert.deepEqual(parseNamedLinks("Tienda online https://pandy.cloud/tienda\n\nEventos https://pandy.cloud/e"), {
		links: [
			{ label: "Tienda online", url: "https://pandy.cloud/tienda" },
			{ label: "Eventos", url: "https://pandy.cloud/e" },
		],
	});
	assert.ok(parseNamedLinks("https://pandy.cloud").error);
	assert.ok(parseNamedLinks("Tienda http://pandy.cloud").error);
	assert.ok(parseNamedLinks("Tienda https://a.example\ntienda https://b.example").error);
	assert.ok(parseNamedLinks(`${"x".repeat(61)} https://a.example`).error);
});

test("upload names keep only a slug and a short extension, with a random suffix", () => {
	assert.match(buildUploadName("images/Team Photo.PNG"), /^images\/team-photo-[A-Za-z0-9]{16}\.png$/);
	assert.match(buildUploadName("images/../../etc/passwd.png"), /^images\/passwd-[A-Za-z0-9]{16}\.png$/);
	assert.match(buildUploadName("images/.png"), /^images\/png-[A-Za-z0-9]{16}$/);
	assert.match(buildUploadName(""), /^images\/image-[A-Za-z0-9]{16}$/);
	assert.notEqual(buildUploadName("images/a.png"), buildUploadName("images/a.png"));
});

test("uploads to disk never overwrite and return the public URL", async () => {
	const directory = await mkdtemp(path.join(tmpdir(), "mailcheap-uploads-"));
	try {
		const options = { directory, publicUrl: "https://news.pandy.cloud/uploads/", pathname: "images/logo.png" };
		const first = await putImageOnDisk({ ...options, bytes: new Uint8Array([1]) });
		const second = await putImageOnDisk({ ...options, bytes: new Uint8Array([2]) });
		assert.match(first, /^https:\/\/news\.pandy\.cloud\/uploads\/images\/logo-[A-Za-z0-9]{16}\.png$/);
		assert.notEqual(first, second);
		const files = await readdir(path.join(directory, "images"));
		assert.equal(files.length, 2);
		assert.deepEqual([...(await readFile(path.join(directory, first.split("/uploads/")[1])))], [1]);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
