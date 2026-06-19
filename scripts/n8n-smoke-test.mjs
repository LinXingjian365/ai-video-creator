import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const draftsDir = path.join(projectRoot, "workspace", "drafts");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

const appBaseUrl = (process.env.N8N_SMOKE_APP_BASE_URL || "http://host.docker.internal:5182").replace(/\/+$/, "");
const n8nBaseUrl = (process.env.N8N_SMOKE_N8N_BASE_URL || "http://localhost:5678").replace(/\/+$/, "");
const containerName = process.env.N8N_CONTAINER || "n8n";
const workflowName = `AI Video n8n smoke ${timestamp}`;
const localWorkflowPath = path.join(draftsDir, `n8n-smoke-workflow-${timestamp}.json`);
const localResultPath = path.join(draftsDir, `n8n-smoke-result-${timestamp}.json`);
const containerWorkflowPath = `/tmp/n8n-smoke-workflow-${timestamp}.json`;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd: projectRoot, windowsHide: true, maxBuffer: 10 * 1024 * 1024, ...options }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error([
          `${command} ${args.join(" ")} failed`,
          stdout.trim(),
          stderr.trim(),
          error.message
        ].filter(Boolean).join("\n")));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function n8n(args) {
  return run("docker", ["exec", containerName, "n8n", ...args]);
}

async function waitForN8nHealth() {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const response = await fetch(`${n8nBaseUrl}/healthz`);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep waiting while Docker restarts the service.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`n8n did not become healthy at ${n8nBaseUrl}/healthz`);
}

async function workflowIds() {
  const { stdout } = await n8n(["list:workflow", "--onlyId"]);
  return new Set(stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
}

function buildSmokeWorkflow() {
  const workflowId = randomUUID();
  const manualId = randomUUID();
  const httpId = randomUUID();
  return {
    id: workflowId,
    name: workflowName,
    active: false,
    nodes: [
      {
        id: manualId,
        name: "Manual smoke trigger",
        type: "n8n-nodes-base.manualTrigger",
        typeVersion: 1,
        position: [0, 0],
        parameters: {}
      },
      {
        id: httpId,
        name: "Call local app n8n status",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.2,
        position: [320, 0],
        parameters: {
          method: "GET",
          url: `${appBaseUrl}/api/orchestration/n8n`,
          options: {
            timeout: 30000,
            response: { response: { responseFormat: "json" } }
          }
        }
      }
    ],
    connections: {
      "Manual smoke trigger": {
        main: [[{ node: "Call local app n8n status", type: "main", index: 0 }]]
      }
    },
    pinData: {},
    settings: {
      executionOrder: "v1",
      saveExecutionProgress: true,
      saveManualExecutions: true
    },
    staticData: null,
    tags: []
  };
}

async function executeWorkflowInOneShotContainer(workflowId) {
  await run("docker", ["stop", containerName]);
  try {
    return await run("docker", [
      "compose",
      "-f",
      "deployments/n8n/docker-compose.yml",
      "run",
      "--rm",
      "--no-deps",
      "-e",
      "N8N_RUNNERS_ENABLED=false",
      "n8n",
      "execute",
      `--id=${workflowId}`,
      "--rawOutput"
    ]);
  } finally {
    await run("docker", ["start", containerName]);
    await waitForN8nHealth();
  }
}

async function main() {
  await mkdir(draftsDir, { recursive: true });

  const health = await fetch(`${appBaseUrl}/api/orchestration/n8n`);
  if (!health.ok) {
    throw new Error(`Local app smoke endpoint failed ${health.status}: ${await health.text()}`);
  }

  const before = await workflowIds();
  const workflow = buildSmokeWorkflow();
  await writeFile(localWorkflowPath, `${JSON.stringify(workflow, null, 2)}\n`, "utf8");
  await run("docker", ["cp", localWorkflowPath, `${containerName}:${containerWorkflowPath}`]);
  const importResult = await n8n(["import:workflow", "--input", containerWorkflowPath]);
  const after = await workflowIds();
  const importedIds = [...after].filter((id) => !before.has(id));
  const workflowId = importedIds.at(-1);
  if (!workflowId) {
    throw new Error(`Imported workflow id could not be determined.\n${importResult.stdout}\n${importResult.stderr}`);
  }

  const execution = await executeWorkflowInOneShotContainer(workflowId);
  const result = {
    generatedAt: new Date().toISOString(),
    appBaseUrl,
    n8nBaseUrl,
    containerName,
    workflowName,
    workflowId,
    workflowPath: path.relative(projectRoot, localWorkflowPath).replace(/\\/g, "/"),
    imported: true,
    importOutput: importResult.stdout.trim(),
    executionMode: "docker-compose-run-cli",
    executionOutput: execution.stdout.trim(),
    executionErrorOutput: execution.stderr.trim()
  };
  await writeFile(localResultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    ok: true,
    workflowId,
    workflowPath: result.workflowPath,
    resultPath: path.relative(projectRoot, localResultPath).replace(/\\/g, "/")
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
