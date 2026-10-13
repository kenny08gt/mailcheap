export const HOUR_MS = 60 * 60 * 1000;

export function newStepId() {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// The run's place is its step id, so edits elsewhere in the list don't move it. When that step was
// deleted, the saved index points at whatever moved into its place.
export function findPosition(steps, stepId, stepIndex) {
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
