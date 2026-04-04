"use client";

import type { SoberHouseOperatorProofReviewRequest } from "../../../../packages/shared-types/src/soberHouse";

type FetchLike = typeof fetch;

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function resolveOperatorProofReviewApiUrl(reviewId: string): string {
  return `/api/operator/sober-house/proof-reviews/${encodeURIComponent(reviewId)}`;
}

function formatOperatorProofReviewError(status: number, payload: unknown): string {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const message = readString((payload as Record<string, unknown>).message);
    if (message) {
      return message;
    }
  }
  if (status === 400) {
    return "The proof review request was invalid.";
  }
  if (status === 401) {
    return "Sign in to continue.";
  }
  if (status === 403) {
    return "You do not have access to review this sober-house proof.";
  }
  if (status === 404) {
    return "That pending proof review is no longer available.";
  }
  return `Proof review failed with status ${status}.`;
}

export async function reviewOperatorSoberHouseProof(input: {
  reviewId: string;
  authHeader: string;
  payload: SoberHouseOperatorProofReviewRequest;
  fetchImpl?: FetchLike;
}): Promise<void> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(resolveOperatorProofReviewApiUrl(input.reviewId), {
    method: "PATCH",
    headers: {
      authorization: input.authHeader,
      "content-type": "application/json",
    },
    body: JSON.stringify(input.payload),
    cache: "no-store",
  });

  if (response.ok) {
    return;
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  throw new Error(formatOperatorProofReviewError(response.status, payload));
}
