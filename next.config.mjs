/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The app IS joblanders.ai/arpa, proxied by the static site's vercel.json
  // rewrite. basePath makes Next emit every link and every asset under that
  // prefix, so the rewrite only needs one rule.
  // Mirrored as BASE_PATH in app/_export-button.tsx.
  basePath: '/arpa',
};

export default nextConfig;
