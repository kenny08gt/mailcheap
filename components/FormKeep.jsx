"use client";

import { useActionState, useEffect, useRef } from "react";
import { HeartHandshake, Link2Off, Loader2, MailCheck } from "lucide-react";
import { keepSending } from "@/app/keep/actions";
import CardNotice from "@/components/CardNotice";
import { Button } from "@/components/ui/button";
import { getSubscriberStrings } from "@/lib/subscriber-strings";

// Link scanners open the page without submitting forms, so only a person's browser says yes.
export default function FormKeep({ token, language, newsletterName, archiveUrl }) {
	const strings = getSubscriberStrings(language).keep;
	const [state, action, isPending] = useActionState(keepSending.bind(null, token), null);
	const formRef = useRef(null);

	useEffect(() => {
		formRef.current?.requestSubmit();
	}, []);

	if (state?.ok) {
		return (
			<CardNotice icon={MailCheck} tone="success" title={strings.doneTitle(newsletterName)}>
				{strings.done}
				{archiveUrl && (
					<Button asChild size="lg" variant="outline" className="mt-6 w-full">
						<a href={archiveUrl}>{strings.archive}</a>
					</Button>
				)}
			</CardNotice>
		);
	}

	if (state?.error === "invalid") {
		return (
			<CardNotice icon={Link2Off} title={getSubscriberStrings(language).brokenLinkTitle}>
				{strings.invalid(newsletterName)}
				{archiveUrl && (
					<Button asChild size="lg" variant="outline" className="mt-6 w-full">
						<a href={archiveUrl}>{strings.resubscribe}</a>
					</Button>
				)}
			</CardNotice>
		);
	}

	return (
		<CardNotice
			icon={isPending ? Loader2 : HeartHandshake}
			spin={isPending}
			title={strings.title(newsletterName)}
		>
			{state?.error === "busy" ? strings.busy : strings.body}
			<form ref={formRef} action={action} className="mt-6">
				<Button type="submit" size="lg" disabled={isPending} className="w-full">
					{isPending ? strings.pending : strings.button}
				</Button>
			</form>
		</CardNotice>
	);
}
