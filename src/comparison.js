"use strict";

const { benchmarkKey } = require("./gobench");
const { median } = require("./util");

function benchmarkIndex(result) {
  return new Map(
    (result?.benchmarks ?? []).map((benchmark) => [
      benchmarkKey(benchmark),
      benchmark,
    ]),
  );
}

function isIndexPaired(current, baseline, sameRunner) {
  return (
    sameRunner &&
    current?.samplePairing === "index" &&
    baseline?.samplePairing === "index"
  );
}

function sampleValues(benchmark, unit) {
  return benchmark.samples.flatMap((sample) =>
    Object.hasOwn(sample.measurements, unit) ? [sample.measurements[unit]] : [],
  );
}

function metricComparison(currentBenchmark, baselineBenchmark, unit, paired) {
  const currentValue = currentBenchmark?.measurements?.[unit];
  const baselineValue = baselineBenchmark?.measurements?.[unit];
  const summary = {
    baseline: baselineValue,
    ...(currentValue !== undefined && baselineValue !== undefined
      ? { difference: currentValue - baselineValue }
      : {}),
  };
  if (!paired || !currentBenchmark || !baselineBenchmark) {
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

module.exports = { benchmarkIndex, isIndexPaired, metricComparison };
