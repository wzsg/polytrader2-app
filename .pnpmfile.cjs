const UNUSED_DEPENDENCIES_BY_PACKAGE = {
  '@polymarket/builder-abstract-signer@0.0.1': ['ethers', 'ts-node', 'typescript'],
  '@polymarket/builder-relayer-client@0.0.10': [
    '@ethersproject/providers',
    '@ethersproject/wallet',
    'ethers',
    'tsx',
    'typescript',
  ],
  '@polymarket/clob-client-v2@1.0.8': ['@ethersproject/providers', '@ethersproject/wallet'],
};

function readPackage(packageManifest) {
  const packageKey = `${packageManifest.name}@${packageManifest.version}`;
  const unusedDependencies = UNUSED_DEPENDENCIES_BY_PACKAGE[packageKey];

  if (!unusedDependencies || !packageManifest.dependencies) return packageManifest;

  for (const dependencyName of unusedDependencies) {
    delete packageManifest.dependencies[dependencyName];
  }

  return packageManifest;
}

module.exports = {
  hooks: {
    readPackage,
  },
};
