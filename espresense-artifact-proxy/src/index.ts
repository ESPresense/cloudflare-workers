import { Hono } from 'hono'
import type { Context } from 'hono'
import { prettyJSON } from 'hono/pretty-json'
import { cache } from 'hono/cache'
import { cors } from 'hono/cors'

import { Octokit } from "@octokit/core"
import * as fflate from "fflate";

function esp32(path: string) {
  return {
    "chipFamily": "ESP32",
    "improv": false,
    "parts": [{
      "path": "/static/bootloader_esp32.bin",
      "offset": 4096
    },
    {
      "path": "/static/partitions.bin",
      "offset": 32768
    },
    {
      "path": "/static/boot_app0.bin",
      "offset": 57344
    },
    {
      "path": path,
      "offset": 65536
    }]
  };
}

function esp32c3(path: string) {
  return {
    "chipFamily": "ESP32-C3",
    "improv": false,
    "parts": [{
      "path": "/static/bootloader_esp32c3.bin",
      "offset": 0x0000
    },
    {
      "path": "/static/partitions_esp32c3.bin",
      "offset": 0x8000
    },
    {
      "path": "/static/boot_app0.bin",
      "offset": 0xe000
    },
    {
      "path": path,
      "offset": 0x10000
    }]
  };
}

interface Artifact {
  id: number;
  name: string;
}

function findAsset(rel: Artifact[], name: string): Artifact | null {
  return rel.find(artifact => artifact.name === name) ?? null
}

const app = new Hono()
app.use("*", cors())
app.get('/', (c: Context) => c.text('OK'))
const octokit = new Octokit({})

const artifacts = new Hono()
artifacts.use('*', prettyJSON())

// Latest builds change frequently, cache for 1 hour minimum
artifacts.all('/latest/download/:branch/:bin',
  cache({ cacheName: 'artifacts', cacheControl: 'public, max-age=3600' }),
  async (c: Context) => {
    const branch = c.req.param('branch');
    const bin = c.req.param('bin');
    console.log({ branch, bin })

    var resp = await octokit.request('GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs', {
      owner: 'ESPresense',
      repo: 'ESPresense',
      workflow_id: 'build.yml',
      status: 'success',
      branch: branch
    })
    const firstRun = resp.data.workflow_runs[0]
    if (!firstRun) return c.notFound()
    const run_id = firstRun.id
    const sha = firstRun.head_sha
    return c.redirect(`/artifacts/download/runs/${run_id}/${sha.substring(0,7)}/${bin}`)
  }
)

// Specific run artifacts are immutable, cache for 24 hours
artifacts.all('/download/runs/:run_id/:sha/:bin',
  cache({ cacheName: 'artifacts', cacheControl: 'public, max-age=86400' }),
  async (c: Context) => {
    const run_id = parseInt(c.req.param('run_id'))
    const bin = c.req.param('bin')
    console.log({ run_id })
    var resp = await octokit.request('GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts', {
      owner: 'ESPresense',
      repo: 'ESPresense',
      run_id: run_id
    })
    let artifacts = resp.data.artifacts;
    const artifact = findAsset(artifacts, bin)
    if (!artifact) return c.notFound()
    return c.redirect(`/artifacts/download/${artifact.id}/${bin}`)
  }
);

// Artifact downloads by ID are immutable, cache for 7 days
artifacts.get('/download/:artifact_id/*',
  cache({ cacheName: 'artifacts', cacheControl: 'public, max-age=604800' }),
  async (c: Context) => {
    const artifact_id = parseInt(c.req.param('artifact_id'))
    console.log({ artifact_id })
    const artifact = await fetch(`https://nightly.link/ESPresense/ESPresense/actions/artifacts/${artifact_id}.zip`)
    if (artifact.status !== 200) {
      return c.json({ error: `Artifact not found: ${artifact.status}` }, artifact.status as any)
    }
    const ab = await artifact.arrayBuffer()
    const arr = new Uint8Array(ab)
    const files = fflate.unzipSync(arr)
    for (const key in files) {
      if (Object.prototype.hasOwnProperty.call(files, key)) {
        const fileData = files[key]
        return new Response(fileData as any, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } });
      }
    }
    return c.notFound()
  }
);

// Manifests for specific runs are immutable, cache for 24 hours
artifacts.get('/:run_id_2{[0-9]+.json}',
  cache({ cacheName: 'artifacts', cacheControl: 'public, max-age=86400' }),
  async (c: Context) => {
    const flavor = c.req.query('flavor');
    const run_id = parseInt(c.req.param('run_id_2'));
    console.log({ flavor, run_id })

    const resp = await octokit.request('GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts', {
      owner: 'ESPresense',
      repo: 'ESPresense',
      run_id: run_id
    })

    const runArtifacts = resp.data.artifacts;
    if (runArtifacts.length === 0) return c.notFound()
    const workflow_run = runArtifacts[0].workflow_run;
    if (!workflow_run) return c.json({ error: "No workflow run found" }, 404)

    const manifest: any = {
      "name": "ESPresense " + workflow_run.head_branch + " branch" + (flavor && flavor !== "" ? ` (${flavor})` : ""),
      "new_install_prompt_erase": true,
      "builds": []
    };
    const a32 = findAsset(runArtifacts, `esp32-${flavor}.bin`) || findAsset(runArtifacts, `${flavor}.bin`) || findAsset(runArtifacts, `esp32.bin`)
    if (a32) manifest.builds.push(esp32(`download/${a32.id}/${a32.name}`))

    const c3 = findAsset(runArtifacts, `esp32c3-${flavor}.bin`) || findAsset(runArtifacts, `esp32c3.bin`)
    if (c3) manifest.builds.push(esp32c3(`download/${c3.id}/${c3.name}`))
    return c.json(manifest)
  }
)

app.route('/artifacts', artifacts)

export default app


