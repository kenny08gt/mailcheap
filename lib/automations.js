import "server-only";
import { sendAlert } from "@/lib/alerts";
import { CONTACT_ACTIVE, canStartAgain } from "@/lib/automation-rules";
import { advance } from "@/lib/automation-steps";
import { LIMITS, isSendingEnabled } from "@/lib/config";
import { connectDb } from "@/lib/db";
import { mailboxProvider } from "@/lib/providers";
import {
	alertSignupCap,
	countRecentSignupEmails,
	insertIgnoringDuplicates,
	queueWelcomeEmail,
	sendMessageBatch,
} from "@/lib/sending";
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

// A run starts on the first step, due now, so its first email goes out on the next tick.
export async function startRuns({ newsletter, contact, event, properties = {} }) {
	if (contact.status !== "active") return [];
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
			if (error?.code !== 11000) throw error;
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

function claimNext(activeIds, now) {
	return Enrollment.findOneAndUpdate(
		{
			status: "active",
			automationId: { $in: activeIds },
			nextAt: { $lte: now },
			lockedUntil: { $not: { $gt: now } },
		},
		{ $set: { lockedUntil: new Date(now.getTime() + LOCK_MS) } },
		{ sort: { nextAt: 1 }, returnDocument: "after" }
	).lean();
}

// Only a live run moves: an exit event that lands while the tick holds the claim wins, and the tick
// must not bring the run back. False when the run was ended under us.
async function updateRun(enrollment, update) {
	const { matchedCount } = await Enrollment.updateOne({ _id: enrollment._id, status: "active" }, update);
	return matchedCount > 0;
}

function endRun(enrollment, status, exitReason) {
	return updateRun(enrollment, {
		$set: { status, endedAt: new Date(), ...(exitReason && { exitReason }) },
		$unset: { nextAt: 1, lockedUntil: 1 },
	});
}

// A tick retried after a crash: the one-email-per-step index keeps the earlier rows.
function queueEmails({ enrollment, automation, contact, stepIds }) {
	return insertIgnoringDuplicates(
		stepIds.map((stepId) => ({
			kind: "automation",
			automationId: automation._id,
			enrollmentId: enrollment._id,
			stepId,
			newsletterId: enrollment.newsletterId,
			contactId: contact._id,
			email: contact.email,
			provider: mailboxProvider(contact.email),
		}))
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
	await queueEmails({ enrollment, automation, contact, stepIds: result.emails });
	totals.queued += result.emails.length;
	const moved =
		result.status === "completed"
			? await endRun(enrollment, "completed")
			: await updateRun(enrollment, {
					$set: { stepId: result.stepId, stepIndex: result.stepIndex, nextAt: result.nextAt },
					$unset: { lockedUntil: 1 },
				});
	if (!moved) {
		// exitRuns ended it between the claim and the insert, so its suppression missed these emails.
		await suppressQueued([enrollment._id]);
		return;
	}
	if (result.status === "completed") totals.completed++;
	else totals.advanced++;
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
			totals.skipped += result.skipped;
			if (result.retry) return;
		}
	}
}

export async function runAutomationTick({ now = new Date() } = {}) {
	await connectDb();
	const totals = {
		advanced: 0,
		completed: 0,
		exited: 0,
		queued: 0,
		sent: 0,
		failed: 0,
		suppressed: 0,
		skipped: 0,
		capped: 0,
		paused: [],
	};
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
