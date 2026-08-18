"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { Config } = require("../src/config");
const { formatDelta, formatPreciseNumber } = require("../src/presentation");
const { writeReport } = require("../src/report");
const { median } = require("../src/util");

function result(sha, values, paired = false) {
  return {
    schemaVersion: 1,
    suiteId: "paired",
    shardId: "merged",
    ...(paired ? { samplePairing: "index" } : {}),
    source: {
      repository: "owner/project",
      sha,
      url: `https://github.com/owner/project/commit/${sha}`,
      timestamp: "2026-08-18T00:00:00.000Z",
    },
    platform: {
      id: "linux-amd64",
      label: "Linux / amd64",
      os: "linux",
      arch: "amd64",
    },
    units: { "ns/op": { better: "lower" } },
    benchmarks: [
      {
        name: "BenchmarkCore",
        group: "core",
        chart: "group:core",
        samples: values.map((value) => ({
          iterations: 100,
          measurements: { "ns/op": value },
        })),
        measurements: { "ns/op": median(values) },
      },
    ],
  };
}

function entry(value) {
  return {
    source: value.source,
    platforms: { "linux-amd64": value },
  };
}

test("reports signed and percentage changes from index-paired samples", () => {
  assert.equal(formatPreciseNumber(0.0004), "0.0004");
  assert.equal(formatPreciseNumber(0.000000001), "1e-9");
  assert.equal(formatPreciseNumber(12.3456), "12.35");
  assert.equal(formatDelta(0.004, "lower"), "+0.004% (worse)");
  const config = new Config({
    id: "paired",
    title: "Paired benchmarks",
    groups: { core: "^Core$" },
  });
  const base = entry(
    result("1111111111111111111111111111111111111111", [10, 20, 30], true),
  );
  const head = entry(
    result("2222222222222222222222222222222222222222", [11, 27, 18], true),
  );
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "paired-report-"));
  const pairedReport = path.join(root, "paired.md");
  writeReport(pairedReport, "", config, head, base, { sameRunner: true });
  const paired = fs.readFileSync(pairedReport, "utf8");
  assert.match(paired, /\| 18 \| \+1 ns\/op \/ \+10\.0% \(worse\) \|/u);
  assert.match(
    paired,
    /signed differences and percentage changes are pairwise medians/u,
  );

  const summaryReport = path.join(root, "summary.md");
  writeReport(summaryReport, "", config, head, base);
  assert.match(
    fs.readFileSync(summaryReport, "utf8"),
    /\| 18 \| -2 ns\/op \/ -10\.0% \(better\) \|/u,
  );
});
