import { ImageResponse } from "next/og";
import { getPlatformPath, parseIconColor } from "@/lib/social";

// Drawn at 2x for the 24px email icon. The URL fully names the image, so it never changes.
const SIZE = 48;

export async function GET(request, { params }) {
	const { platform } = await params;
	const path = getPlatformPath(platform);
	if (!path) return new Response("Not found", { status: 404 });
	const color = parseIconColor(new URL(request.url).searchParams.get("c"));
	if (!color) return new Response("Color must look like 605b66", { status: 400 });

	return new ImageResponse(
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={SIZE} height={SIZE}>
			<path d={path} fill={`#${color}`} />
		</svg>,
		{
			width: SIZE,
			height: SIZE,
			headers: { "Cache-Control": "public, max-age=31536000, immutable" },
		}
	);
}
