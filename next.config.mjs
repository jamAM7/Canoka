/** @type {import('next').NextConfig} */
const nextConfig = {
  // The app opens on the dashboard. Temporary (307) so `/` can become a
  // landing page later without browsers having cached a permanent redirect.
  async redirects() {
    return [{ source: "/", destination: "/dashboard", permanent: false }];
  },
};

export default nextConfig;
