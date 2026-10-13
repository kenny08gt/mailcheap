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

function isHeaderSafe(value) {
	return !/[\r\n\0]/.test(value);
}

function isPropertyValue(value) {
	if (typeof value === "string") return value.length <= MAX_PROPERTY_LENGTH && isHeaderSafe(value);
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
