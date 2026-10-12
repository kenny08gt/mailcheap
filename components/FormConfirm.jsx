"use client";

import { useActionState, useEffect, useRef } from "react";
import { Link2Off, Loader2, MailCheck } from "lucide-react";
import { confirmSubscription } from "@/app/confirm/actions";
import CardNotice from "@/components/CardNotice";
import { Button } from "@/components/ui/button";

// Link scanners open the page without submitting forms, so only a person's browser confirms.
export default function FormConfirm({ token, newsletterName, fromName, fromEmail, archiveUrl }) {
	const [state, action, isPending] = useActionState(confirmSubscription.bind(null, token), null);
	const formRef = useRef(null);

	useEffect(() => {
		formRef.current?.requestSubmit();
	}, []);

	if (state?.ok) {
		return (
			<CardNotice icon={MailCheck} tone="success" title="¡Listo, ya estás dentro!">
				El próximo envío de {newsletterName} llegará de{" "}
				<span className="font-medium text-foreground">{fromName || fromEmail}</span>
				{fromName && ` (${fromEmail})`}. Si llega a Promociones, arrástralo a Principal.
				{archiveUrl && (
					<Button asChild size="lg" variant="outline" className="mt-6 w-full">
						<a href={archiveUrl}>Ver envíos anteriores</a>
					</Button>
				)}
			</CardNotice>
		);
	}

	if (state?.error) {
		return (
			<CardNotice icon={Link2Off} title="Este enlace no funciona">
				Puede que tenga más de 30 días. Suscríbete de nuevo y usa el correo de confirmación más reciente.
			</CardNotice>
		);
	}

	return (
		<CardNotice
			icon={isPending ? Loader2 : MailCheck}
			spin={isPending}
			title={`Confirma tu suscripción a ${newsletterName}`}
		>
			Un clic y el próximo envío llegará a tu bandeja.
			<form ref={formRef} action={action} className="mt-6">
				<Button type="submit" size="lg" disabled={isPending} className="w-full">
					{isPending ? "Confirmando…" : "Confirmar mi suscripción"}
				</Button>
			</form>
		</CardNotice>
	);
}
