import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { backendInterface } from "../backend";
import { createActorWithConfig } from "../config";
import { getSecretParameter } from "../utils/urlParams";
import { useInternetIdentity } from "./useInternetIdentity";

const ACTOR_QUERY_KEY = "actor";

async function createActorWithRetry(
  options?: Parameters<typeof createActorWithConfig>[0],
  maxRetries = 3,
): Promise<backendInterface> {
  let lastErr: unknown;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const actor = await createActorWithConfig(options);
      const adminToken = getSecretParameter("caffeineAdminToken") || "";
      try {
        await actor._initializeAccessControlWithSecret(adminToken);
      } catch {
        // Ignore init errors — canister may be restarting; actor still usable
      }
      return actor;
    } catch (err: unknown) {
      lastErr = err;
      const msg = String((err as { message?: string })?.message ?? err);
      const isTransient =
        msg.includes("IC0508") ||
        msg.includes("is stopped") ||
        msg.includes("temporarily unavailable") ||
        msg.includes("canister is stopping");
      if (isTransient && i < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export function useActor() {
  const { identity } = useInternetIdentity();
  const queryClient = useQueryClient();
  const actorQuery = useQuery<backendInterface>({
    queryKey: [ACTOR_QUERY_KEY, identity?.getPrincipal().toString()],
    queryFn: async () => {
      const isAuthenticated = !!identity;
      if (!isAuthenticated) {
        return createActorWithRetry();
      }
      return createActorWithRetry({ agentOptions: { identity } });
    },
    staleTime: Number.POSITIVE_INFINITY,
    enabled: true,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });

  // When the actor changes, invalidate dependent queries
  useEffect(() => {
    if (actorQuery.data) {
      queryClient.invalidateQueries({
        predicate: (query) => !query.queryKey.includes(ACTOR_QUERY_KEY),
      });
      queryClient.refetchQueries({
        predicate: (query) => !query.queryKey.includes(ACTOR_QUERY_KEY),
      });
    }
  }, [actorQuery.data, queryClient]);

  return {
    actor: actorQuery.data ?? null,
    isFetching: actorQuery.isFetching,
    isError: actorQuery.isError,
    refetch: actorQuery.refetch,
  };
}
