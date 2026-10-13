"use server";

import { after } from "next/server";
import { onContactActive } from "@/lib/automations";
import { verifyConfirmToken } from "@/lib/confirmation";
import { confirmContact } from "@/lib/contacts";
import { connectDb } from "@/lib/db";
import Newsletter from "@/models/Newsletter";

export async function confirmSubscription(token) {
	const reference = verifyConfirmToken(token);
	if (!reference) return { error: "invalid" };

	await connectDb();
	const { contact, confirmed } = await confirmContact(reference);
	if (contact?.status !== "active") return { error: "invalid" };

	if (confirmed) {
		const newsletter = await Newsletter.findById(reference.newsletterId).lean();
		// The welcome email is skipped while the newsletter confirms signups: the confirmation was their one email.
		after(() =>
			onContactActive({ newsletter, contact }).catch((error) =>
				console.error(`[confirm] Automations for ${contact._id} failed:`, error.message)
			)
		);
	}
	return { ok: true };
}
