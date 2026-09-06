module.exports = {
  preset: "react-native",
  testMatch: ["<rootDir>/react-native/test/**/*.test.tsx"],
  transform: {
    "^.+\\.[jt]sx?$": [
      "babel-jest",
      { presets: ["module:@react-native/babel-preset"] },
    ],
  },
  transformIgnorePatterns: [
    "node_modules/(?!\\.pnpm|react-native|@react-native|@react-native-community)",
  ],
  moduleNameMapper: {
    "^@kontave/ui/tokens$": "<rootDir>/core/src/tokens/index.ts",
    "^@kontave/ui/contracts$": "<rootDir>/core/src/contracts/index.ts",
  },
};
