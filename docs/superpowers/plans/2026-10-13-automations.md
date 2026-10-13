# Automations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Email sequences that start on a trigger (`contact_active` or an API event), run wait and email steps, and stop on exit events.

**Architecture:** Three pure modules (step engine, variables, input rules) hold the logic and are unit tested without a database. `lib/automations.js` wires them to Mongo: starting and ending runs, and a tick that advances due runs and sends their emails through the existing `sendMessageBatch`. A systemd timer on the server calls the tick every 5 minutes. The events API and a dashboard section sit on top.

**Tech Stack:** Next.js 16 App Router (read `node_modules/next/dist/docs/` before touching routes or server actions, per AGENTS.md), Mongoose 9, `node --test`, Tiptap 3, Tailwind 4, shadcn-style components in `components/ui`.

**Spec:** `docs/superpowers/specs/2026-10-13-automations-design.md`

## Global Constraints

- Pure modules (`lib/automation-steps.js`, `lib/automation-variables.js`, `lib/automation-rules.js`) import only other pure modules with relative `./x.js` paths, never `@/`, `server-only` or models. Tests import them as `../lib/x.js`.
- Code style: tabs, double quotes, semicolons, ES modules, comments only for the non-obvious "why", like the surrounding code.
- Dashboard copy is English. Email copy is whatever the author writes.
- Event names: `^[a-z][a-z0-9_]{0,49}$`. `contact_active` is reserved for the built-in trigger.
- Property keys: `^[a-z][a-z0-9_]{0,39}$`, at most 20; values are strings (≤ 500 chars), finite numbers or booleans.
- Variables: `{{key}}` / `{{key|fallback}}`. Reserved and untouched: `unsubscribe_url`, `subject`, `preview_text`, `confirm_url`, `keep_url`.
- Tick: up to 500 enrollments per call, claim lock 10 minutes, `Authorization: Bearer $CRON_SECRET`.
- Automation emails share the per-newsletter cap `LIMITS.welcomeEmailsPer10Minutes` (100 per 10 minutes) with welcome and confirmation emails.
- Run tests with `npm test`. Run `npm run lint` before each commit.

## Deviations from the spec (decided while planning)

1. **Exits when a contact stops being active** happen in the tick: before advancing a run, it reads the contact, and a contact that is not `active` (or is gone) ends the run with `exitReason` set to the contact's status (or `"deleted"`). This replaces hooking the five places that change contact status (`app/api/unsubscribe/route.js`, `app/unsubscribe/page.js`, `lib/ses-events.js`, `lib/sending.js` makeDormant, `app/(app)/contacts/actions.js`). The send path already refuses non-active contacts, so no email can slip through between the status change and the tick.
2. **"No tick in 30 minutes"** shows as a warning on the Automations list page, read from a `JobRun` document, not on the overview.
3. **Health pause** per automation: bounce and complaint rates over the automation's emails sent in the last 30 days, computed with the existing `getCampaignPauseReason` (it waits for 100 sends before judging).

## File map

| File | Responsibility |
|---|---|
| `lib/automation-steps.js` (new, pure) | `advance()`: given steps, the run's position and `now`, what to send and where the run ends up. Step id generation. |
| `lib/automation-variables.js` (new, pure) | Fill `{{vars}}` in subject, preview and HTML; build the content object an automation email is sent with. |
| `lib/automation-rules.js` (new, pure) | Validate event names, properties and saved automation input; re-entry decision; activation problems. |
| `models/Automation.js`, `models/Enrollment.js`, `models/JobRun.js` (new) | Schemas and indexes. |
| `models/Message.js` (modify) | `automation` kind, new fields and indexes. |
| `lib/sending-rules.js` (modify) | No archive URL for automation emails. |
| `lib/sending.js` (modify) | `sendMessageBatch` sends `automation` messages; the cap counts them; `sendAutomationTestEmail`. |
| `lib/automations.js` (new, server) | `startRuns`, `exitRuns`, `onContactActive`, `runAutomationTick`. |
| `app/api/jobs/automations-tick/route.js` (new) | Tick endpoint behind `CRON_SECRET`. |
| `deploy/systemd/mailcheap-automations.{service,timer}` (new) | The 5-minute timer. |
| `app/api/v1/events/route.js` (new), `app/api/v1/contacts/route.js` (modify) | Events API; `properties` on signup. |
| `app/archive/actions.js`, `app/confirm/actions.js` (modify) | Call `onContactActive`. |
| `app/(app)/automations/**`, `components/*Automation*.jsx`, `components/NavLinks.jsx` | Dashboard. |

---

### Task 0: Branch

- [ ] **Step 1: Create the feature branch**

```bash
git checkout -b automations
git add docs/superpowers/specs/2026-10-13-automations-design.md docs/superpowers/plans/2026-10-13-automations.md
git commit -m "Add the automations design and implementation plan"
```

---

### Task 1: Step engine

**Files:**
- Create: `lib/automation-steps.js`
- Test: `tests/automation-steps.test.mjs`

**Interfaces:**
- Produces:
  - `HOUR_MS: number`
  - `newStepId(): string`: 12 lowercase hex chars.
  - `advance({ steps, stepId, stepIndex, now }) => { emails: string[], stepId: string | null, stepIndex: number, nextAt: Date | null, status: "active" | "completed" }`. `steps` is `Array<{ id, type: "wait", hours } | { id, type: "email", ... }>`; `now` is a `Date`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/automation-steps.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { HOUR_MS, advance, newStepId } from "../lib/automation-steps.js";

const now = new Date("2026-10-13T12:00:00Z");
const email = (id) => ({ id, type: "email", subject: id, html: "<p>x</p>" });
const wait = (id, hours) => ({ id, type: "wait", hours });

test("a new run sends the first emails up to the first wait, then waits", () => {
	const steps = [email("a"), email("b"), wait("w", 24), email("c")];
	const result = advance({ steps, stepId: "a", stepIndex: 0, now });
	assert.deepEqual(result.emails, ["a", "b"]);
	assert.equal(result.stepId, "c");
	assert.equal(result.stepIndex, 3);
	assert.equal(result.status, "active");
	assert.equal(result.nextAt.getTime(), now.getTime() + 24 * HOUR_MS);
});

test("a run that starts on a wait sends nothing yet", () => {
	const steps = [wait("w", 1), email("a")];
	const result = advance({ steps, stepId: "w", stepIndex: 0, now });
	assert.deepEqual(result.emails, []);
	assert.equal(result.stepId, "a");
	assert.equal(result.nextAt.getTime(), now.getTime() + HOUR_MS);
});

test("waits chain: each tick stops at the next wait", () => {
	const steps = [wait("w1", 1), email("a"), wait("w2", 2), email("b")];
	const second = advance({ steps, stepId: "a", stepIndex: 1, now });
	assert.deepEqual(second.emails, ["a"]);
	assert.equal(second.stepId, "b");
	assert.equal(second.nextAt.getTime(), now.getTime() + 2 * HOUR_MS);
});

test("passing the last email completes the run", () => {
	const steps = [wait("w", 1), email("a")];
	const result = advance({ steps, stepId: "a", stepIndex: 1, now });
	assert.deepEqual(result.emails, ["a"]);
	assert.equal(result.status, "completed");
	assert.equal(result.stepId, null);
	assert.equal(result.nextAt, null);
});

test("a trailing wait keeps the run active until it elapses, then completes it", () => {
	const steps = [email("a"), wait("w", 3)];
	const first = advance({ steps, stepId: "a", stepIndex: 0, now });
	assert.equal(first.status, "active");
	assert.equal(first.stepId, null);
	assert.equal(first.stepIndex, 2);
	const after = advance({ steps, stepId: first.stepId, stepIndex: first.stepIndex, now });
	assert.equal(after.status, "completed");
	assert.deepEqual(after.emails, []);
});

test("the current step is found by id after steps are inserted before it", () => {
	const steps = [email("new"), wait("w", 1), email("a"), email("b")];
	const result = advance({ steps, stepId: "a", stepIndex: 1, now });
	assert.deepEqual(result.emails, ["a", "b"]);
	assert.equal(result.status, "completed");
});

test("a deleted current step falls back to the saved position", () => {
	// The run was waiting on "b" at index 2; "b" was deleted, so "c" moved into index 2.
	const steps = [email("a"), wait("w", 1), email("c")];
	const result = advance({ steps, stepId: "b", stepIndex: 2, now });
	assert.deepEqual(result.emails, ["c"]);
	assert.equal(result.status, "completed");
});

test("a saved position past the end completes the run", () => {
	const result = advance({ steps: [email("a")], stepId: "gone", stepIndex: 5, now });
	assert.equal(result.status, "completed");
	assert.deepEqual(result.emails, []);
});

test("an automation with no steps completes the run", () => {
	const result = advance({ steps: [], stepId: null, stepIndex: 0, now });
	assert.equal(result.status, "completed");
});

test("step ids are 12 hex characters and differ", () => {
	const ids = new Set(Array.from({ length: 50 }, newStepId));
	assert.equal(ids.size, 50);
	for (const id of ids) assert.match(id, /^[0-9a-f]{12}$/);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test tests/automation-steps.test.mjs`
Expected: FAIL, `Cannot find module '../lib/automation-steps.js'`.

- [ ] **Step 3: Implement**

```js
// lib/automation-steps.js
import { randomBytes } from "node:crypto";

export const HOUR_MS = 60 * 60 * 1000;

export function newStepId() {
	return randomBytes(6).toString("hex");
}

// The run's place is its step id, so edits elsewhere in the list don't move it. When that step was
// deleted, the saved index points at whatever moved into its place.
function findPosition(steps, stepId, stepIndex) {
	const index = stepId ? steps.findIndex(({ id }) => id === stepId) : -1;
	return index === -1 ? stepIndex : index;
}

// Runs every email from the run's place up to the next wait. A run whose last step is a wait stays
// active on a null step until that wait is over, and completes on the tick after.
export function advance({ steps, stepId, stepIndex, now }) {
	const emails = [];
	for (let index = findPosition(steps, stepId, stepIndex); index < steps.length; index++) {
		const step = steps[index];
		if (step.type === "email") {
			emails.push(step.id);
			continue;
		}
		const next = index + 1;
		return {
			emails,
			stepId: steps[next]?.id ?? null,
			stepIndex: next,
			nextAt: new Date(now.getTime() + step.hours * HOUR_MS),
			status: "active",
		};
	}
	return { emails, stepId: null, stepIndex: steps.length, nextAt: null, status: "completed" };
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test tests/automation-steps.test.mjs`
Expected: all 10 tests pass.

- [ ] **Step 5: Commit**

```bash
npm run lint
git add lib/automation-steps.js tests/automation-steps.test.mjs
git commit -m "Add the automation step engine"
```

---

### Task 2: Variables

**Files:**
- Create: `lib/automation-variables.js`
- Test: `tests/automation-variables.test.mjs`

**Interfaces:**
- Consumes: `escapeHtml(value)` from `lib/render-email.js`.
- Produces:
  - `RESERVED_VARIABLES: string[]`
  - `fillText(text: string, values: object) => string`: for subject and preview text. Plain text, not escaped (`renderEmail` escapes them where they go into HTML).
  - `fillHtml(html: string, values: object) => string`
  - `listVariables(texts: string[]) => string[]`: unique non-reserved keys used, in order of appearance (for the editor's sample-value inputs).
  - `buildAutomationContent({ automation, step, properties, email }) => { _id, kind: "automation", format: "rich", subject, previewText, html }`

- [ ] **Step 1: Write the failing tests**

```js
// tests/automation-variables.test.mjs
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
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test tests/automation-variables.test.mjs`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```js
// lib/automation-variables.js
import { escapeHtml } from "./render-email.js";

// Filled in later by buildRecipientEmail, or meaningful only in other emails.
export const RESERVED_VARIABLES = ["unsubscribe_url", "subject", "preview_text", "confirm_url", "keep_url"];

const VARIABLE = /\{\{\s*([a-z][a-z0-9_]{0,39})\s*(?:\|([^}]*))?\}\}/g;
const HREF_VARIABLE = /\s+href="\{\{\s*([a-z][a-z0-9_]{0,39})\s*(?:\|([^}"]*))?\}\}"/g;

function isReserved(key) {
	return RESERVED_VARIABLES.includes(key);
}

function readValue(values, key) {
	const value = values?.[key];
	return value === undefined || value === null || value === "" ? null : String(value);
}

function isHttpsUrl(value) {
	try {
		return new URL(value).protocol === "https:";
	} catch {
		return false;
	}
}

export function fillText(text, values) {
	return String(text ?? "").replace(VARIABLE, (match, key, fallback) =>
		isReserved(key) ? match : (readValue(values, key) ?? fallback ?? "")
	);
}

// Links first: an href only takes an https URL, so a bad value can't become a javascript: link and an
// empty one doesn't leave a dead link.
export function fillHtml(html, values) {
	const withLinks = String(html ?? "").replace(HREF_VARIABLE, (match, key, fallback) => {
		if (isReserved(key)) return match;
		const url = [readValue(values, key), fallback?.trim()].find((candidate) => candidate && isHttpsUrl(candidate));
		return url ? ` href="${escapeHtml(url)}"` : "";
	});
	return withLinks.replace(VARIABLE, (match, key, fallback) => {
		if (isReserved(key)) return match;
		const value = readValue(values, key);
		return value === null ? (fallback ?? "") : escapeHtml(value);
	});
}

export function listVariables(texts) {
	const keys = new Set();
	for (const text of texts) {
		for (const [, key] of String(text ?? "").matchAll(VARIABLE)) if (!isReserved(key)) keys.add(key);
	}
	return [...keys];
}

export function buildAutomationContent({ automation, step, properties, email }) {
	const values = { ...properties, email };
	return {
		_id: automation._id,
		kind: "automation",
		format: "rich",
		subject: fillText(step.subject, values).trim(),
		previewText: fillText(step.previewText, values).trim(),
		html: fillHtml(step.html, values),
	};
}
```

`escapeHtml` (`lib/render-email.js:25`) escapes `& < > " '`, so it is safe for both text and the href value.

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test tests/automation-variables.test.mjs`
Expected: all 9 pass.

- [ ] **Step 5: Commit**

```bash
npm run lint
git add lib/automation-variables.js tests/automation-variables.test.mjs
git commit -m "Add automation email variables"
```

---

### Task 3: Input rules

**Files:**
- Create: `lib/automation-rules.js`
- Test: `tests/automation-rules.test.mjs`

**Interfaces:**
- Consumes: `hasContent` from `lib/render-email.js`, `isPlainObject`, `MAX_BODY_BYTES` from `lib/validation.js`.
- Produces:
  - `CONTACT_ACTIVE = "contact_active"`
  - `readEventName(value) => string | null`: trimmed, lowercased, must match the pattern and not be `contact_active`.
  - `readProperties(value) => { properties: object } | { error: string }`: `undefined` gives `{ properties: {} }`.
  - `readAutomationInput(values) => { automation: { name, trigger, exitOn, reentry, steps } } | { error: string }`: what the editor saves.
  - `canStartAgain({ reentry, lastEnrolledAt, now }) => boolean`: `lastEnrolledAt` is `Date | null`.
  - `getAutomationProblem(automation) => string | null`: problems that block activation.

- [ ] **Step 1: Write the failing tests**

```js
// tests/automation-rules.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	canStartAgain,
	getAutomationProblem,
	readAutomationInput,
	readEventName,
	readProperties,
} from "../lib/automation-rules.js";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-13T12:00:00Z");

test("event names follow the pattern and contact_active is reserved", () => {
	assert.equal(readEventName("plan_checkout_started"), "plan_checkout_started");
	assert.equal(readEventName("  Plan_Purchased "), "plan_purchased");
	assert.equal(readEventName("contact_active"), null);
	assert.equal(readEventName("1st"), null);
	assert.equal(readEventName("has-dash"), null);
	assert.equal(readEventName("a".repeat(51)), null);
	assert.equal(readEventName(42), null);
});

test("properties are a flat object of short scalars", () => {
	assert.deepEqual(readProperties(undefined), { properties: {} });
	assert.deepEqual(readProperties({ plan: "Pro", seats: 3, trial: true }), {
		properties: { plan: "Pro", seats: 3, trial: true },
	});
	assert.ok(readProperties([]).error);
	assert.ok(readProperties({ nested: { a: 1 } }).error);
	assert.ok(readProperties({ BadKey: "x" }).error);
	assert.ok(readProperties({ long: "x".repeat(501) }).error);
	assert.ok(readProperties({ n: Number.NaN }).error);
	assert.ok(readProperties({ name: "Ana\r\nBcc: x@y.com" }).error);
	assert.ok(readProperties(Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, i]))).error);
});

test("re-entry: never, or after the cooldown", () => {
	assert.equal(canStartAgain({ reentry: { allowed: false }, lastEnrolledAt: null, now }), true);
	assert.equal(canStartAgain({ reentry: { allowed: false }, lastEnrolledAt: new Date(now - 400 * DAY), now }), false);
	const weekly = { allowed: true, cooldownDays: 7 };
	assert.equal(canStartAgain({ reentry: weekly, lastEnrolledAt: new Date(now - 6 * DAY), now }), false);
	assert.equal(canStartAgain({ reentry: weekly, lastEnrolledAt: new Date(now - 7 * DAY), now }), true);
});

test("saved input is cleaned and checked", () => {
	const { automation } = readAutomationInput({
		name: "  Plan dropout ",
		trigger: "plan_checkout_started",
		exitOn: ["plan_purchased", "plan_purchased", "bad name"],
		reentry: { allowed: true, cooldownDays: "7" },
		steps: [
			{ id: "aaaaaaaaaaaa", type: "wait", hours: 1 },
			{ id: "bbbbbbbbbbbb", type: "email", subject: " Hola ", previewText: "", html: "<p>x</p>" },
		],
	});
	assert.equal(automation.name, "Plan dropout");
	assert.deepEqual(automation.trigger, { event: "plan_checkout_started" });
	assert.deepEqual(automation.exitOn, ["plan_purchased"]);
	assert.deepEqual(automation.reentry, { allowed: true, cooldownDays: 7 });
	assert.equal(automation.steps[1].subject, "Hola");
	assert.equal(readAutomationInput({ trigger: "contact_active", steps: [] }).automation.trigger.event, "contact_active");
});

test("saved input refuses bad steps", () => {
	const base = { name: "x", trigger: "contact_active" };
	assert.ok(readAutomationInput({ ...base, steps: [{ id: "x", type: "wait", hours: 1 }] }).error);
	assert.ok(readAutomationInput({ ...base, steps: [{ id: "aaaaaaaaaaaa", type: "wait", hours: 0 }] }).error);
	assert.ok(readAutomationInput({ ...base, steps: [{ id: "aaaaaaaaaaaa", type: "wait", hours: 24 * 366 }] }).error);
	assert.ok(readAutomationInput({ ...base, steps: [{ id: "aaaaaaaaaaaa", type: "sms" }] }).error);
	const dup = { id: "aaaaaaaaaaaa", type: "wait", hours: 1 };
	assert.ok(readAutomationInput({ ...base, steps: [dup, dup] }).error);
	assert.ok(readAutomationInput({ ...base, trigger: "Bad Name", steps: [] }).error);
});

test("activation needs an email step, with a subject and content in each", () => {
	const ok = {
		trigger: { event: "contact_active" },
		steps: [{ id: "a", type: "email", subject: "Hola", html: "<p>x</p>" }],
	};
	assert.equal(getAutomationProblem(ok), null);
	assert.match(getAutomationProblem({ ...ok, steps: [{ id: "w", type: "wait", hours: 1 }] }), /email/);
	assert.match(getAutomationProblem({ ...ok, steps: [{ id: "a", type: "email", subject: "", html: "<p>x</p>" }] }), /subject/);
	assert.match(getAutomationProblem({ ...ok, steps: [{ id: "a", type: "email", subject: "x", html: "<p></p>" }] }), /content/);
	assert.match(getAutomationProblem({ ...ok, trigger: {} }), /trigger/);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test tests/automation-rules.test.mjs`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```js
// lib/automation-rules.js
import { hasContent } from "./render-email.js";
import { MAX_BODY_BYTES, isPlainObject } from "./validation.js";

export const CONTACT_ACTIVE = "contact_active";

const EVENT_PATTERN = /^[a-z][a-z0-9_]{0,49}$/;
const PROPERTY_KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
const STEP_ID_PATTERN = /^[0-9a-f]{12}$/;
const MAX_PROPERTIES = 20;
const MAX_PROPERTY_LENGTH = 500;
const MAX_EXIT_EVENTS = 10;
const MAX_STEPS = 30;
const MAX_WAIT_HOURS = 24 * 365;
const MAX_COOLDOWN_DAYS = 3650;
const DAY_MS = 24 * 60 * 60 * 1000;

function readName(value) {
	if (typeof value !== "string") return null;
	const name = value.trim().toLowerCase();
	return EVENT_PATTERN.test(name) ? name : null;
}

export function readEventName(value) {
	const name = readName(value);
	return name === CONTACT_ACTIVE ? null : name;
}

function isPropertyValue(value) {
	// Values can end up in the subject header.
	if (typeof value === "string") return value.length <= MAX_PROPERTY_LENGTH && !/[\r\n\0]/.test(value);
	return typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
}

export function readProperties(value) {
	if (value === undefined) return { properties: {} };
	if (!isPlainObject(value)) return { error: "properties must be an object" };
	const entries = Object.entries(value);
	if (entries.length > MAX_PROPERTIES) return { error: `properties can have at most ${MAX_PROPERTIES} keys` };
	for (const [key, item] of entries) {
		if (!PROPERTY_KEY_PATTERN.test(key)) return { error: `property "${key}" must be lowercase letters, digits and _` };
		if (!isPropertyValue(item)) {
			return { error: `property "${key}" must be a string of at most ${MAX_PROPERTY_LENGTH} characters, a number or a boolean` };
		}
	}
	return { properties: Object.fromEntries(entries) };
}

function readStep(step) {
	if (!isPlainObject(step) || typeof step.id !== "string" || !STEP_ID_PATTERN.test(step.id)) return null;
	if (step.type === "wait") {
		const hours = Number(step.hours);
		return hours > 0 && hours <= MAX_WAIT_HOURS ? { id: step.id, type: "wait", hours } : null;
	}
	if (step.type !== "email") return null;
	const html = String(step.html ?? "");
	if (Buffer.byteLength(html, "utf8") > MAX_BODY_BYTES) return null;
	return {
		id: step.id,
		type: "email",
		subject: String(step.subject ?? "").trim().slice(0, 200),
		previewText: String(step.previewText ?? "").trim().slice(0, 300),
		html,
	};
}

export function readAutomationInput(values) {
	const event = readName(values?.trigger);
	if (!event) return { error: "The trigger must be contact_active or an event name (lowercase letters, digits and _)" };
	const rawSteps = Array.isArray(values?.steps) ? values.steps : [];
	if (rawSteps.length > MAX_STEPS) return { error: `An automation has at most ${MAX_STEPS} steps` };
	const steps = rawSteps.map(readStep);
	if (steps.includes(null)) return { error: "A step is invalid: waits are longer than 0 hours and at most a year, emails at most 500 KB" };
	if (new Set(steps.map(({ id }) => id)).size !== steps.length) return { error: "Two steps share an id" };

	const exitOn = [...new Set((Array.isArray(values?.exitOn) ? values.exitOn : []).map(readEventName).filter(Boolean))];
	const cooldownDays = Math.round(Number(values?.reentry?.cooldownDays));
	const allowed = values?.reentry?.allowed === true && cooldownDays >= 1 && cooldownDays <= MAX_COOLDOWN_DAYS;
	return {
		automation: {
			name: String(values?.name ?? "").trim().slice(0, 120),
			trigger: { event },
			exitOn: exitOn.slice(0, MAX_EXIT_EVENTS),
			reentry: allowed ? { allowed: true, cooldownDays } : { allowed: false },
			steps,
		},
	};
}

export function canStartAgain({ reentry, lastEnrolledAt, now }) {
	if (!lastEnrolledAt) return true;
	if (!reentry?.allowed) return false;
	return now.getTime() - lastEnrolledAt.getTime() >= reentry.cooldownDays * DAY_MS;
}

export function getAutomationProblem(automation) {
	if (!automation?.trigger?.event) return "Pick a trigger";
	const emails = (automation.steps ?? []).filter(({ type }) => type === "email");
	if (emails.length === 0) return "Add an email step";
	const position = (step) => automation.steps.indexOf(step) + 1;
	const noSubject = emails.find((step) => !step.subject?.trim());
	if (noSubject) return `Add a subject to step ${position(noSubject)}`;
	const empty = emails.find((step) => !hasContent(step.html));
	if (empty) return `Add content to step ${position(empty)}`;
	return null;
}
```

Waits only need `hours > 0`, so fractional hours work for the 1-minute live test (`hours: 0.0167`).

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test tests/automation-rules.test.mjs`
Expected: all 6 pass.

- [ ] **Step 5: Commit**

```bash
npm run lint
git add lib/automation-rules.js tests/automation-rules.test.mjs
git commit -m "Add automation input rules"
```

---

### Task 4: Models

**Files:**
- Create: `models/Automation.js`, `models/Enrollment.js`, `models/JobRun.js`
- Modify: `models/Message.js`

**Interfaces:**
- Produces: Mongoose models `Automation`, `Enrollment`, `JobRun`; constants `AUTOMATION_STATUSES`, `ENROLLMENT_STATUSES`; Message kind `"automation"` with `automationId`, `enrollmentId`, `stepId`.

- [ ] **Step 1: Write the models**

```js
// models/Automation.js
import mongoose from "mongoose";

export const AUTOMATION_STATUSES = ["draft", "active", "paused"];

// Steps are plain objects (lib/automation-rules.js readAutomationInput checks them): a wait has hours,
// an email has subject, previewText and html.
const automationSchema = new mongoose.Schema(
	{
		newsletterId: { type: mongoose.Schema.Types.ObjectId, ref: "Newsletter", required: true },
		name: { type: String, trim: true, default: "" },
		status: { type: String, enum: AUTOMATION_STATUSES, default: "draft" },
		trigger: { event: { type: String, default: "contact_active" } },
		exitOn: { type: [String], default: [] },
		reentry: {
			allowed: { type: Boolean, default: false },
			cooldownDays: { type: Number, min: 1 },
		},
		steps: { type: [mongoose.Schema.Types.Mixed], default: [] },
	},
	{ timestamps: true }
);

automationSchema.index({ newsletterId: 1, status: 1, "trigger.event": 1 });
automationSchema.index({ exitOn: 1 });

export default mongoose.models.Automation || mongoose.model("Automation", automationSchema);
```

```js
// models/Enrollment.js
import mongoose from "mongoose";

export const ENROLLMENT_STATUSES = ["active", "completed", "exited"];

// One contact's run through an automation (lib/automations.js).
const enrollmentSchema = new mongoose.Schema(
	{
		automationId: { type: mongoose.Schema.Types.ObjectId, ref: "Automation", required: true },
		newsletterId: { type: mongoose.Schema.Types.ObjectId, ref: "Newsletter", required: true },
		contactId: { type: mongoose.Schema.Types.ObjectId, ref: "Contact", required: true },
		status: { type: String, enum: ENROLLMENT_STATUSES, default: "active" },
		// The step to run next, and its position then, used when that step gets deleted.
		stepId: { type: String, default: null },
		stepIndex: { type: Number, default: 0 },
		nextAt: { type: Date },
		lockedUntil: { type: Date },
		properties: { type: mongoose.Schema.Types.Mixed, default: {} },
		exitReason: { type: String },
		enrolledAt: { type: Date, default: Date.now },
		endedAt: { type: Date },
	},
	{ timestamps: true, minimize: false }
);

// One live run per contact and automation.
enrollmentSchema.index(
	{ automationId: 1, contactId: 1 },
	{ unique: true, partialFilterExpression: { status: "active" } }
);
enrollmentSchema.index({ status: 1, nextAt: 1 });
enrollmentSchema.index({ contactId: 1, status: 1 });
enrollmentSchema.index({ automationId: 1, contactId: 1, enrolledAt: -1 });
enrollmentSchema.index({ automationId: 1, enrolledAt: -1 });

export default mongoose.models.Enrollment || mongoose.model("Enrollment", enrollmentSchema);
```

```js
// models/JobRun.js
import mongoose from "mongoose";

// The last run of each background job, keyed by job name, so the dashboard can tell when one stopped.
const jobRunSchema = new mongoose.Schema(
	{
		_id: { type: String },
		ranAt: { type: Date },
		result: { type: mongoose.Schema.Types.Mixed },
	},
	{ versionKey: false }
);

export default mongoose.models.JobRun || mongoose.model("JobRun", jobRunSchema);
```

- [ ] **Step 2: Extend Message**

In `models/Message.js`, change the `kind` enum to `["campaign", "last-chance", "welcome", "confirmation", "test", "automation"]` and add after `campaignId`:

```js
		automationId: { type: mongoose.Schema.Types.ObjectId, ref: "Automation" },
		enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Enrollment" },
		stepId: { type: String },
```

and after the last-chance index:

```js
// One email per run and step, even if a tick is retried.
messageSchema.index(
	{ enrollmentId: 1, stepId: 1 },
	{ unique: true, partialFilterExpression: { kind: "automation" } }
);
// Step reports, and the tick's queue of automation emails.
messageSchema.index({ automationId: 1, stepId: 1, status: 1 }, { partialFilterExpression: { kind: "automation" } });
```

- [ ] **Step 3: Check the models load and indexes build**

Run (with local Mongo running, `MONGODB_URI` from `.env.local`):

```bash
node --env-file=.env.local -e '
const { default: mongoose } = await import("mongoose");
await mongoose.connect(process.env.MONGODB_URI);
for (const m of ["Automation", "Enrollment", "JobRun", "Message"]) {
	const { default: Model } = await import(`./models/${m}.js`);
	await Model.syncIndexes();
	console.log(m, Object.keys(await Model.collection.indexInformation()).join(", "));
}
await mongoose.disconnect();'
```

Expected: each model prints its index names, including `enrollmentId_1_stepId_1` and `automationId_1_contactId_1`. If `.env.local` doesn't exist, use `MONGODB_URI=mongodb://127.0.0.1:27017/mailcheap-dev`.

- [ ] **Step 4: Commit**

```bash
npm run lint && npm test
git add models/Automation.js models/Enrollment.js models/JobRun.js models/Message.js
git commit -m "Add automation, enrollment and job run models"
```

---

### Task 5: Sending automation emails

**Files:**
- Modify: `lib/sending-rules.js` (`getIssueWebUrl`), `lib/sending.js`
- Test: `tests/sending.test.mjs`

**Interfaces:**
- Consumes: `buildAutomationContent` (Task 2), models (Task 4).
- Produces (exported from `lib/sending.js`):
  - `sendMessageBatch(messageIds)`: also sends `kind: "automation"` messages.
  - `countRecentSignupEmails(newsletter) => Promise<number>`: now also counts automation emails sent in the window.
  - `alertSignupCap(newsletter) => Promise<void>`
  - `sendAutomationTestEmail({ automationId, stepId, to, properties }) => Promise<{ messageId, sesMessageId, sentAt }>`

- [ ] **Step 1: Write the failing test**

Add to `tests/sending.test.mjs`:

```js
test("automation emails have no archive page and are tagged like issues", () => {
	const archived = { ...newsletter, slug: "notes", archiveEnabled: true, utm: { enabled: true, domains: [] } };
	const content = {
		_id: "84f1a2b3c4d5e6f7a8b9c0d3",
		kind: "automation",
		format: "rich",
		subject: "Termina tu plan",
		previewText: "",
		html: '<p><a href="https://shop.example.com/pay">Pagar</a></p>',
	};
	assert.equal(getIssueWebUrl({ campaign: content, newsletter: archived }), null);
	const email = buildRecipientEmail({ campaign: content, newsletter: archived, contact, messageId: null });
	assert.match(email.html, /utm_campaign=Termina/);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tests/sending.test.mjs`
Expected: FAIL on the `getIssueWebUrl` assertion (it builds a URL from the subject).

- [ ] **Step 3: No archive URL for automation emails**

In `lib/sending-rules.js` `getIssueWebUrl`, add `campaign.kind === "automation" ||` to the first condition:

```js
	if (!newsletter?.archiveEnabled || !newsletter.slug || !campaign?._id || campaign.kind === "automation" || campaign.archiveListed === false) return null;
```

Run `node --test tests/sending.test.mjs`; expected: PASS. If the UTM assertion fails, read `lib/utm.js` for how `utm_campaign` is encoded and match the assertion to it (the point is that tagging applies).

- [ ] **Step 4: Teach `sendMessageBatch` the automation kind**

In `lib/sending.js`:

1. Import `buildAutomationContent` from `@/lib/automation-variables` and `Automation`, `Enrollment` from the models.
2. Add `const AUTOMATION_KINDS = ["automation"];` near `SIGNUP_KINDS`.
3. In `sendMessageBatch`, widen the find to `kind: { $in: [...CAMPAIGN_MESSAGE_KINDS, ...SIGNUP_KINDS, ...AUTOMATION_KINDS] }`, and load automations and enrollments next to campaigns:

```js
	const [campaigns, newsletters, contacts, suppressedEmails, automations, enrollments] = await Promise.all([
		findByIds(Campaign, messages.map(({ campaignId }) => campaignId)),
		findByIds(Newsletter, messages.map(({ newsletterId }) => newsletterId)),
		findByIds(Contact, messages.map(({ contactId }) => contactId)),
		Suppression.distinct("email", { email: { $in: messages.map(({ email }) => email) } }),
		findByIds(Automation, messages.map(({ automationId }) => automationId)),
		findByIds(Enrollment, messages.map(({ enrollmentId }) => enrollmentId)),
	]);
```

4. Replace the `getMessageContent` call with one that passes the automation pieces:

```js
		const content = getMessageContent({
			kind: message.kind,
			newsletter,
			campaign,
			automation: automations.get(String(message.automationId)),
			enrollment: enrollments.get(String(message.enrollmentId)),
			message,
		});
```

and extend `getMessageContent`:

```js
function getMessageContent({ kind, newsletter, campaign, automation, enrollment, message }) {
	if (kind === "welcome") return getWelcomeContent(newsletter);
	if (kind === "confirmation") return newsletter ? getConfirmationContent(newsletter) : null;
	if (kind === "last-chance") return newsletter ? getLastChanceContent(newsletter) : null;
	if (kind === "automation") {
		// A step deleted after its email was queued has nothing left to send.
		const step = automation?.steps?.find(({ id }) => id === message.stepId);
		if (!step) return null;
		return buildAutomationContent({ automation, step, properties: enrollment?.properties, email: message.email });
	}
	return campaign;
}
```

`campaign` stays `null` for automation messages, so failures take the existing `!campaign` path (marked `failed`, no pause) and `recordSent` skips campaign stats. `ignoredIssues` only grows for `kind === "campaign"`, which is already the case.

5. Make the cap count automation emails that went out in the window, and export the two helpers:

```js
// Welcome, confirmation and automation emails share one cap per newsletter, so a signup or event flood
// can't burn its sending domain's reputation, and a flood on one newsletter doesn't hold up the others.
export function countRecentSignupEmails(newsletter) {
	const since = new Date(Date.now() - WELCOME_WINDOW_MS);
	return Message.countDocuments({
		newsletterId: newsletter._id,
		$or: [
			{ kind: { $in: SIGNUP_KINDS }, createdAt: { $gte: since } },
			{ kind: "automation", sentAt: { $gte: since } },
		],
	});
}
```

and change `async function alertSignupCap` to `export async function alertSignupCap`. Update its alert detail to say "welcome, confirmation and automation emails".

6. Add the test send, after `sendWelcomeTestEmail`:

```js
// Sends one automation email with sample values for its variables, whether or not the automation is on.
export async function sendAutomationTestEmail({ automationId, stepId, to, properties = {} }) {
	assertSendingEnabled();
	if (!isObjectIdString(String(automationId))) throw new Error("Automation not found");

	await connectDb();
	const automation = await Automation.findById(automationId).lean();
	const step = automation?.steps.find(({ id, type }) => id === stepId && type === "email");
	if (!step) throw new Error("Email step not found");
	const newsletter = await Newsletter.findById(automation.newsletterId).lean();
	const content = buildAutomationContent({ automation, step, properties, email: normalizeEmail(to) ?? "" });
	return sendTest({ content, newsletter, to });
}
```

`sendTest` creates a `kind: "test"` Message without `campaignId`, which is what welcome tests do.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
npm run lint
git add lib/sending.js lib/sending-rules.js tests/sending.test.mjs
git commit -m "Send automation emails through the batch sender"
```

---

### Task 6: Runs and the tick

**Files:**
- Create: `lib/automations.js`
- Modify: `app/archive/actions.js`, `app/confirm/actions.js`, `app/api/v1/contacts/route.js`

**Interfaces:**
- Consumes: `advance` (Task 1), `canStartAgain`, `CONTACT_ACTIVE` (Task 3), `sendMessageBatch`, `countRecentSignupEmails`, `alertSignupCap`, `queueWelcomeEmail` (Task 5), `getCampaignPauseReason`, `MAX_BATCH_MESSAGES` (`lib/sending-rules.js`).
- Produces:
  - `startRuns({ newsletter, contact, event, properties = {} }) => Promise<string[]>`: automation ids started.
  - `exitRuns({ contactId, event }) => Promise<number>`: runs ended.
  - `onContactActive({ newsletter, contact, properties }) => Promise<void>`
  - `runAutomationTick({ now = new Date() } = {}) => Promise<{ advanced, completed, exited, queued, sent, failed, suppressed, capped, paused }>`

- [ ] **Step 1: Write `lib/automations.js`**

```js
import "server-only";
import { sendAlert } from "@/lib/alerts";
import { CONTACT_ACTIVE, canStartAgain } from "@/lib/automation-rules";
import { advance } from "@/lib/automation-steps";
import { LIMITS, isSendingEnabled } from "@/lib/config";
import { connectDb } from "@/lib/db";
import { mailboxProvider } from "@/lib/providers";
import { alertSignupCap, countRecentSignupEmails, queueWelcomeEmail, sendMessageBatch } from "@/lib/sending";
import { MAX_BATCH_MESSAGES, chunk, getCampaignPauseReason } from "@/lib/sending-rules";
import Automation from "@/models/Automation";
import Contact from "@/models/Contact";
import Enrollment from "@/models/Enrollment";
import JobRun from "@/models/JobRun";
import Message from "@/models/Message";
import Newsletter from "@/models/Newsletter";

const MAX_RUNS_PER_TICK = 500;
const LOCK_MS = 10 * 60 * 1000;
const HEALTH_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const SENT_STATUSES = ["sent", "delivered", "bounced", "complained"];

function isDuplicateKey(error) {
	return error?.code === 11000;
}

// A run starts on the first step, due now, so its first email goes out on the next tick.
export async function startRuns({ newsletter, contact, event, properties = {} }) {
	if (contact?.status !== "active") return [];
	await connectDb();
	const automations = await Automation.find({
		newsletterId: newsletter._id,
		status: "active",
		"trigger.event": event,
	}).lean();
	const now = new Date();
	const started = [];
	for (const automation of automations) {
		if (automation.steps.length === 0) continue;
		const last = await Enrollment.findOne({ automationId: automation._id, contactId: contact._id })
			.sort({ enrolledAt: -1 })
			.select({ enrolledAt: 1, status: 1 })
			.lean();
		if (last?.status === "active") continue;
		if (!canStartAgain({ reentry: automation.reentry, lastEnrolledAt: last?.enrolledAt ?? null, now })) continue;
		try {
			await Enrollment.create({
				automationId: automation._id,
				newsletterId: newsletter._id,
				contactId: contact._id,
				stepId: automation.steps[0].id,
				stepIndex: 0,
				nextAt: now,
				properties,
				enrolledAt: now,
			});
			started.push(String(automation._id));
		} catch (error) {
			// Two events at once: the one-live-run index lets one of them in.
			if (!isDuplicateKey(error)) throw error;
		}
	}
	return started;
}

// An email the run queued but hasn't sent yet (over the cap, throttled, automation paused) must not go
// out after the event that ends the run, so it's suppressed with it.
function suppressQueued(enrollmentIds) {
	return Message.updateMany(
		{ kind: "automation", enrollmentId: { $in: enrollmentIds }, status: "queued" },
		{ $set: { status: "suppressed" } }
	);
}

export async function exitRuns({ contactId, event }) {
	await connectDb();
	const automationIds = await Automation.distinct("_id", { exitOn: event });
	if (automationIds.length === 0) return 0;
	const filter = { contactId, status: "active", automationId: { $in: automationIds } };
	const enrollmentIds = await Enrollment.distinct("_id", filter);
	if (enrollmentIds.length === 0) return 0;
	const { modifiedCount } = await Enrollment.updateMany(
		{ ...filter, _id: { $in: enrollmentIds } },
		{ $set: { status: "exited", exitReason: event, endedAt: new Date() }, $unset: { nextAt: 1, lockedUntil: 1 } }
	);
	await suppressQueued(enrollmentIds);
	return modifiedCount;
}

// Where a contact joins (website form, confirmation link, API): the welcome email as before, and the
// contact_active automations. CSV imports and dashboard adds don't come through here.
export async function onContactActive({ newsletter, contact, properties = {} }) {
	if (isSendingEnabled()) {
		await queueWelcomeEmail({ newsletter, contact }).catch((error) =>
			console.error(`[automations] Welcome email for ${contact._id} failed:`, error.message)
		);
	}
	await startRuns({ newsletter, contact, event: CONTACT_ACTIVE, properties });
}

async function claimNext(activeIds, now) {
	return Enrollment.findOneAndUpdate(
		{
			status: "active",
			automationId: { $in: activeIds },
			nextAt: { $lte: now },
			$or: [{ lockedUntil: { $exists: false } }, { lockedUntil: { $lte: now } }],
		},
		{ $set: { lockedUntil: new Date(now.getTime() + LOCK_MS) } },
		{ sort: { nextAt: 1 }, returnDocument: "after" }
	).lean();
}

function endRun(enrollment, status, exitReason) {
	return Enrollment.updateOne(
		{ _id: enrollment._id },
		{
			$set: { status, endedAt: new Date(), ...(exitReason && { exitReason }) },
			$unset: { nextAt: 1, lockedUntil: 1 },
		}
	);
}

async function advanceRun({ enrollment, automation, contact, now, totals }) {
	if (contact?.status !== "active") {
		await endRun(enrollment, "exited", contact?.status ?? "deleted");
		await suppressQueued([enrollment._id]);
		totals.exited++;
		return;
	}
	const result = advance({ steps: automation.steps, stepId: enrollment.stepId, stepIndex: enrollment.stepIndex, now });
	const messages = result.emails.map((stepId) => ({
		kind: "automation",
		automationId: automation._id,
		enrollmentId: enrollment._id,
		stepId,
		newsletterId: enrollment.newsletterId,
		contactId: contact._id,
		email: contact.email,
		provider: mailboxProvider(contact.email),
	}));
	if (messages.length > 0) {
		try {
			await Message.insertMany(messages, { ordered: false });
		} catch (error) {
			const codes = (error?.writeErrors ?? []).map(({ err, code }) => err?.code ?? code);
			if (!(codes.length > 0 ? codes.every((code) => code === 11000) : isDuplicateKey(error))) throw error;
		}
		totals.queued += messages.length;
	}
	if (result.status === "completed") {
		await endRun(enrollment, "completed");
		totals.completed++;
		return;
	}
	await Enrollment.updateOne(
		{ _id: enrollment._id },
		{ $set: { stepId: result.stepId, stepIndex: result.stepIndex, nextAt: result.nextAt }, $unset: { lockedUntil: 1 } }
	);
	totals.advanced++;
}

// Bounce and complaint rates over the automation's last 30 days of email, with the campaign limits.
async function pauseUnhealthy(automations, now) {
	const paused = [];
	for (const automation of automations) {
		const [counts] = await Message.aggregate([
			{
				$match: {
					kind: "automation",
					automationId: automation._id,
					sentAt: { $gte: new Date(now.getTime() - HEALTH_WINDOW_MS) },
					status: { $in: SENT_STATUSES },
				},
			},
			{
				$group: {
					_id: null,
					sent: { $sum: 1 },
					bounced: { $sum: { $cond: [{ $eq: ["$status", "bounced"] }, 1, 0] } },
					complained: { $sum: { $cond: [{ $eq: ["$status", "complained"] }, 1, 0] } },
				},
			},
		]);
		const reason = counts ? getCampaignPauseReason(counts) : null;
		if (!reason) continue;
		await Automation.updateOne({ _id: automation._id, status: "active" }, { $set: { status: "paused" } });
		await sendAlert({
			key: `automation-paused-${automation._id}`,
			title: "Automation paused",
			detail: `${automation.name || "Untitled automation"}: ${reason} is over the limit`,
			path: `/automations/${automation._id}`,
			cooldownMinutes: 1,
		});
		paused.push(String(automation._id));
	}
	return paused;
}

// Oldest first, as many per newsletter as the shared signup cap leaves room for.
async function sendQueued(activeIds, totals) {
	const queued = await Message.find({ kind: "automation", status: "queued", automationId: { $in: activeIds } })
		.sort({ createdAt: 1 })
		.limit(MAX_RUNS_PER_TICK)
		.select({ _id: 1, newsletterId: 1 })
		.lean();
	const byNewsletter = Map.groupBy(queued, ({ newsletterId }) => String(newsletterId));
	for (const [newsletterId, messages] of byNewsletter) {
		const newsletter = await Newsletter.findById(newsletterId).select({ name: 1, slug: 1 }).lean();
		if (!newsletter) continue;
		const room = Math.max(0, LIMITS.welcomeEmailsPer10Minutes - (await countRecentSignupEmails(newsletter)));
		if (room < messages.length) {
			totals.capped += messages.length - room;
			await alertSignupCap(newsletter);
		}
		for (const ids of chunk(messages.slice(0, room).map(({ _id }) => String(_id)), MAX_BATCH_MESSAGES)) {
			const result = await sendMessageBatch(ids);
			totals.sent += result.sent;
			totals.failed += result.failed;
			totals.suppressed += result.suppressed;
			if (result.retry) return;
		}
	}
}

export async function runAutomationTick({ now = new Date() } = {}) {
	await connectDb();
	const totals = { advanced: 0, completed: 0, exited: 0, queued: 0, sent: 0, failed: 0, suppressed: 0, capped: 0, paused: [] };
	const active = await Automation.find({ status: "active" }).lean();
	totals.paused = await pauseUnhealthy(active, now);
	const running = active.filter(({ _id }) => !totals.paused.includes(String(_id)));
	const activeIds = running.map(({ _id }) => _id);
	const automationsById = new Map(running.map((automation) => [String(automation._id), automation]));

	for (let count = 0; count < MAX_RUNS_PER_TICK; count++) {
		const enrollment = await claimNext(activeIds, now);
		if (!enrollment) break;
		const contact = await Contact.findById(enrollment.contactId).select({ email: 1, status: 1 }).lean();
		await advanceRun({ enrollment, automation: automationsById.get(String(enrollment.automationId)), contact, now, totals });
	}
	await sendQueued(activeIds, totals);
	await JobRun.updateOne({ _id: "automations-tick" }, { $set: { ranAt: now, result: totals } }, { upsert: true });
	return totals;
}
```

`Map.groupBy` needs Node 21+; `package.json` has `"node": ">=22"`.

- [ ] **Step 2: Call `onContactActive` from the three signup paths**

`app/api/v1/contacts/route.js`. Read `properties` in `readInput`:

```js
	const { newsletter, email, source, resubscribe, ip, properties } = body;
	...
	const read = readProperties(properties);
	if (read.error) return { error: read.error };
	return { ..., properties: read.properties };
```

(import `readProperties` from `@/lib/automation-rules`). Replace the email block in `POST` with:

```js
	const isPending = contact.status === "pending";
	if (isPending && isSendingEnabled()) {
		after(() =>
			queueConfirmationEmail({ newsletter, contact }).catch((error) =>
				console.error(`[api/contacts] Confirmation email for ${contact._id} failed:`, error.message)
			)
		);
	}
	if (created && contact.status === "active") {
		after(() =>
			onContactActive({ newsletter, contact, properties: input.properties }).catch((error) =>
				console.error(`[api/contacts] Automations for ${contact._id} failed:`, error.message)
			)
		);
	}
```

Drop the now unused `queueWelcomeEmail` import.

A contact who signs up pending and confirms later loses the properties. For v1 that's acceptable: the Pandy Hosts newsletter doesn't confirm. Note it in the README section (Task 10).

`app/archive/actions.js`: same split. Confirmation branch unchanged; replace the welcome branch with `onContactActive({ newsletter, contact })` inside `after`, keeping the `created && contact.status === "active"` condition. Remove `isSendingEnabled` from the active branch (it moved into `onContactActive`).

`app/confirm/actions.js`: replace `queueWelcomeEmail` with `onContactActive({ newsletter, contact })`, and the condition `confirmed && isSendingEnabled()` with `confirmed`.

- [ ] **Step 3: Check the wiring compiles**

Run: `npm run build`
Expected: build succeeds. Fix import errors before moving on.

- [ ] **Step 4: Commit**

```bash
npm run lint && npm test
git add lib/automations.js app/api/v1/contacts/route.js app/archive/actions.js app/confirm/actions.js
git commit -m "Start, advance and end automation runs"
```

The tick is exercised end to end in Task 7, Step 3.

---

### Task 7: Tick endpoint and timer

**Files:**
- Create: `app/api/jobs/automations-tick/route.js`, `deploy/systemd/mailcheap-automations.service`, `deploy/systemd/mailcheap-automations.timer`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `runAutomationTick` (Task 6).

- [ ] **Step 1: Write the route**

```js
// app/api/jobs/automations-tick/route.js
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runAutomationTick } from "@/lib/automations";
import { isSendingEnabled } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(request) {
	const secret = process.env.CRON_SECRET;
	const given = request.headers.get("authorization") ?? "";
	const expected = `Bearer ${secret}`;
	return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

// Called every 5 minutes by the server's systemd timer (deploy/systemd). Each result is logged: it's
// the trace of what the automations did and when.
export async function POST(request) {
	if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
	if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	if (!isSendingEnabled()) return NextResponse.json({ error: "Sending is off" }, { status: 409 });

	const result = await runAutomationTick();
	console.info(`[automations] ${JSON.stringify(result)}`);
	return NextResponse.json(result);
}
```

`proxy.js` already lists `/api/jobs/` and `/api/v1/` in `PUBLIC_PATHS`, so the tick and events routes need no proxy change; they authenticate themselves.

- [ ] **Step 2: Write the units and the env example**

```ini
# deploy/systemd/mailcheap-automations.service
[Unit]
Description=Mailcheap automations tick
After=mailcheap.service

[Service]
Type=oneshot
EnvironmentFile=/etc/mailcheap/mailcheap.env
ExecStart=/bin/sh -c 'curl -fsS -m 290 -X POST -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/jobs/automations-tick'
```

```ini
# deploy/systemd/mailcheap-automations.timer
[Unit]
Description=Run the Mailcheap automations tick every 5 minutes

[Timer]
OnCalendar=*:0/5
Persistent=true

[Install]
WantedBy=timers.target
```

Add to `.env.example`:

```
# Automations: the tick endpoint's secret. The server's systemd timer sends it (deploy/systemd).
CRON_SECRET=
```

- [ ] **Step 3: End-to-end check against local Mongo**

With `SENDING_ENABLED=false` the endpoint answers 409, so test the engine with a script that calls the tick without sending. Run `npm run dev` with `CRON_SECRET=dev-secret` in `.env.local`, then:

```bash
curl -s -X POST -H "Authorization: Bearer wrong" localhost:3000/api/jobs/automations-tick   # {"error":"Unauthorized"}
curl -s -X POST -H "Authorization: Bearer dev-secret" localhost:3000/api/jobs/automations-tick  # 409 "Sending is off", or a totals object
```

If local sending is configured (SES sandbox, verified test address), seed one active automation (`contact_active`, steps: email, wait 0.0167 h, email) and one enrollment for a test contact with `nextAt` now through `mongosh`, call the tick twice a minute apart, and confirm in Mongo: two `automation` Messages, the enrollment `completed`. Without local SES, this check moves to the server in Task 10.

- [ ] **Step 4: Commit**

```bash
npm run lint && npm test
git add app/api/jobs/automations-tick/route.js deploy/systemd .env.example
git commit -m "Add the automations tick endpoint and systemd timer"
```

---

### Task 8: Events API

**Files:**
- Create: `app/api/v1/events/route.js`

**Interfaces:**
- Consumes: `authenticateRequest`, `isRateLimited`, `normalizeEmail`, `isPlainObject`, `readEventName`, `readProperties`, `exitRuns`, `startRuns`.

- [ ] **Step 1: Write the route**

```js
// app/api/v1/events/route.js
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-keys";
import { readEventName, readProperties } from "@/lib/automation-rules";
import { exitRuns, startRuns } from "@/lib/automations";
import { connectDb } from "@/lib/db";
import { isRateLimited } from "@/lib/rate-limit";
import { isPlainObject, normalizeEmail } from "@/lib/validation";
import Contact from "@/models/Contact";
import Newsletter from "@/models/Newsletter";

// Events can start runs that send email, so a leaked key can't be used to flood a list.
const PER_KEY = { name: "api-events-key", limit: 3000, window: "1 h" };

function fail(status, error) {
	return NextResponse.json({ error }, { status });
}

function readInput(body) {
	if (!isPlainObject(body)) return { error: "Send a JSON object" };
	if (typeof body.newsletter !== "string" || !body.newsletter.trim()) return { error: "newsletter is required" };
	const email = normalizeEmail(body.email);
	if (!email) return { error: "email is invalid" };
	const event = readEventName(body.event);
	if (!event) return { error: "event must be lowercase letters, digits and _ (up to 50), and not contact_active" };
	const { properties, error } = readProperties(body.properties);
	if (error) return { error };
	return { slug: body.newsletter.trim().toLowerCase(), email, event, properties };
}

// Events act on contacts already in the newsletter: they end the runs that exit on them, then start
// the automations they trigger. They never add anyone to the list.
export async function POST(request) {
	const apiKey = await authenticateRequest(request);
	if (!apiKey) return fail(401, "Invalid API key");
	const input = readInput(await request.json().catch(() => null));
	if (input.error) return fail(400, input.error);
	if (await isRateLimited({ ...PER_KEY, key: String(apiKey._id) })) return fail(429, "Too many events, try again later");

	await connectDb();
	const newsletter = await Newsletter.findOne({ slug: input.slug }).lean();
	if (!newsletter) return fail(404, "Newsletter not found");
	const contact = await Contact.findOne({ newsletterId: newsletter._id, email: input.email }).lean();
	if (!contact) return NextResponse.json({ matched: false });

	const exited = await exitRuns({ contactId: contact._id, event: input.event });
	const started = await startRuns({ newsletter, contact, event: input.event, properties: input.properties });
	return NextResponse.json({ matched: true, started, exited });
}
```

- [ ] **Step 2: Check it against the dev server**

Create an API key in the dashboard (`/api-keys`), then:

```bash
KEY=...; curl -s localhost:3000/api/v1/events -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"newsletter":"medical","email":"nobody@example.com","event":"plan_checkout_started"}'
# {"matched":false}
curl -s localhost:3000/api/v1/events -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"newsletter":"medical","email":"x@example.com","event":"contact_active"}'
# 400 with the event message
```

Then check that an exit event stops an email that is queued but not yet sent. In `mongosh`, for a test contact in a test newsletter with an active automation that exits on `test_exit`:

```js
const e = db.enrollments.insertOne({ automationId: A, newsletterId: N, contactId: C, status: "active", stepId: null, stepIndex: 9, nextAt: new Date(Date.now() + 864e5), properties: {}, enrolledAt: new Date() }).insertedId;
db.messages.insertOne({ kind: "automation", automationId: A, enrollmentId: e, stepId: "aaaaaaaaaaaa", newsletterId: N, contactId: C, email: "test@example.com", status: "queued", createdAt: new Date() });
```

POST `{"event":"test_exit"}` for that contact. Expected: the response has `exited: 1`, the enrollment is `exited` / `test_exit`, and the message is `suppressed`.

`authenticateRequest` reads `Authorization: Bearer <key>` (`lib/api-keys.js:9`).

- [ ] **Step 3: Commit**

```bash
npm run lint && npm test
git add app/api/v1/events/route.js
git commit -m "Add the events API"
```

---

### Task 9: Dashboard

**Files:**
- Create: `app/(app)/automations/(list)/page.js`, `app/(app)/automations/[id]/page.js`, `app/(app)/automations/actions.js`, `components/ButtonNewAutomation.jsx`, `components/FormAutomation.jsx`, `components/CardAutomationStep.jsx`, `components/ReportAutomation.jsx`
- Modify: `components/NavLinks.jsx`, `components/MenuFormat.jsx`, `components/DialogInsertButton.jsx`

**Interfaces:**
- Consumes: `readAutomationInput`, `getAutomationProblem`, `newStepId`, `listVariables`, `buildAutomationContent`, `sendAutomationTestEmail`, `getSendProblem`, `useAutosave`, `EditorRich`, `HeaderPage`, `BadgeStatus`, `StateEmpty`, `components/ui/*`.
- Produces server actions in `app/(app)/automations/actions.js`:
  - `createAutomation(newsletterId)`: redirects to the editor.
  - `saveAutomation(id, values) => { ok } | { error }`
  - `setAutomationStatus(id, status: "active" | "paused") => { ok } | { error }`
  - `sendAutomationTest(id, stepId, properties) => { ok } | { error }`
  - `deleteAutomation(id)`: only drafts, or paused automations with no active runs; redirects to the list.

Before writing, read `components/ButtonNewCampaign.jsx`, `components/TableCampaigns.jsx` and `components/FormNewsletter.jsx` for the list, dropdown and form idioms, and copy them.

- [ ] **Step 1: Let link fields accept a variable**

In both `normalizeUrl` functions (`components/MenuFormat.jsx:168`, `components/DialogInsertButton.jsx:106`), return the value unchanged when it is a whole variable:

```js
	if (/^\{\{\s*[a-z][a-z0-9_]*\s*(\|[^}]*)?\}\}$/.test(url)) return url;
```

Then in the dev server, in a campaign draft, set a link to `{{checkout_url}}` and check with the browser devtools that the saved HTML has `href="{{checkout_url}}"` and not `%7B%7B` or `https://{{`. If Tiptap's Link rejects or encodes it, set `isAllowedUri` in the StarterKit `link` config of `components/EditorRich.jsx` to allow that same pattern on top of the default check, and test again. Campaigns don't fill variables, so in a campaign such a link renders without its `href` (the cleaner drops non-http hrefs). That's harmless; the variables list only shows up in the automation editor.

- [ ] **Step 2: Server actions**

```js
// app/(app)/automations/actions.js
"use server";

import { isValidObjectId } from "mongoose";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { getAutomationProblem, readAutomationInput } from "@/lib/automation-rules";
import { buildAutomationContent } from "@/lib/automation-variables";
import { isSendingEnabled } from "@/lib/config";
import { connectDb } from "@/lib/db";
import { sendAutomationTestEmail } from "@/lib/sending";
import { getSendProblem } from "@/lib/sending-rules";
import Automation from "@/models/Automation";
import Enrollment from "@/models/Enrollment";
import Newsletter from "@/models/Newsletter";

async function findAutomation(id) {
	await requireSession();
	if (!isValidObjectId(id)) return null;
	await connectDb();
	return Automation.findById(id).lean();
}

function revalidate(id) {
	revalidatePath("/automations");
	revalidatePath(`/automations/${id}`);
}

export async function createAutomation(newsletterId) {
	await requireSession();
	if (!isValidObjectId(newsletterId)) return { error: "Newsletter not found" };
	await connectDb();
	if (!(await Newsletter.exists({ _id: newsletterId }))) return { error: "Newsletter not found" };
	const automation = await Automation.create({ newsletterId, name: "Untitled automation" });
	revalidatePath("/automations");
	redirect(`/automations/${automation._id}`);
}

// Saves apply to running automations too: runs keep their place by step id (lib/automation-steps.js).
export async function saveAutomation(id, values) {
	const automation = await findAutomation(id);
	if (!automation) return { error: "Automation not found" };
	const input = readAutomationInput(values);
	if (input.error) return { error: input.error };
	if (automation.status === "active") {
		const problem = getAutomationProblem(input.automation);
		if (problem) return { error: `${problem}, or pause the automation first` };
	}
	await Automation.updateOne({ _id: automation._id }, { $set: input.automation });
	revalidate(id);
	return { ok: true };
}

export async function setAutomationStatus(id, status) {
	const automation = await findAutomation(id);
	if (!automation) return { error: "Automation not found" };
	if (!["active", "paused"].includes(status)) return { error: "Unknown status" };
	if (status === "active") {
		const problem = getAutomationProblem(automation);
		if (problem) return { error: problem };
		const newsletter = await Newsletter.findById(automation.newsletterId).lean();
		for (const step of automation.steps.filter(({ type }) => type === "email")) {
			const content = buildAutomationContent({ automation, step, properties: {}, email: newsletter.fromEmail });
			const sendProblem = getSendProblem({ campaign: content, newsletter });
			if (sendProblem) return { error: `Step ${automation.steps.indexOf(step) + 1}: ${sendProblem}` };
		}
	}
	await Automation.updateOne({ _id: automation._id }, { $set: { status } });
	revalidate(id);
	return { ok: true };
}

export async function sendAutomationTest(id, stepId, properties) {
	const automation = await findAutomation(id);
	if (!automation) return { error: "Automation not found" };
	if (!isSendingEnabled()) return { error: "Sending is off" };
	try {
		await sendAutomationTestEmail({ automationId: automation._id, stepId, to: process.env.ADMIN_EMAIL, properties });
		return { ok: true };
	} catch (error) {
		return { error: error.message || "Sending failed" };
	}
}

export async function deleteAutomation(id) {
	const automation = await findAutomation(id);
	if (!automation) return { error: "Automation not found" };
	if (automation.status === "active") return { error: "Pause the automation first" };
	if (await Enrollment.exists({ automationId: automation._id, status: "active" })) {
		return { error: "People are still in this automation. Leave it paused, or wait until they finish." };
	}
	await Automation.deleteOne({ _id: automation._id });
	revalidatePath("/automations");
	redirect("/automations");
}
```

`sendAutomationTest`'s `properties` come from the editor's sample fields. Run them through `readProperties` and return its error if any.

- [ ] **Step 3: Nav item and list page**

In `components/NavLinks.jsx`, import `Workflow` from `lucide-react` and add `{ href: "/automations", label: "Automations", icon: Workflow }` after Campaigns.

`app/(app)/automations/(list)/page.js`: server component.
- Loads automations (sorted by `createdAt: -1`), newsletters (`NEWSLETTER_SUMMARY_FIELDS`), enrollment counts per automation and status (`Enrollment.aggregate([{ $group: { _id: { a: "$automationId", s: "$status" }, n: { $sum: 1 } } }])`), and `JobRun.findById("automations-tick")`.
- Renders `HeaderPage title="Automations"` with `<ButtonNewAutomation newsletters={toNewsletterOptions(newsletters)} />`, which is a copy of `ButtonNewCampaign` calling `createAutomation`.
- Below it, a `components/ui/table` with columns Name (link to `/automations/[id]`), Newsletter, Trigger (`contact_active` shown as "Joins the list", else the event name in `font-mono`), Status (`BadgeStatus`), In progress, Completed, Exited.
- `StateEmpty icon={Workflow} title="No automations yet"` when empty.
- When sending is off (`isSendingEnabled()` false) and an automation is active: an amber notice "Sending is off, so automations are waiting." Otherwise, when at least one automation is active and `JobRun.ranAt` is missing or older than 30 minutes, an amber notice above the table: "The automations timer hasn't run since {time}. Runs are waiting. Check `systemctl status mailcheap-automations.timer` on the server."

Add `active: "green"`, `paused: "amber"`, `completed: "blue"`, `exited: "gray"` to `STATUS_TONES` in `components/BadgeStatus.jsx` if they're missing.

- [ ] **Step 4: Editor page and form**

`app/(app)/automations/[id]/page.js`: server component, like `app/(app)/campaigns/[id]/page.js`. It loads the automation and its newsletter, plus the report data for Step 5. It passes `automation`, `newsletter`, `isSendingEnabled()`, `testEmail={process.env.ADMIN_EMAIL}` and the report data to `FormAutomation`. `notFound()` on a bad id.

`components/FormAutomation.jsx` (client):
- State `values = { name, trigger, exitOn, reentry, steps }` from the automation. `useAutosave(values, save)` with `save = (snapshot) => saveAutomation(automation._id, snapshot)`. `useAutosave` compares top-level keys with `===`, so update by replacing `steps`/`exitOn`/`reentry` with new arrays and objects, never mutating them.
- Header: `HeaderPage` with `backHref="/automations"`, the name as an inline `Input`, `BadgeStatus`, the save state ("Saving…", "Saved", the error), and an Activate or Pause button calling `setAutomationStatus` (toast on `error`). A dropdown has Delete (calls `deleteAutomation`).
- Settings card:
  - Trigger: a `Select` with "Joins the list (contact_active)" and "An event…". The second shows an `Input` for the event name (`font-mono`, placeholder `plan_checkout_started`).
  - Exit events: an `Input` that adds a chip on Enter or comma, and chips with an × to remove.
  - Re-entry: a `Switch` "Can start again", which when on shows "after [N] days". Turning it on sets `cooldownDays: 7`; `readAutomationInput` treats a missing number as "never".
  - Newsletter: read-only text with the newsletter name.
- Steps: an ordered list of `CardAutomationStep`. While the automation is active, adding, deleting and reordering steps is disabled, with the hint "Pause to add or remove steps". Otherwise `saveAutomation` would refuse every autosave until a new email step has a subject. Text edits to existing steps stay live. Between and after the cards, "+ Wait" / "+ Email" buttons insert `{ id: newStepId(), type: "wait", hours: 24 }` or `{ id: newStepId(), type: "email", subject: "", previewText: "", html: "" }` at that position.
  `newStepId` uses `node:crypto`, which doesn't belong in a client bundle. Add `export function newClientStepId()` to `components/FormAutomation.jsx` instead (`crypto.getRandomValues(new Uint8Array(6))` → hex), and keep `lib/automation-steps.js`'s `newStepId` for server code and tests.
- `onBeforeUnload` and Cmd+S flush, copied from `FormCampaign.jsx`.

`components/CardAutomationStep.jsx` (client), props `{ step, index, count, savedLinks, onChange, onMove, onDelete, onTest, isSendingEnabled }`:
- Wait: "Wait [number] [hours|days]". Store hours; days ×24.
- Email: Subject and Preview `Input`s, and `EditorRich content={step.html} onChange={(html) => onChange({ ...step, html })} savedLinks={savedLinks}`. A side note lists the variables: `listVariables([step.subject, step.previewText, step.html])`, plus a line explaining `{{key|fallback}}` and that links can be `{{checkout_url}}`. A "Send test" button opens a `Dialog` with one `Input` per listed variable (sample values) and calls `onTest(step.id, values)`.
- Up/down buttons (disabled at the ends) and a delete button. EditorRich takes `content` only on mount, so key the editor by `step.id` so reordering doesn't swap contents.

`FormAutomation` wires `onTest` to `sendAutomationTest(automation._id, stepId, values)` after `flush()`, with toasts like `FormCampaign.sendTest`.

- [ ] **Step 5: Report**

In `app/(app)/automations/[id]/page.js`, load:

```js
	const [stepStats, runs] = await Promise.all([
		Message.aggregate([
			{ $match: { kind: "automation", automationId: automation._id } },
			{
				$group: {
					_id: "$stepId",
					sent: { $sum: { $cond: [{ $ifNull: ["$sentAt", false] }, 1, 0] } },
					opened: { $sum: { $cond: [{ $ifNull: ["$openedAt", false] }, 1, 0] } },
					clicked: { $sum: { $cond: [{ $ifNull: ["$clickedAt", false] }, 1, 0] } },
					failed: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } },
				},
			},
		]),
		Enrollment.find({ automationId: automation._id }).sort({ enrolledAt: -1 }).limit(50).lean(),
	]);
```

plus the contacts' emails for those runs (`Contact.find({ _id: { $in: runs.map(r => r.contactId) } }).select("email")`). Pass `serialize(...)` versions to `components/ReportAutomation.jsx`, which `FormAutomation` renders under the steps:
- Per email step (by id, in step order, numbered like the editor): Sent, Opened (and % of sent), Clicked (and %), Failed.
- Latest runs table: Contact, Step ("Step N" from `stepIndex + 1`, or "—" when ended), Status badge, Exit reason, Started (`formatDate` or whatever `lib/format.js` offers).

- [ ] **Step 6: Check it in the browser**

Run `npm run dev` and log in. Then:
1. Create an automation on a test newsletter.
2. Add Email → Wait 1 hour → Email.
3. Use `{{name|hola}}` in a subject and a button to `{{checkout_url}}`.
4. Reload: the steps, the order and the variables list persist.
5. Activate with an empty subject: it's refused with "Add a subject to step 1". Fill it in and activate: the badge turns Active.
6. Pause, then delete: you're back on the list page.
7. If sending works locally, send a test with sample values and check that the email has the name and a working https button.

Use the `run` or `claude-in-chrome` skill to drive this, and record the run as a GIF if it's useful to the user.

- [ ] **Step 7: Commit**

```bash
npm run lint && npm test && npm run build
git add "app/(app)/automations" components/ButtonNewAutomation.jsx components/FormAutomation.jsx components/CardAutomationStep.jsx components/ReportAutomation.jsx components/NavLinks.jsx components/MenuFormat.jsx components/DialogInsertButton.jsx components/EditorRich.jsx components/BadgeStatus.jsx
git commit -m "Add the automations dashboard"
```

---

### Task 10: Docs, deploy, live check

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README**

Add an "Automations" section after the API section:
- What triggers exist (`contact_active` from the website form, the confirmation link and `POST /api/v1/contacts`; events from `POST /api/v1/events`).
- The events request and response, with an example.
- Variables (`{{key|fallback}}`, href https-only).
- Re-entry and exit events.
- The timer: `CRON_SECRET`, the two unit files, install commands.
- Caveats: CSV imports and dashboard adds start no runs; properties sent with a signup to a newsletter that confirms signups are not kept.

Commit: `git commit -am "Document automations"`.

- [ ] **Step 2: Deploy (ask the user before this step: it changes production)**

On `ubuntu@140.84.187.2`, following how earlier deploys were done:

```bash
cd /opt/mailcheap && git fetch && git checkout automations && git pull && npm ci && npm run build
sudo sh -c 'grep -q ^CRON_SECRET= /etc/mailcheap/mailcheap.env || echo "CRON_SECRET=$(openssl rand -hex 32)" >> /etc/mailcheap/mailcheap.env'
sudo systemctl restart mailcheap
sudo cp deploy/systemd/mailcheap-automations.* /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now mailcheap-automations.timer
systemctl list-timers mailcheap-automations.timer
sudo systemctl start mailcheap-automations.service && journalctl -u mailcheap-automations.service -n 5 --no-pager
```

Expected: the service log shows a JSON totals object, and the Automations page shows no timer warning. The Mongo indexes are created by Mongoose on first use; confirm `enrollmentId_1_stepId_1` exists with `mongosh mailcheap --eval 'db.messages.getIndexes().map(i => i.name)'`.

- [ ] **Step 3: Live check**

1. In the dashboard, create a `Pandy Hosts` newsletter (slug `hosts`, `requireConfirmation` off, same from address and postal address as Pandy Medical).
2. Create the automation "Prueba abandono": trigger `plan_checkout_started`, exit on `plan_purchased`, re-entry after 1 day. Steps: Email "Hola {{name|tú}}" with a button to `{{checkout_url}}` → Wait `0.0167` hours (type it in the hours field) → Email "Último aviso". Activate it.
3. Add the user's own address to `hosts` via `POST /api/v1/contacts` with `properties: { name: "Alan" }`.
4. Send `plan_checkout_started` with `{ "checkout_url": "https://tickets.pandy.cloud/" }`. The response has `started: [id]`.
5. Within 5 minutes the first email arrives, with the name and a working tracked button. About 5 minutes later the second one arrives, and the run shows `completed` in the report.
6. Run again with a second test address: send `plan_checkout_started`, then `plan_purchased` before the first tick. The response has `exited: 1`, the run shows `exited` / `plan_purchased`, and no email arrives.
7. Unsubscribe from the first email, then send `plan_checkout_started` for that address: `started: []`.

Record each result. Delete the test automation and contacts afterwards, or leave them paused if the user prefers.

- [ ] **Step 4: Finish**

Use `superpowers:finishing-a-development-branch` to merge or open a PR.
