import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { backendInterface } from "../backend";
import { createActorWithConfig } from "../config";
import { getSecretParameter } from "../utils/urlParams";
import { useInternetIdentity } from "./useInternetIdentity";

const ACTOR_QUERY_KEY = "actor";

async function createActorWithRetry(
  identity?: unknown,
  retries = 3,
): Promise<backendInterface> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const isAuthenticated = !!identity;
      const actorOptions = isAuthenticated
        ? { agentOptions: { identity } }
        : undefined;

      // @ts-ignore
      const actor = await createActorWithConfig(actorOptions);

      if (isAuthenticated) {
        const adminToken = getSecretParameter("caffeineAdminToken") || "";
        try {
          await actor._initializeAccessControlWithSecret(adminToken);
        } catch {
          // Non-fatal: canister may be restarting. Actor still usable.
        }
      }

      return actor;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * (attempt + 1)),
        );
      }
    }
  }
  throw lastError;
}

export function useActor() {
  const { identity } = useInternetIdentity();
  const queryClient = useQueryClient();

  const actorQuery = useQuery<backendInterface>({
    queryKey: [ACTOR_QUERY_KEY, identity?.getPrincipal().toString()],
    queryFn: () => createActorWithRetry(identity),
    staleTime: Number.POSITIVE_INFINITY,
    retry: 3,
    retryDelay: (attempt) => 1000 * (attempt + 1),
    enabled: true,
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
    actor: actorQuery.data || null,
    isFetching: actorQuery.isFetching,
    isError: actorQuery.isError,
    refetch: actorQuery.refetch,
  };
}
