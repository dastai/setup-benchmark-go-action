"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const YAML = require("yaml");

const workflow = YAML.parse(
  fs.readFileSync(
    path.join(__dirname, "..", ".github", "workflows", "publish.yml"),
    "utf8",
  ),
);
const benchmarkWorkflow = YAML.parse(
  fs.readFileSync(
    path.join(__dirname, "..", ".github", "workflows", "benchmark.yml"),
    "utf8",
  ),
);
const commentWorkflow = YAML.parse(
  fs.readFileSync(
    path.join(__dirname, "..", ".github", "workflows", "benchmark-publish.yml"),
    "utf8",
  ),
);
const steps = workflow.jobs.publish.steps;
const step = (name) => steps.find((candidate) => candidate.name === name);

function runShellStep(name, env) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-step-"));
  const output = path.join(directory, "github-output");
  childProcess.execFileSync("bash", ["-c", step(name).run], {
    env: { ...process.env, ...env, GITHUB_OUTPUT: output },
  });
  return Object.fromEntries(
    fs
      .readFileSync(output, "utf8")
      .trim()
      .split("\n")
      .map((line) => line.split("=", 2)),
  );
}

test("publisher exposes an optional data repository dispatch event", () => {
  const input = workflow.on.workflow_call.inputs.data_dispatch_event;
  assert.equal(input.required, undefined);
  assert.equal(input.default, "");
  assert.equal(input.type, "string");
});

test("publisher supports trusted workflow-run and current-run sources", () => {
  const input = workflow.on.workflow_call.inputs.source_mode;
  assert.equal(input.default, "workflow-run");
  assert.equal(input.type, "string");
  const resolve = step("Resolve benchmark source run").run;
  assert.match(
    resolve,
    /workflow-run mode requires its triggering workflow run/u,
  );
  assert.match(resolve, /current-run publishing is limited to pushes/u);

  const direct = benchmarkWorkflow.jobs.publish;
  assert.equal(direct.needs, "benchmark");
  assert.equal(direct.with.run_id, "${{ fromJSON(github.run_id) }}");
  assert.equal(direct.with.source_mode, "current-run");
  assert.match(direct.if, /github\.event_name == 'push'/u);
  assert.match(direct.if, /github\.event\.repository\.default_branch/u);
  assert.match(
    benchmarkWorkflow.jobs.benchmark.if,
    /github\.event\.repository\.default_branch/u,
  );

  const trusted = commentWorkflow.jobs.publish;
  assert.match(trusted.if, /workflow_run\.event == 'pull_request'/u);
  assert.equal(commentWorkflow.permissions.contents, "write");
});

test("trusted publishers persist main and pull request Pages data", () => {
  // Deliberately pin the security-critical shell gate. A change to this line
  // requires reviewing the persistence policy, not merely updating a fixture.
  assert.match(
    step("Classify source series").run,
    /publish="\$same_repository"\s+\[\[ "\$kind" != pull \]\] \|\| publish=true/u,
  );
  assert.match(
    step("Render benchmark history").with["site-base-url"],
    /data-access\.outputs\.publish-allowed == 'true'/u,
  );
});

test("non-main writes require the trusted default-branch configuration", () => {
  const checkout = step("Check out trusted non-main configuration");
  assert.match(checkout.if, /source\.outputs\.kind != 'main'/u);
  assert.equal(
    checkout.with.ref,
    "${{ github.event.repository.default_branch }}",
  );
  const access = step("Check benchmark data write access").run;
  assert.match(access, /SERIES_KIND.*!= main.*TRUSTED_CONFIG.*!= true/su);
  assert.match(
    step("Render benchmark history").with["trusted-config"],
    /trusted-config\.outputs\.available == 'true'/u,
  );
  const common = {
    DATA_TOKEN: "",
    PUBLISH: "true",
    SAME_DATA_REPOSITORY: "true",
  };
  assert.deepEqual(
    runShellStep("Check benchmark data write access", {
      ...common,
      SERIES_KIND: "pull",
      TRUSTED_CONFIG: "false",
    }),
    { "publish-allowed": "false", writable: "false" },
  );
  assert.deepEqual(
    runShellStep("Check benchmark data write access", {
      ...common,
      SERIES_KIND: "branch",
      TRUSTED_CONFIG: "true",
    }),
    { "publish-allowed": "true", writable: "true" },
  );
  assert.deepEqual(
    runShellStep("Check benchmark data write access", {
      ...common,
      SERIES_KIND: "main",
      TRUSTED_CONFIG: "",
    }),
    { "publish-allowed": "true", writable: "true" },
  );
});

test("publisher resolves stale fork runs without trusting the current head", () => {
  const classify = step("Classify source series").run;
  assert.match(
    classify,
    /repos\/\$\{HEAD_REPOSITORY\}\/commits\/\$\{HEAD_SHA\}\/pulls/u,
  );
  assert.match(classify, /\.base\.repo\.full_name == env\.GITHUB_REPOSITORY/u);
  assert.match(classify, /invalid benchmark data repository/u);
  assert.match(step("Commit benchmark data").run, /current_state.*!= open/su);
  assert.match(
    step("Create or update PR comment").with.script,
    /pull\.data\.state !== "open"/u,
  );
});

test("data publishing failures degrade to a commented preview", () => {
  for (const name of [
    "Check out writable benchmark data",
    "Commit benchmark data",
    "Notify benchmark data repository",
  ]) {
    assert.equal(step(name)["continue-on-error"], true, name);
  }
  assert.equal(step("Require external data token"), undefined);
  assert.match(
    step("Check out public benchmark data for preview").if,
    /data-checkout\.outcome != 'success'/u,
  );
  assert.match(
    step("Check out public benchmark data for preview").run,
    /else\s+rm -rf "\$GITHUB_WORKSPACE\/benchmark-data"\s+mkdir benchmark-data/u,
  );
  assert.match(
    step("Add publishing status to report").run,
    /Persistent publishing is unavailable/u,
  );
});

test("benchmark validation and rendering remain hard failures", () => {
  for (const name of [
    "Download platform artifacts",
    "Check out trusted non-main configuration",
    "Render benchmark history",
    "Upload rendered preview",
    "Create or update PR comment",
  ]) {
    assert.notEqual(step(name)["continue-on-error"], true, name);
  }
});

test("publisher pins paired baseline links to the target repository", () => {
  const render = step("Render benchmark history");
  assert.equal(render.uses, "xgo-dev/setup-benchmark-go-action/publish@v1");
  assert.match(
    render.with["expected-baseline-repository"],
    /github\.repository/u,
  );
  assert.equal(render.with["expected-baseline-sha"], undefined);
});
