import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { backendInterface } from "../backend";
import { createActorWithConfig } from "../config";
import { getSecretParameter } from "../utils/urlParams";
import { useInternetIdentity } from "./useInternetIdentity";

const ACTOR_QUERY_KEY = "actor";

async function createActor(
  identity?: ReturnType<typeof useInternetIdentity>["identity"],
): Promise<backendInterface> {
  if (!identity) {
    return await createActorWithConfig();
  }

  const actorOptions = {
    agentOptions: { identity },
  };

  const actor = await createActorWithConfig(actorOptions);

  // Wrap this call so it never blocks the actor from loading
  try {
    const adminToken = getSecretParameter("caffeineAdminToken") || "";
    await actor._initializeAccessControlWithSecret(adminToken);
  } catch {
    // Ignore — canister may be mid-restart; actor still usable
  }

  return actor;
}

export function useActor() {
  const { identity } = useInternetIdentity();
  const queryClient = useQueryClient();

  const actorQuery = useQuery<backendInterface>({
    queryKey: [ACTOR_QUERY_KEY, identity?.getPrincipal().toString()],
    queryFn: () => createActor(identity),
    staleTime: Number.POSITIVE_INFINITY,
    enabled: true,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
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
