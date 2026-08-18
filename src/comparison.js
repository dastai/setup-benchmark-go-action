"use strict";

const { benchmarkKey } = require("./gobench");
const { median } = require("./util");

function findBenchmark(entry, platformId, key) {
  return entry?.platforms?.[platformId]?.benchmarks?.find(
    (candidate) => benchmarkKey(candidate) === key,
  );
}

function sampleValues(benchmark, unit) {
  return benchmark.samples.flatMap((sample) =>
    Object.hasOwn(sample.measurements, unit) ? [sample.measurements[unit]] : [],
  );
}

function metricComparison(
  current,
  baseline,
  platformId,
  key,
  unit,
  sameRunner,
) {
  const currentResult = current.platforms[platformId];
  const baselineResult = baseline?.platforms?.[platformId];
  const currentBenchmark = findBenchmark(current, platformId, key);
  const baselineBenchmark = findBenchmark(baseline, platformId, key);
  const currentValue = currentBenchmark?.measurements?.[unit];
  const baselineValue = baselineBenchmark?.measurements?.[unit];
  const summary = {
    baseline: baselineValue,
    ...(currentValue !== undefined && baselineValue !== undefined
      ? { difference: currentValue - baselineValue }
      : {}),
  };
  if (
    !sameRunner ||
    currentResult?.samplePairing !== "index" ||
    baselineResult?.samplePairing !== "index" ||
    !currentBenchmark ||
    !baselineBenchmark
  ) {
    return summary;
  }

  const currentValues = sampleValues(currentBenchmark, unit);
  const baselineValues = sampleValues(baselineBenchmark, unit);
  if (
    currentValues.length === 0 ||
    currentValues.length !== baselineValues.length
  ) {
    return summary;
  }
  const differences = [];
  const changes = [];
  let percentageDefined = true;
  for (let index = 0; index < currentValues.length; index += 1) {
    differences.push(currentValues[index] - baselineValues[index]);
    if (baselineValues[index] === 0) {
      if (currentValues[index] === 0) changes.push(0);
      else percentageDefined = false;
    } else {
      changes.push((currentValues[index] / baselineValues[index] - 1) * 100);
    }
  }
  return {
    baseline: baselineValue,
    difference: median(differences),
    ...(percentageDefined ? { change: median(changes) } : {}),
  };
}

module.exports = { metricComparison };
