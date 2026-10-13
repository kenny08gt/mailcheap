import "server-only";
import { put } from "@vercel/blob";
import { getAppUrl } from "@/lib/config";
import { putImageOnDisk } from "@/lib/disk-uploads";

// Sent emails point at these files forever, so their URLs never change and browsers can cache them for a year.
const ONE_YEAR = 365 * 24 * 60 * 60;

// UPLOAD_DIR is served by the web server in front of Mailcheap (Caddy, nginx), at UPLOAD_PUBLIC_URL.
export async function putImage(pathname, bytes, contentType) {
	if (process.env.UPLOAD_DIR) {
		return putImageOnDisk({
			directory: process.env.UPLOAD_DIR,
			publicUrl: process.env.UPLOAD_PUBLIC_URL || `${getAppUrl()}/uploads`,
			pathname,
			bytes,
		});
	}
	const blob = await put(pathname, bytes, {
		access: "public",
		contentType,
		addRandomSuffix: true,
		cacheControlMaxAge: ONE_YEAR,
	});
	return blob.url;
}
