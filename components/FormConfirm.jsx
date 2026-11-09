"use client";

import { useActionState, useEffect, useRef } from "react";
import { Link2Off, Loader2, MailCheck } from "lucide-react";
import { confirmSubscription } from "@/app/confirm/actions";
import CardNotice from "@/components/CardNotice";
import { Button } from "@/components/ui/button";
import { getSubscriberStrings } from "@/lib/subscriber-strings";

// Link scanners open the page without submitting forms, so only a person's browser confirms.
export default function FormConfirm({ token, language, newsletterName, fromName, fromEmail, archiveUrl }) {
	const strings = getSubscriberStrings(language);
	const [state, action, isPending] = useActionState(confirmSubscription.bind(null, token), null);
	const formRef = useRef(null);

	useEffect(() => {
		formRef.current?.requestSubmit();
	}, []);

	if (state?.ok) {
		return (
			<CardNotice icon={MailCheck} tone="success" title={strings.confirm.doneTitle}>
				{strings.confirm.doneFrom(newsletterName)}
				<span className="font-medium text-foreground">{fromName || fromEmail}</span>
				{fromName && ` (${fromEmail})`}
				{strings.confirm.donePromotions}
				{archiveUrl && (
					<Button asChild size="lg" variant="outline" className="mt-6 w-full">
						<a href={archiveUrl}>{strings.confirm.archive}</a>
					</Button>
				)}
			</CardNotice>
		);
	}

	if (state?.error) {
		return (
			<CardNotice icon={Link2Off} title={strings.brokenLinkTitle}>
				{strings.confirm.expired}
			</CardNotice>
		);
	}

	return (
		<CardNotice
			icon={isPending ? Loader2 : MailCheck}
			spin={isPending}
			title={strings.confirm.title(newsletterName)}
		>
			{strings.confirm.body}
			<form ref={formRef} action={action} className="mt-6">
				<Button type="submit" size="lg" disabled={isPending} className="w-full">
					{isPending ? strings.confirm.pending : strings.confirm.button}
				</Button>
			</form>
		</CardNotice>
	);
}
