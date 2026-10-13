"use server";

import { isValidObjectId } from "mongoose";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { getAutomationProblem, readAutomationInput, readProperties } from "@/lib/automation-rules";
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

async function findSendProblem(automation) {
	const problem = getAutomationProblem(automation);
	if (problem) return problem;
	const newsletter = await Newsletter.findById(automation.newsletterId).lean();
	for (const [index, step] of automation.steps.entries()) {
		if (step.type !== "email") continue;
		const content = buildAutomationContent({ automation, step, properties: {}, email: newsletter.fromEmail });
		const sendProblem = getSendProblem({ campaign: content, newsletter });
		if (sendProblem) return `Step ${index + 1}: ${sendProblem}`;
	}
	return null;
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

export async function saveAutomation(id, values) {
	const automation = await findAutomation(id);
	if (!automation) return { error: "Automation not found" };
	const input = readAutomationInput(values);
	if (input.error) return { error: input.error };
	if (automation.status === "active") {
		const problem = await findSendProblem({ ...automation, ...input.automation });
		if (problem) return { error: `${problem.replace(/\.$/, "")}, or pause the automation first` };
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
		const problem = await findSendProblem(automation);
		if (problem) return { error: problem };
	}

	await Automation.updateOne({ _id: automation._id }, { $set: { status } });
	revalidate(id);
	return { ok: true };
}

export async function sendAutomationTest(id, stepId, properties) {
	const automation = await findAutomation(id);
	if (!automation) return { error: "Automation not found" };
	if (!isSendingEnabled()) return { error: "Sending is off" };
	const sample = readProperties(properties);
	if (sample.error) return { error: sample.error };

	try {
		await sendAutomationTestEmail({
			automationId: automation._id,
			stepId,
			to: process.env.ADMIN_EMAIL,
			properties: sample.properties,
		});
		return { ok: true };
	} catch (error) {
		console.error("[automations] Test send failed:", error);
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
	await Enrollment.deleteMany({ automationId: automation._id });
	revalidatePath("/automations");
	redirect("/automations");
}
