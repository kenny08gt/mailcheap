"use client";

import { useActionState, useEffect, useRef } from "react";
import { HeartHandshake, Link2Off, Loader2, MailCheck } from "lucide-react";
import { keepSending } from "@/app/keep/actions";
import CardNotice from "@/components/CardNotice";
import { Button } from "@/components/ui/button";

// Link scanners open the page without submitting forms, so only a person's browser says yes.
export default function FormKeep({ token, newsletterName, archiveUrl }) {
	const [state, action, isPending] = useActionState(keepSending.bind(null, token), null);
	const formRef = useRef(null);

	useEffect(() => {
		formRef.current?.requestSubmit();
	}, []);

	if (state?.ok) {
		return (
			<CardNotice icon={MailCheck} tone="success" title={`Seguirás recibiendo ${newsletterName}`}>
				Gracias por avisarnos. El próximo envío llegará a tu bandeja.
				{archiveUrl && (
					<Button asChild size="lg" variant="outline" className="mt-6 w-full">
						<a href={archiveUrl}>Ver envíos anteriores</a>
					</Button>
				)}
			</CardNotice>
		);
	}

	if (state?.error === "invalid") {
		return (
			<CardNotice icon={Link2Off} title="Este enlace no funciona">
				Puede que tenga más de 90 días, o cancelaste tu suscripción. Suscríbete de nuevo para recibir {newsletterName}.
				{archiveUrl && (
					<Button asChild size="lg" variant="outline" className="mt-6 w-full">
						<a href={archiveUrl}>Suscribirme de nuevo</a>
					</Button>
				)}
			</CardNotice>
		);
	}

	return (
		<CardNotice
			icon={isPending ? Loader2 : HeartHandshake}
			spin={isPending}
			title={`¿Seguir recibiendo ${newsletterName}?`}
		>
			{state?.error === "busy"
				? "Demasiados clics desde tu red. Inténtalo de nuevo en unos minutos."
				: "Un clic y te lo seguimos enviando."}
			<form ref={formRef} action={action} className="mt-6">
				<Button type="submit" size="lg" disabled={isPending} className="w-full">
					{isPending ? "Guardando…" : "Sí, sigan enviándolo"}
				</Button>
			</form>
		</CardNotice>
	);
}
