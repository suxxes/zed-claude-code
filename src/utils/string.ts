export default function formatUriAsLink(uri: string): string {
	try {
		const url = new URL(uri);

		if (url.protocol === 'file:') {
			// For file:// URLs, decode pathname for Unicode support
			const pathname = decodeURIComponent(url.pathname);

			// If it ends with / it's a directory, show the full path
			if (uri.endsWith('/') && pathname !== '/') {
				return `[${pathname}](${uri})`;
			}

			// Otherwise extract the filename
			const segments = pathname.split('/').filter(Boolean);
			const name = segments.length > 0 ? segments[segments.length - 1] : '';

			return `[${name}](${uri})`;
		}

		if (url.protocol === 'zed:') {
			// For zed:// URLs, extract the last path segment
			const pathname = decodeURIComponent(url.pathname);
			const segments = pathname.split('/').filter(Boolean);
			const name = segments.length > 0 ? segments[segments.length - 1] : uri;

			return `[${name}](${uri})`;
		}

		// For other protocols, return as-is
		return uri;
	} catch {
		// If not a valid URL, return as-is
		return uri;
	}
}
