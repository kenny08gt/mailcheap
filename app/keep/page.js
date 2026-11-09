import { cache } from "react";
import { Link2Off } from "lucide-react";
import CardNotice from "@/components/CardNotice";
import FormKeep from "@/components/FormKeep";
import { getArchiveUrls } from "@/lib/archive-hosts";
import { connectDb } from "@/lib/db";
import { verifyKeepToken } from "@/lib/last-chance";
import { getLanguage, getSubscriberStrings } from "@/lib/subscriber-strings";
import Newsletter from "@/models/Newsletter";

// The URL carries the keep token: keep it out of search results and referrer headers.
export async function generateMetadata({ searchParams }) {
	const { newsletter } = await getKeep((await searchParams).token);
	return {
		title: getSubscriberStrings(getLanguage(newsletter)).keep.pageTitle,
		robots: { index: false, follow: false },
		referrer: "no-referrer",
	};
}

export default async function KeepPage({ searchParams }) {
	const { token, newsletter } = await getKeep((await searchParams).token);
	// Without a newsletter (an expired or broken link), the page stays Spanish.
	const language = getLanguage(newsletter);
	const strings = getSubscriberStrings(language);

	return (
		<main lang={language} className="flex min-h-dvh items-center justify-center bg-background px-4 py-16">
			{newsletter ? (
				<FormKeep
					token={token}
					language={language}
					newsletterName={newsletter.name}
					archiveUrl={newsletter.archiveEnabled ? getArchiveUrls(newsletter).siteIndex : null}
				/>
			) : (
				<CardNotice icon={Link2Off} title={strings.brokenLinkTitle}>
					{strings.keep.expired}
				</CardNotice>
			)}
		</main>
	);
}

// The metadata and the page both need the newsletter: one query per request.
const getKeep = cache(async (token) => {
	const validToken = typeof token === "string" ? token : null;
	const reference = verifyKeepToken(validToken);
	const newsletter = reference ? await getNewsletter(reference.newsletterId) : null;
	return { token: validToken, newsletter };
});

async function getNewsletter(newsletterId) {
	try {
		await connectDb();
		return await Newsletter.findById(newsletterId)
			.select({ name: 1, slug: 1, archiveEnabled: 1, language: 1 })
			.lean();
	} catch (error) {
		console.error("[keep] Could not load the newsletter:", error.message);
		return null;
	}
}
