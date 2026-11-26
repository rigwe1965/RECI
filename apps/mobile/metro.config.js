const { getDefaultConfig } = require('expo/metro-config')

// Expo's default config handles this pnpm monorepo (watch folders, symlinked
// workspace packages such as @reci/utils and @reci/types) by itself since
// SDK 52. The old manual overrides (disableHierarchicalLookup,
// unstable_enableSymlinks) broke module resolution under pnpm.
module.exports = getDefaultConfig(__dirname)
