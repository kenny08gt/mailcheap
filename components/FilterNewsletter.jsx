"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import AvatarNewsletter from "@/components/AvatarNewsletter";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

const ALL = "all";

export default function FilterNewsletter({ newsletters }) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [isPending, startTransition] = useTransition();

	function onValueChange(value) {
		const params = new URLSearchParams(searchParams);
		if (value !== ALL) params.set("newsletter", value);
		else params.delete("newsletter");
		params.delete("page");
		startTransition(() => router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false }));
	}

	return (
		<div className="flex items-center gap-2">
			{isPending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
			<Select value={searchParams.get("newsletter") ?? ALL} onValueChange={onValueChange}>
				<SelectTrigger className="h-9 w-full sm:w-52" aria-label="Newsletter">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={ALL}>All newsletters</SelectItem>
					{newsletters.map((newsletter) => (
						<SelectItem key={newsletter.id} value={newsletter.id}>
							<span className="flex items-center gap-2">
								<AvatarNewsletter newsletter={newsletter} size={16} />
								{newsletter.name}
							</span>
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
