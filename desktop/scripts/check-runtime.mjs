const [major] = process.versions.node.split('.').map(Number);

if (major !== 22) {
  console.error(
    `Marketing Hub Desktop requires Node.js 22.x; received ${process.version}. ` +
    'Use the version in desktop/.nvmrc before installing, building, or packaging.',
  );
  process.exit(1);
}
