import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAutomationContent, fillHtml, fillText, listVariables } from "../lib/automation-variables.js";

test("text variables use the value, then the fallback, then nothing", () => {
	assert.equal(fillText("Hola {{name}}", { name: "Ana" }), "Hola Ana");
	assert.equal(fillText("Hola {{name|amiga}}", {}), "Hola amiga");
	assert.equal(fillText("Hola {{name}}!", {}), "Hola !");
	assert.equal(fillText("Plan {{ plan }}", { plan: "Pro" }), "Plan Pro");
});

test("numbers and booleans are written as text", () => {
	assert.equal(fillText("{{n}} {{b}}", { n: 3, b: false }), "3 false");
});

test("values in HTML are escaped, fallbacks are kept as the author wrote them", () => {
	assert.equal(fillHtml("<p>{{name}}</p>", { name: "<b>Ana</b> & co" }), "<p>&lt;b&gt;Ana&lt;/b&gt; &amp; co</p>");
	assert.equal(fillHtml("<p>{{name|<em>tú</em>}}</p>", {}), "<p><em>tú</em></p>");
});

test("reserved placeholders are left alone", () => {
	const html = '<a href="{{unsubscribe_url}}">x</a> {{subject}} {{preview_text}} {{confirm_url}} {{keep_url}}';
	assert.equal(fillHtml(html, { subject: "nope" }), html);
});

test("a link to a variable uses an https value", () => {
	const html = '<p><a href="{{checkout_url}}">Pagar</a></p>';
	const filled = fillHtml(html, { checkout_url: "https://tickets.pandy.cloud/b?x=1&y=2" });
	assert.equal(filled, '<p><a href="https://tickets.pandy.cloud/b?x=1&amp;y=2">Pagar</a></p>');
});

test("a link to a non-https value uses the fallback, or loses its href", () => {
	const withFallback = '<a href="{{url|https://pandy.cloud}}">x</a>';
	assert.equal(fillHtml(withFallback, { url: "javascript:alert(1)" }), '<a href="https://pandy.cloud">x</a>');
	assert.equal(fillHtml('<a href="{{url}}">x</a>', { url: "http://plain.example" }), "<a>x</a>");
	assert.equal(fillHtml('<a class="b" href="{{url}}" target="_blank">x</a>', {}), '<a class="b" target="_blank">x</a>');
});

test("the email variable is built in", () => {
	assert.equal(fillText("{{email}}", { email: "ana@x.com" }), "ana@x.com");
});

test("listVariables finds each non-reserved key once", () => {
	assert.deepEqual(
		listVariables(["Hola {{name|tú}}", '<a href="{{checkout_url}}">{{name}}</a> {{unsubscribe_url}}']),
		["name", "checkout_url"]
	);
});

test("buildAutomationContent fills the step for one contact", () => {
	const content = buildAutomationContent({
		automation: { _id: "a1" },
		step: { id: "s1", type: "email", subject: "Hola {{name}}", previewText: "{{plan}}", html: "<p>{{email}}</p>" },
		properties: { name: "Ana", plan: "Pro" },
		email: "ana@x.com",
	});
	assert.deepEqual(content, {
		_id: "a1",
		kind: "automation",
		format: "rich",
		subject: "Hola Ana",
		previewText: "Pro",
		html: "<p>ana@x.com</p>",
	});
});

test("a value cannot inject a variable or an attribute", () => {
	assert.equal(fillHtml("<p>{{name}}</p>", { name: "{{email}}", email: "ana@x.com" }), "<p>{{email}}</p>");
	assert.equal(fillText("{{name}}", { name: "{{email}}", email: "ana@x.com" }), "{{email}}");
	const link = fillHtml('<a href="{{url}}">x</a>', { url: 'https://a.example/?q="onclick="x', email: "ana@x.com" });
	assert.equal(link, '<a href="https://a.example/?q=&quot;onclick=&quot;x">x</a>');
	assert.equal(fillHtml('<a href="{{url}}">x</a>', { url: "https://a.example/?e={{email}}", email: "ana@x.com" }), '<a href="https://a.example/?e={{email}}">x</a>');
	assert.equal(fillHtml('<p title="{{t}}">x</p>', { t: '"><script>' }), '<p title="&quot;&gt;&lt;script&gt;">x</p>');
});

