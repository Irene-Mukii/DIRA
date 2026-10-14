# Render Fetch MCP service

This folder contains an authenticated, stateless Streamable HTTP gateway for
the pinned official `mcp-server-fetch==2026.10.10` package. The upstream Fetch
package runs over stdio inside the container; the gateway exposes only its
`fetch` tool over HTTPS. This avoids requiring `uvx` inside Dira's Vercel
runtime. Dira and the gateway both use MCP SDK 1.32.1; the gateway's lockfile
pins that dependency.

## Deploy to Render

1. Push the repository branch containing this service to GitHub.
2. In Render, choose **New → Blueprint** and select this repository. Render
   reads the root `render.yaml` and builds `fetch-mcp-server/Dockerfile`.
   Alternatively create a Docker Web Service with that Dockerfile path and
   repository root as the Docker build context.
3. Supply a new random secret as `FETCH_MCP_AUTH_TOKEN` when prompted. Use a
   unique value of at least 32 non-whitespace characters. Do not commit it or
   reuse the Dira MCP token.
4. Deploy the service and wait for the `/health` HTTP check to pass. Render
   provides the HTTPS service URL; the MCP endpoint path is `/mcp`. The
   `/health` route intentionally exposes only readiness and does not require
   the MCP bearer token.
5. In the Render service logs, verify `backend_connection` and `http_server_started`
   report success. The service launches the pinned package in the container and
   exits if it cannot initialize or discover the `fetch` tool.
6. In Vercel, set the following for **Preview/Staging** first:

   | Variable              | Value                                              |
   | --------------------- | -------------------------------------------------- |
   | `FETCH_MCP_ENABLED`   | `true`                                             |
   | `FETCH_MCP_TRANSPORT` | `http`                                             |
   | `FETCH_MCP_URL`       | `https://<your-render-service>.onrender.com/mcp`   |
   | `FETCH_MCP_TOKEN`     | The same secret as Render's `FETCH_MCP_AUTH_TOKEN` |

   These values are server-side only. Do not prefix them with `NEXT_PUBLIC_`.
   Keep the remote token out of source control, client code, logs, and
   screenshots.

7. Redeploy the Vercel Preview deployment. Run the remote integration test
   described below and invoke the read-only `retrieve_education_resources`
   tool. Confirm that Vercel logs show successful `fetch_connection`,
   `fetch_tool_discovery`, and `fetch_request` events, and that Render logs
   show `tool_discovery` and `tool_invocation` with the same correlation ID.
   A successful Dira retrieval response alone is insufficient because the
   validated direct retriever can still produce a result after a Fetch failure.
8. After staging is verified, add the remote variables separately to the
   Vercel **Production** environment and redeploy Production. Keep `FETCH_MCP_ENABLED`
   false in Production until the Render service and Preview test have passed.

When rotating the shared bearer secret, update Render and Vercel and redeploy
both services. The gateway rejects unauthenticated MCP calls with HTTP 401,
limits request bodies and concurrent fetches, restricts tool calls to HTTPS
subdomains of Dira's four configured education domains, and caps `max_length`
at 128,000 characters. It relies on the official Fetch package's default
private-address and redirect protections; do not pass its
`--allow-private-ips` option. The upstream package documents a DNS-rebinding
limitation in that protection, so this is not a general-purpose URL proxy.

## Local development and tests

Local development remains stdio by default:

```powershell
$env:FETCH_MCP_ENABLED = "true"
$env:FETCH_MCP_TRANSPORT = "stdio"
# Set FETCH_MCP_COMMAND only if uvx is not on PATH.
npm run dev
```

Run deterministic gateway checks with:

```powershell
npm --prefix fetch-mcp-server test
```

These tests start the HTTP gateway locally with a mocked upstream client; they
verify bearer enforcement, tool discovery, argument restrictions and tool
forwarding. They do **not** prove Render or official Fetch connectivity.

The opt-in remote test contacts the real configured HTTPS service and invokes
its real Fetch tool. From PowerShell, after setting the Preview endpoint and
token in the environment:

```powershell
$env:RUN_FETCH_MCP_REMOTE_INTEGRATION = "true"
$env:FETCH_MCP_ENABLED = "true"
$env:FETCH_MCP_TRANSPORT = "http"
$env:FETCH_MCP_URL = "https://<your-render-service>.onrender.com/mcp"
$env:FETCH_MCP_TOKEN = "<Preview token>"
npm run test:fetch-mcp
```

The test makes an outbound request to `ies.ed.gov`. It is skipped unless
`RUN_FETCH_MCP_REMOTE_INTEGRATION=true`; missing credentials, an unavailable
Render service, authentication failures, or source failures are test failures,
not passes.
