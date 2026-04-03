import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function resolveOperatorApiBaseUrl(): string | null {
  const configured = process.env.OPERATOR_API_BASE_URL?.trim();
  return configured && configured.length > 0 ? configured : null;
}

function buildBackendUrl(request: NextRequest, operatorApiBaseUrl: string): string {
  const apiUrl = new URL("/v1/operator/sober-house/control-plane", operatorApiBaseUrl);
  const organizationId = request.nextUrl.searchParams.get("organizationId");
  if (organizationId) {
    apiUrl.searchParams.set("organizationId", organizationId);
  }
  return apiUrl.toString();
}

function buildForwardHeaders(request: NextRequest, includeJsonBody: boolean): Headers {
  const headers = new Headers();
  const authorization = request.headers.get("authorization");
  if (authorization) {
    headers.set("authorization", authorization);
  }
  if (includeJsonBody) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

async function proxyControlPlane(request: NextRequest): Promise<NextResponse> {
  const includeJsonBody = request.method !== "GET" && request.method !== "HEAD";
  const operatorApiBaseUrl = resolveOperatorApiBaseUrl();

  if (!operatorApiBaseUrl) {
    return NextResponse.json(
      {
        error: "operator_api_base_url_missing",
        message: "OPERATOR_API_BASE_URL is required for the sober-house control-plane proxy route.",
      },
      { status: 500 },
    );
  }

  try {
    const response = await fetch(buildBackendUrl(request, operatorApiBaseUrl), {
      method: request.method,
      headers: buildForwardHeaders(request, includeJsonBody),
      body: includeJsonBody ? await request.text() : undefined,
      cache: "no-store",
    });

    return new NextResponse(response.body, {
      status: response.status,
      headers: new Headers(response.headers),
    });
  } catch {
    return NextResponse.json(
      { error: "service_unavailable", message: "Dashboard API is unreachable." },
      { status: 503 },
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return proxyControlPlane(request);
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  return proxyControlPlane(request);
}
