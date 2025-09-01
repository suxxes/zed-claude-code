import { describe, expect, it } from 'vitest';
import formatUriAsLink from './string';

describe('formatUriAsLink', () => {
	describe('file:// URIs', () => {
		it('should format file:// URI with filename', () => {
			const result = formatUriAsLink('file:///home/user/document.pdf');
			expect(result).toBe('[document.pdf](file:///home/user/document.pdf)');
		});

		it('should handle file:// URI with directory (ending with /)', () => {
			const result = formatUriAsLink('file:///home/user/');
			expect(result).toBe('[/home/user/](file:///home/user/)');
		});

		it('should handle file:// root directory', () => {
			const result = formatUriAsLink('file:///');
			expect(result).toBe('[](file:///)');
		});

		it('should handle URIs with complex paths', () => {
			const result = formatUriAsLink('file:///very/deep/nested/path/to/file.json');
			expect(result).toBe('[file.json](file:///very/deep/nested/path/to/file.json)');
		});

		it('should handle URIs with special characters in filename', () => {
			const result = formatUriAsLink('file:///path/my-file_v2.0.ts');
			expect(result).toBe('[my-file_v2.0.ts](file:///path/my-file_v2.0.ts)');
		});

		it('should handle URIs with Unicode characters', () => {
			const result = formatUriAsLink('file:///path/Datei-üöä.txt');
			expect(result).toBe('[Datei-üöä.txt](file:///path/Datei-üöä.txt)');
		});

		it('should handle URIs with encoded Unicode characters', () => {
			const result = formatUriAsLink('file:///path/Datei-%C3%BC%C3%B6%C3%A4.txt');
			expect(result).toBe('[Datei-üöä.txt](file:///path/Datei-%C3%BC%C3%B6%C3%A4.txt)');
		});

		it('should handle extremely long URIs', () => {
			const longPath = 'a'.repeat(1000);
			const longFilename = 'b'.repeat(500);
			const uri = `file:///${longPath}/${longFilename}.txt`;

			const result = formatUriAsLink(uri);
			expect(result).toBe(`[${longFilename}.txt](${uri})`);
		});

		it('should handle malformed file:// URIs', () => {
			expect(formatUriAsLink('file://')).toBe('[](file://)');
		});
	});

	describe('zed:// URIs', () => {
		it('should format zed:// URI with filename', () => {
			const result = formatUriAsLink('zed://workspace/src/index.ts');
			expect(result).toBe('[index.ts](zed://workspace/src/index.ts)');
		});

		it('should handle zed:// URI with trailing slash', () => {
			const result = formatUriAsLink('zed://workspace/');
			expect(result).toBe('[zed://workspace/](zed://workspace/)');
		});

		it('should handle zed:// URI with complex paths', () => {
			const result = formatUriAsLink('zed://project/src/components/Button.tsx');
			expect(result).toBe('[Button.tsx](zed://project/src/components/Button.tsx)');
		});

		it('should handle zed:// URI without path', () => {
			const result = formatUriAsLink('zed://');
			expect(result).toBe('[zed://](zed://)');
		});

		it('should handle zed:// URI with no path', () => {
			const result = formatUriAsLink('zed://project');
			expect(result).toBe('[zed://project](zed://project)');
		});
	});

	describe('other protocols', () => {
		it('should pass through HTTP URIs unchanged', () => {
			const httpUri = 'http://example.com/resource';
			const result = formatUriAsLink(httpUri);
			expect(result).toBe(httpUri);
		});

		it('should pass through HTTPS URIs unchanged', () => {
			const httpsUri = 'https://example.com/resource';
			const result = formatUriAsLink(httpsUri);
			expect(result).toBe(httpsUri);
		});

		it('should pass through URIs with query parameters unchanged', () => {
			const result = formatUriAsLink('https://example.com/file.js?version=1');
			expect(result).toBe('https://example.com/file.js?version=1');
		});

		it('should pass through FTP URIs unchanged', () => {
			const ftpUri = 'ftp://server.com/file.txt';
			const result = formatUriAsLink(ftpUri);
			expect(result).toBe(ftpUri);
		});

		it('should pass through data URIs unchanged', () => {
			const dataUri = 'data:text/plain;base64,SGVsbG8sIFdvcmxkIQ==';
			const result = formatUriAsLink(dataUri);
			expect(result).toBe(dataUri);
		});
	});

	describe('invalid URIs', () => {
		it('should return empty string as-is', () => {
			expect(formatUriAsLink('')).toBe('');
		});

		it('should return non-URI strings as-is', () => {
			expect(formatUriAsLink('not-a-uri')).toBe('not-a-uri');
		});

		it('should return plain text as-is', () => {
			expect(formatUriAsLink('just some text')).toBe('just some text');
		});

		it('should return relative paths as-is', () => {
			expect(formatUriAsLink('./relative/path.txt')).toBe('./relative/path.txt');
		});

		it('should return absolute paths without protocol as-is', () => {
			expect(formatUriAsLink('/absolute/path.txt')).toBe('/absolute/path.txt');
		});
	});

	describe('edge cases', () => {
		it('should handle URI with hash fragment', () => {
			const result = formatUriAsLink('file:///path/doc.md#section');
			expect(result).toBe('[doc.md](file:///path/doc.md#section)');
		});

		it('should handle URI with query string', () => {
			const result = formatUriAsLink('file:///path/script.js?v=1.0');
			expect(result).toBe('[script.js](file:///path/script.js?v=1.0)');
		});

		it('should handle file:// URI with spaces (encoded)', () => {
			const result = formatUriAsLink('file:///path/with%20spaces/file%20name.txt');
			expect(result).toBe('[file name.txt](file:///path/with%20spaces/file%20name.txt)');
		});

		it('should handle zed:// URI with spaces (encoded)', () => {
			const result = formatUriAsLink('zed://project/with%20spaces/file%20name.ts');
			expect(result).toBe('[file name.ts](zed://project/with%20spaces/file%20name.ts)');
		});

		it('should handle file:// URI with multiple dots in filename', () => {
			const result = formatUriAsLink('file:///path/file.test.spec.ts');
			expect(result).toBe('[file.test.spec.ts](file:///path/file.test.spec.ts)');
		});

		it('should handle file:// URI with no extension', () => {
			const result = formatUriAsLink('file:///path/README');
			expect(result).toBe('[README](file:///path/README)');
		});

		it('should handle file:// URI with hidden file', () => {
			const result = formatUriAsLink('file:///home/user/.gitignore');
			expect(result).toBe('[.gitignore](file:///home/user/.gitignore)');
		});
	});
});
