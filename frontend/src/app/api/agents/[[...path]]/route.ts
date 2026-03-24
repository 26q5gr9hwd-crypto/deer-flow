const DEFAULT_BACKEND_BASE_URL = "http://127.0.0.1:8001";

function getBackendBaseUrl() {
  const baseUrl =
    process.env.BACKEND_BASE_URL ||
    process.env.NEXT_PUBLIC_BACKEND_BASE_URL ||
    DEFAULT_BACKEND_BASE_URL;

  return baseUrl.replace(/\/$/, "");
}

async function proxy(
  request: Request,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const { path = [] } = await params;
  const requestUrl = new URL(request.url);
  const suffix = path.length > 0 ? `/${path.join("/")}` : "";
  const upstream = new URL(`${getBackendBaseUrl()}/api/agents${suffix}`);
  upstream.search = requestUrl.search;

  try {
    const headers: Record<string, string> = {
      accept: request.headers.get("accept") ?? "application/json",
    };

    const contentType = request.headers.get("content-type");
    if (contentType) {
      headers["content-type"] = contentType;
    }

    const init: RequestInit = {
      method: request.method,
      headers,
      cache: "no-store",
    };

    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = await request.text();
    }

    const response = await fetch(upstream, init);
    const body = await response.text();

    return new Response(body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: "Failed to reach the agents endpoint.",
        details: error instanceof Error ? error.message : "Unknown error",
        upstream: upstream.toString(),
      },
      {
        status: 502,
      },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
