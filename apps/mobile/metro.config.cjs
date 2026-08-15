const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

/**
 * Shared packages use NodeNext's explicit `.js` specifiers while publishing
 * TypeScript source through workspace exports. Metro needs the extensionless
 * request to select the corresponding `.ts` source during native development.
 */
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith(".") && moduleName.endsWith(".js")) {
    try {
      return context.resolveRequest(context, moduleName.slice(0, -3), platform);
    } catch {
      // Fall through so Metro reports the original unresolved request.
    }
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
