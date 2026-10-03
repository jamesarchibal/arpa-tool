/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The app is reached as joblanders.ai/arpa/app/*, proxied by the static site's
  // vercel.json rewrite. basePath makes Next emit every link and every asset
  // under that prefix, so the rewrite only needs one rule.
  // Mirrored as BASE_PATH in app/login/actions.ts.
  basePath: '/arpa/app',
};

export default nextConfig;
