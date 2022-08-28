import { Hono } from 'hono'
import { prettyJSON } from 'hono/pretty-json'
import { cache } from 'hono/cache'
import { cors } from 'hono/cors'

import { Octokit } from "@octokit/core"
import * as fflate from "fflate";

function esp32(path) {
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

function esp32c3(path) {
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

function findAsset(rel, name) {
  var f = rel.filter(f => f.name == name)
  return f.length ? f[0] : null
}

const app = new Hono()
app.use("*", cors())
app.get('*', cache({ cacheName: 'artifacts', cacheControl: 'public, max-age=900' }))
const octokit = new Octokit({})

const artifacts = new Hono()
artifacts.use('*', prettyJSON())

artifacts.all('/latest/download/:branch/:bin', async (c) => {
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
  for (let i = 0; i < resp.data.workflow_runs.length; i++) {
    const run_id = resp.data.workflow_runs[i].id;
    const sha = resp.data.workflow_runs[i].head_sha;
    return c.redirect(`/artifacts/download/runs/${run_id}/${sha.substring(0,7)}/${bin}`)
  }
})

artifacts.all('/download/runs/:run_id/:sha/:bin', async (c) => {
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
  return c.redirect(`/artifacts/download/${artifact.id}/${bin}`)
});

artifacts.get('/download/:artifact_id/*', async (c) => {
  const artifact_id = parseInt(c.req.param('artifact_id'))
  console.log({ artifact_id })
  const artifact = await fetch(`https://nightly.link/ESPresense/ESPresense/actions/artifacts/${artifact_id}.zip`)
  if (artifact.status != 200) throw new Error(`Artifact ${artifact_id} status code ${artifact.status}`)
  const ab = await artifact.arrayBuffer()
  const arr = new Uint8Array(ab)
  const files = fflate.unzipSync(arr)
  for (const key in files) {
    if (Object.prototype.hasOwnProperty.call(files, key)) {
      return c.newResponse(files[key], 200, { 'Content-Type': 'application/octet-stream' });
    }
  }
});

artifacts.get('/:run_id_2{[0-9]+.json}', async (c) => {
  const flavor = c.req.query('flavor');
  const run_id = parseInt(c.req.param('run_id_2'));
  console.log({ flavor, run_id })

  var resp = await octokit.request('GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts', {
    owner: 'ESPresense',
    repo: 'ESPresense',
    run_id: run_id
  })

  let artifacts = resp.data.artifacts;
  let workflow_run = artifacts[0].workflow_run;
  if (!workflow_run) throw new Error("No workflow run found");

  let manifest: any = {
    "name": "ESPresense " + workflow_run.head_branch + " branch" + (flavor && flavor != "" ? ` (${flavor})` : ""),
    "new_install_prompt_erase": true,
    "builds": []
  };
  var a32 = findAsset(artifacts, `esp32-${flavor}.bin`) || findAsset(artifacts, `${flavor}.bin`) || findAsset(artifacts, `esp32.bin`)
  if (a32) manifest.builds.push(esp32(`download/${a32.id}/${a32.name}`))

  var c3 = findAsset(artifacts, `esp32c3-${flavor}.bin`) || findAsset(artifacts, `esp32c3.bin`)
  if (c3) manifest.builds.push(esp32c3(`download/${c3.id}/${c3.name}`))
  return c.json(manifest)
})

app.route('/artifacts', artifacts)

export default app


