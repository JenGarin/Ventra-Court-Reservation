const major = Number(String(process.versions.node || "").split(".")[0] || 0);

if (major !== 20) {
  console.error(
    [
      "",
      `Unsupported Node.js version: ${process.versions.node}`,
      "This project expects Node.js 20.x (matches CI).",
      "",
      "Fix:",
      "- Install/use Node 20 (LTS) then re-run `npm run dev`.",
      "",
      "Note: On some Windows setups, newer Node versions can trigger `esbuild` spawn errors (EPERM).",
      "",
    ].join("\n"),
  );
  process.exit(1);
}
