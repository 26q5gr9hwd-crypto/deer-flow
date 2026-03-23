const DEFAULT_BACKEND_BASE_URL = "http://127.0.0.1:8001";

function getBackendBaseUrl() {
  const baseUrl =
    process.env.BACKEND_BASE_URL ||
    process.env.NEXT_PUBLIC_BACKEND_BASE_URL ||
    DEFAULT_BACKEND_BASE_URL;

  return baseUrl.replace(/\/$/, "");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ thread_id: string }> },
) {
  const { thread_id } = await params;
  const upstream = `${getBackendBaseUrl()}/api/runtime/threads/${thread_id}/introspection`;

  try {
    const response = await fetch(upstream, {
      headers: {
        accept: "application/json",
      },
      cache: "no-store",
    });

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
        error: "Failed to reach the runtime introspection endpoint.",
        details: error instanceof Error ? error.message : "Unknown error",
        upstream,
      },
      {
        status: 502,
      },
    );
  }
}
