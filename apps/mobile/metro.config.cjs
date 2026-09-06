/* eslint-disable @typescript-eslint/no-require-imports -- Expo loads Metro configuration through CommonJS. */
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Resolve Kontave's public UI entry to its React Native renderer on every Expo
// target, including Expo web. The standard Metro conditions remain intact.
config.resolver.unstable_conditionNames = [
  ...(config.resolver.unstable_conditionNames ?? []),
  "kontave-react-native",
];

module.exports = config;
