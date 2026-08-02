/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@quartermaster/prava-client",
    "@quartermaster/escalation",
    "mandate-arbiter",
  ],
  webpack: (config) => {
    // mandate-arbiter ships ESM ".js" specifiers over .ts sources.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".js", ".ts"],
    };
    return config;
  },
};

export default nextConfig;
