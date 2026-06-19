import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const draftsDir = path.join(projectRoot, "workspace", "drafts");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

const appBaseUrl = (process.env.N8N_SMOKE_APP_BASE_URL || "http://host.docker.internal:5182").replace(/\/+$/, "");
const n8nBaseUrl = (process.env.N8N_SMOKE_N8N_BASE_URL || "http://localhost:5678").replace(/\/+$/, "");
const containerName = process.env.N8N_CONTAINER || "n8n";
const smokeMode = process.env.N8N_SMOKE_MODE === "orchestration" ? "orchestration" : "status";
const workflowName = `AI Video n8n ${smokeMode} smoke ${timestamp}`;
const localWorkflowPath = path.join(draftsDir, `n8n-smoke-${smokeMode}-workflow-${timestamp}.json`);
const localResultPath = path.join(draftsDir, `n8n-smoke-${smokeMode}-result-${timestamp}.json`);
const containerWorkflowPath = `/tmp/n8n-smoke-${smokeMode}-workflow-${timestamp}.json`;

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

export function buildSmokeWorkflow({ mode = "status", baseUrl = appBaseUrl, name = workflowName } = {}) {
  if (mode === "orchestration") {
    return buildOrchestrationSmokeWorkflow(baseUrl, name);
  }
  return buildStatusSmokeWorkflow(baseUrl, name);
}

function buildStatusSmokeWorkflow(baseUrl, name) {
  const workflowId = randomUUID();
  const manualId = randomUUID();
  const httpId = randomUUID();
  return {
    id: workflowId,
    name,
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
        parameters: buildGetRequestParameters(`${baseUrl}/api/orchestration/n8n`)
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

function buildOrchestrationSmokeWorkflow(baseUrl, name) {
  const workflowId = randomUUID();
  const manualId = randomUUID();
  const blueprintId = randomUUID();
  const readinessId = randomUUID();
  const assetsId = randomUUID();
  const orchestrationId = randomUUID();
  const payload = {
    topic: "n8n smoke 全链路编排",
    platform: "douyin",
    mode: "dry-run",
    category: "hot",
    topN: 3,
    audience: "本地自动化验证",
    durationSec: 30,
    references: ["n8n smoke"],
    analyticsWindow: "30m",
    exportWorkflow: false
  };

  return {
    id: workflowId,
    name,
    active: false,
    nodes: [
      {
        id: manualId,
        name: "Manual orchestration smoke trigger",
        type: "n8n-nodes-base.manualTrigger",
        typeVersion: 1,
        position: [0, 0],
        parameters: {}
      },
      {
        id: blueprintId,
        name: "01 n8n blueprint status",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.2,
        position: [320, 0],
        parameters: buildGetRequestParameters(`${baseUrl}/api/orchestration/n8n`)
      },
      {
        id: readinessId,
        name: "02 Creator readiness",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.2,
        position: [640, 0],
        parameters: buildGetRequestParameters(`${baseUrl}/api/creator/readiness`)
      },
      {
        id: assetsId,
        name: "03 Workspace assets",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.2,
        position: [960, 0],
        parameters: buildGetRequestParameters(`${baseUrl}/api/workspace/assets?limit=5`)
      },
      {
        id: orchestrationId,
        name: "04 Build n8n dry-run payload",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.2,
        position: [1280, 0],
        parameters: buildJsonPostRequestParameters(`${baseUrl}/api/orchestration/n8n`, payload)
      }
    ],
    connections: {
      "Manual orchestration smoke trigger": { main: [[{ node: "01 n8n blueprint status", type: "main", index: 0 }]] },
      "01 n8n blueprint status": { main: [[{ node: "02 Creator readiness", type: "main", index: 0 }]] },
      "02 Creator readiness": { main: [[{ node: "03 Workspace assets", type: "main", index: 0 }]] },
      "03 Workspace assets": { main: [[{ node: "04 Build n8n dry-run payload", type: "main", index: 0 }]] }
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

function buildGetRequestParameters(url) {
  return {
    method: "GET",
    url,
    options: {
      timeout: 30000,
      response: { response: { responseFormat: "json" } }
    }
  };
}

function buildJsonPostRequestParameters(url, body) {
  return {
    method: "POST",
    url,
    sendHeaders: true,
    headerParameters: {
      parameters: [{ name: "Content-Type", value: "application/json" }]
    },
    sendBody: true,
    contentType: "json",
    specifyBody: "json",
    jsonBody: JSON.stringify(body, null, 2),
    options: {
      timeout: 30000,
      response: { response: { responseFormat: "json" } }
    }
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

export async function main() {
  await mkdir(draftsDir, { recursive: true });

  const health = await fetch(`${appBaseUrl}/api/orchestration/n8n`);
  if (!health.ok) {
    throw new Error(`Local app smoke endpoint failed ${health.status}: ${await health.text()}`);
  }

  const before = await workflowIds();
  const workflow = buildSmokeWorkflow({ mode: smokeMode, baseUrl: appBaseUrl, name: workflowName });
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
    smokeMode,
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
    smokeMode,
    workflowId,
    workflowPath: result.workflowPath,
    resultPath: path.relative(projectRoot, localResultPath).replace(/\\/g, "/")
  }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
