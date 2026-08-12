const rawApiUrl = process.env.VITE_API_BASE_URL?.trim();

if (!rawApiUrl) {
  console.error('VITE_API_BASE_URL is required when creating a desktop distributable.');
  process.exit(1);
}

let apiUrl;
try {
  apiUrl = new URL(rawApiUrl);
} catch {
  console.error('VITE_API_BASE_URL must be a valid absolute URL.');
  process.exit(1);
}

const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
if (apiUrl.protocol !== 'https:' || localHosts.has(apiUrl.hostname)) {
  console.error('Desktop distributables require a non-local HTTPS VITE_API_BASE_URL.');
  process.exit(1);
}
