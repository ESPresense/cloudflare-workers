// We support the GET, POST, HEAD, and OPTIONS methods from any origin,
// and allow any header on requests. These headers must be present
// on all responses to all CORS preflight requests. In practice, this means
// all responses to OPTIONS requests.
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
    "Access-Control-Max-Age": "86400",
}

// The endpoint you want the CORS reverse proxy to be on
const PROXY_ENDPOINT = "/releases/"
const DOWNLOAD_ENDPOINT = "/releases/latest-any/download/"

async function cacheResponse(event, request, ttlSeconds, responder) {
    const cacheKey = new Request(request.url)
    const cache = caches.default
    const cached = await cache.match(cacheKey)
    if (cached) return cached

    const response = await responder()
    if (response.status < 400) {
        const cacheable = new Response(response.body, response)
        cacheable.headers.set("Cache-Control", `public, max-age=${ttlSeconds}`)
        event.waitUntil(cache.put(cacheKey, cacheable.clone()))
        return cacheable
    }

    return response
}

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

function findAsset(rel, name)
{
    var f = rel.assets.filter(f => f.name == name)
    return f.length ? f[0] : null
}

async function manifestResponse(request, event) {
    const url = new URL(request.url)
    const { pathname, searchParams } = url
    const fname = pathname.substring(pathname.lastIndexOf('/') + 1);
    const tag = fname.substring(0, fname.lastIndexOf('.'));

    return cacheResponse(event, request, 900, async () => {
        const apiRequest = new Request(`https://api.github.com/repos/ESPresense/ESPresense/releases/tags/${tag}`)
        apiRequest.headers.set("User-Agent", "espresense-release-proxy")
        apiRequest.followAllRedirects = true
        console.log(`Request: ${apiRequest.url}`)
        const response = await fetch(apiRequest)
        const rel = JSON.parse(await response.text());
        const flavor = searchParams.get('flavor');
        var manifest = {
            "name": "ESPresense " + rel.name + (flavor && flavor != "" ? ` (${flavor})` : ""),
            "new_install_prompt_erase": true,
            "builds": []
        };
        var a32 = findAsset(rel, `esp32-${flavor}.bin`) || findAsset(rel, `${flavor}.bin`) || findAsset(rel, `esp32.bin`)
        console.log(JSON.stringify(a32))
        if (a32) manifest.builds.push(esp32(`download/${tag}/${a32.name}`))

        var c3 = findAsset(rel, `esp32c3-${flavor}.bin`) || findAsset(rel, `esp32c3.bin`)
        if (c3) manifest.builds.push(esp32c3(`download/${tag}/${c3.name}`))

        console.log(JSON.stringify(manifest))

        const responseBody = JSON.stringify(manifest)
        const responseHeaders = {
            "Content-Type": "text/json;charset=UTF-8",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=900"
        }

        return new Response(responseBody, { headers: responseHeaders })
    })
}

async function fetchFromGithub(request, event) {
    const API_URL = "https://github.com/ESPresense/ESPresense"
    const path = new URL(request.url).pathname
    const url = API_URL + path
    const cacheKey = new Request(request.url)

    return cacheResponse(event, request, 1500, async () => {
        const githubRequest = new Request(url)
        githubRequest.followAllRedirects = true
        console.log(`Request: ${githubRequest.url}`)

        githubRequest.headers.set("Origin", new URL(request.url).pathname)
        let response = await fetch(githubRequest);

        // Recreate the response so we can modify the headers
        response = new Response(response.body, response)

        // Set CORS headers
        response.headers.set("Access-Control-Allow-Origin", "*")
        response.headers.set("Cache-Control", "public, max-age=1500")

        return response
    })
}

function handleOptions(request) {
    // Make sure the necessary headers are present
    // for this to be a valid pre-flight request
    let headers = request.headers;
    if (
        headers.get("Origin") !== null &&
        headers.get("Access-Control-Request-Method") !== null &&
        headers.get("Access-Control-Request-Headers") !== null
    ) {
        // Handle CORS pre-flight request.
        // If you want to check or reject the requested method + headers
        // you can do that here.
        let respHeaders = {
            ...corsHeaders,
            // Allow all future content Request headers to go back to browser
            // such as Authorization (Bearer) or X-Client-Name-Version
            "Access-Control-Allow-Headers": request.headers.get("Access-Control-Request-Headers"),
        }

        return new Response(null, {
            headers: respHeaders,
        })
    } else {
        // Handle standard OPTIONS request.
        // If you want to allow other HTTP Methods, you can do that here.
        return new Response(null, {
            headers: {
                Allow: "GET, HEAD, POST, OPTIONS",
            },
        })
    }
}

async function redirectToPrerelease(request, event) {
    const url = new URL(request.url)
    const { pathname, searchParams } = url
    const fname = pathname.substring(pathname.lastIndexOf('/') + 1);
    console.log(fname);

    return cacheResponse(event, request, 1500, async () => {
        request = new Request("https://api.github.com/repos/ESPresense/ESPresense/releases")
        request.headers.set("User-Agent", "espresense-release-proxy")
        request.followAllRedirects = true

        let releases = await fetch(request)
        const rels = JSON.parse(await releases.text());
        const rel = rels.find(a => a.assets.length);
        if (!rel) return new Response(null, { status: 404, statusText: "No release found!" });
        const asset = rel.assets.find(a => a.name == fname);
        if (!asset) return new Response(null, { status: 404, statusText: "No asset found!" });
        let response = new Response(null, { status: 302 });
        response.headers.set("Location", asset.browser_download_url);
        response.headers.set("Cache-Control", "public, max-age=1500")

        return response
    })
}

addEventListener("fetch", event => {
    const request = event.request
    const path = new URL(request.url).pathname

    if (path.startsWith(PROXY_ENDPOINT)) {
        if (request.method === "OPTIONS") {
            // Handle CORS preflight requests
            event.respondWith(handleOptions(request))
        } else if (
            request.method === "GET" ||
            request.method === "HEAD" ||
            request.method === "POST"
        ) {
            if (path.endsWith(".json"))
                event.respondWith(manifestResponse(request, event))
            else if (path.endsWith(".bin")) {
                if (path.startsWith(DOWNLOAD_ENDPOINT))
                    event.respondWith(redirectToPrerelease(request, event))
                else
                    event.respondWith(fetchFromGithub(request, event))
            }
        } else {
            event.respondWith(
                new Response(null, {
                    status: 405,
                    statusText: "Method Not Allowed",
                }),
            )
        }
    }
})
