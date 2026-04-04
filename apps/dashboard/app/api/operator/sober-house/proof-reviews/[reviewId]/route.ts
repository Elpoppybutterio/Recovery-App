import { NextResponse } from "next/server";

const CACHE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

function resolveUpstreamBaseUrl(): string | null {
  const operatorApiBaseUrl = process.env.OPERATOR_API_BASE_URL?.trim();
  if (operatorApiBaseUrl && operatorApiBaseUrl.length > 0) {
    return operatorApiBaseUrl;
  }

  const publicApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (publicApiUrl && publicApiUrl.length > 0) {
    return publicApiUrl;
  }

  return null;
}

async function decodeUpstreamJson(response: Response): Promise<unknown> {
  const bodyText = await response.text();
  return bodyText.length > 0 ? (JSON.parse(bodyText) as unknown) : null;
}

function buildUpstreamUrl(baseUrl: string, reviewId: string): string {
  return new URL(
    `/v1/operator/sober-house/proof-reviews/${encodeURIComponent(reviewId)}`,
    baseUrl,
  ).toString();
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ reviewId: string }> },
): Promise<Response> {
  const upstreamBaseUrl = resolveUpstreamBaseUrl();
  if (!upstreamBaseUrl) {
    return NextResponse.json(
      {
        error: "server_misconfigured",
        message: "Dashboard operator proxy is missing an upstream API base URL.",
      },
      {
        status: 500,
        headers: CACHE_HEADERS,
      },
    );
  }

  const { reviewId } = await context.params;
  const upstreamHeaders = new Headers();
  const authorization = request.headers.get("authorization");
  if (authorization) {
    upstreamHeaders.set("authorization", authorization);
  }
  const contentType = request.headers.get("content-type");
  if (contentType) {
    upstreamHeaders.set("content-type", contentType);
  }

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(buildUpstreamUrl(upstreamBaseUrl, reviewId), {
      method: "PATCH",
      headers: upstreamHeaders,
      body: await request.text(),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      {
        error: "bad_gateway",
        message: "Dashboard API could not reach upstream service.",
      },
      {
        status: 502,
        headers: CACHE_HEADERS,
      },
    );
  }

  try {
    const payload = await decodeUpstreamJson(upstreamResponse);
    return NextResponse.json(payload, {
      status: upstreamResponse.status,
      headers: CACHE_HEADERS,
    });
  } catch {
    return NextResponse.json(
      {
        error: "bad_gateway",
        message: "Dashboard API could not decode upstream response.",
      },
      {
        status: 502,
        headers: CACHE_HEADERS,
      },
    );
  }
}
