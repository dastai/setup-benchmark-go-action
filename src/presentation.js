"use strict";

function markdown(value) {
  return String(value).replace(/[\\*_[\]#`]/gu, "\\$&");
}

function tableCell(value) {
  return markdown(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function formatNumber(value) {
  if (Number.isInteger(value) && value < 1e12) return String(value);
  return value.toFixed(3);
}

function formatPreciseNumber(value) {
  if (value === 0 || Number.isInteger(value)) return String(value);
  const magnitude = Math.abs(value);
  if (magnitude < 0.0000001) {
    const [coefficient, exponent] = value.toExponential(3).split("e");
    return `${coefficient.replace(/\.?0+$/u, "")}e${exponent}`;
  }
  const decimals =
    magnitude >= 999.95
      ? 0
      : magnitude >= 99.995
        ? 1
        : magnitude >= 9.9995
          ? 2
          : magnitude >= 0.99995
            ? 3
            : magnitude >= 0.099995
              ? 4
              : magnitude >= 0.0099995
                ? 5
                : magnitude >= 0.00099995
                  ? 6
                  : 7;
  return value.toFixed(decimals).replace(/0+$/u, "").replace(/\.$/u, "");
}

function formatSigned(value, formatMagnitude) {
  const normalized = Object.is(value, -0) ? 0 : value;
  const sign = normalized > 0 ? "+" : normalized < 0 ? "-" : "";
  return `${sign}${formatMagnitude(Math.abs(normalized))}`;
}

function formatDelta(change, better) {
  const rounded = change.toFixed(1);
  const percentage =
    change !== 0 && Number(rounded) === 0
      ? formatPreciseNumber(change)
      : rounded;
  const value = `${change >= 0 ? "+" : ""}${percentage}%`;
  if (change === 0 || (better !== "lower" && better !== "higher")) return value;
  const improved =
    (better === "lower" && change < 0) || (better === "higher" && change > 0);
  return `${value} (${improved ? "better" : "worse"})`;
}

function delta(current, baseline, better) {
  if (baseline === undefined) return "new";
  if (baseline === 0) return current === 0 ? "0.0%" : "from 0";
  return formatDelta((current / baseline - 1) * 100, better);
}

module.exports = {
  delta,
  formatDelta,
  formatNumber,
  formatPreciseNumber,
  formatSigned,
  markdown,
  tableCell,
};
