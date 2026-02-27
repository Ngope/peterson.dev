/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      '/api/chat': ['./data/**/*'],
    },
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Externalize onnxruntime-node to avoid bundling issues
      config.externals = config.externals || [];
      config.externals.push('onnxruntime-node', 'sharp');
    }

    // Fallback for fs module
    config.resolve = config.resolve || {};
    config.resolve.fallback = config.resolve.fallback || {};
    config.resolve.fallback.fs = false;

    return config;
  }
};

export default nextConfig;
