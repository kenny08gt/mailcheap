import { isValidObjectId } from "mongoose";
import { notFound } from "next/navigation";
import FormAutomation from "@/components/FormAutomation";
import { isSendingEnabled } from "@/lib/config";
import { connectDb } from "@/lib/db";
import { serialize } from "@/lib/serialize";
import Automation from "@/models/Automation";
import Contact from "@/models/Contact";
import Enrollment from "@/models/Enrollment";
import Message from "@/models/Message";
import Newsletter from "@/models/Newsletter";

export const metadata = { title: "Automation" };

export default async function AutomationPage({ params }) {
	const { id } = await params;
	if (!isValidObjectId(id)) notFound();

	await connectDb();
	const automation = await Automation.findById(id).lean();
	if (!automation) notFound();
	const newsletter = await Newsletter.findById(automation.newsletterId).lean();
	if (!newsletter) notFound();

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
	const contacts = await Contact.find({ _id: { $in: runs.map(({ contactId }) => contactId) } })
		.select("email")
		.lean();
	const emails = new Map(contacts.map(({ _id, email }) => [String(_id), email]));

	return (
		<FormAutomation
			automation={serialize(automation)}
			newsletter={serialize(newsletter)}
			isSendingEnabled={isSendingEnabled()}
			testEmail={process.env.ADMIN_EMAIL}
			report={{
				stepStats: serialize(stepStats),
				runs: serialize(runs).map((run) => ({ ...run, email: emails.get(run.contactId) ?? null })),
			}}
		/>
	);
}
