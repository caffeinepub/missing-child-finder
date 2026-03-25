import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type Alert,
  type ChildRecord,
  type DashboardStats,
  Status,
  type UserProfile,
  UserRole,
} from "../backend";
import { useActor } from "./useActor";

export function useGetAllCases() {
  const { actor, isFetching } = useActor();
  return useQuery<ChildRecord[]>({
    queryKey: ["cases"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.getAllCases();
    },
    enabled: !!actor && !isFetching,
    staleTime: 30_000,
  });
}

export function useGetDashboardStats() {
  const { actor, isFetching } = useActor();
  return useQuery<DashboardStats>({
    queryKey: ["dashboardStats"],
    queryFn: async () => {
      if (!actor) return { totalCases: 0n, activeCases: 0n, foundCases: 0n };
      return actor.getDashboardStats();
    },
    enabled: !!actor && !isFetching,
    staleTime: 30_000,
  });
}

export function useGetCallerProfile() {
  const { actor, isFetching } = useActor();
  return useQuery<UserProfile | null>({
    queryKey: ["callerProfile"],
    queryFn: async () => {
      if (!actor) return null;
      return actor.getCallerUserProfile();
    },
    enabled: !!actor && !isFetching,
  });
}

export function useGetCallerRole() {
  const { actor, isFetching } = useActor();
  return useQuery<UserRole>({
    queryKey: ["callerRole"],
    queryFn: async () => {
      if (!actor) return UserRole.guest;
      return actor.getCallerUserRole();
    },
    enabled: !!actor && !isFetching,
  });
}

export function useIsCallerAdmin() {
  const { actor, isFetching } = useActor();
  return useQuery<boolean>({
    queryKey: ["isAdmin"],
    queryFn: async () => {
      if (!actor) return false;
      return actor.isCallerAdmin();
    },
    enabled: !!actor && !isFetching,
  });
}

export function useGetAlerts() {
  const { actor, isFetching } = useActor();
  return useQuery<Alert[]>({
    queryKey: ["alerts"],
    queryFn: async () => {
      if (!actor) return [];
      try {
        return await actor.getAlerts();
      } catch {
        // Non-admin users will get an unauthorized error — return empty array
        return [];
      }
    },
    enabled: !!actor && !isFetching,
  });
}

export function useRegisterCase() {
  const { actor } = useActor();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (record: ChildRecord) => {
      if (!actor)
        throw new Error("Backend not connected. Please wait and try again.");

      let lastError: unknown;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          await actor.registerCase(record);
          return;
        } catch (err: unknown) {
          lastError = err;
          const msg = String((err as { message?: string })?.message ?? err);
          const isTransient =
            msg.includes("IC0508") ||
            msg.includes("is stopped") ||
            msg.includes("stopped") ||
            msg.includes("canister is stopping") ||
            msg.includes("temporarily unavailable");
          if (isTransient && attempt < 3) {
            await new Promise((resolve) =>
              setTimeout(resolve, 2000 * (attempt + 1)),
            );
            continue;
          }
          throw err;
        }
      }
      throw lastError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
    },
  });
}

export function useUpdateStatusToFound() {
  const { actor } = useActor();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (contactNumber: string) => {
      if (!actor) throw new Error("Not authenticated");
      await actor.updateStatusToFound(contactNumber);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
    },
  });
}

export function useUpdateCaseStatus() {
  const { actor } = useActor();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      contactNumber,
      status,
    }: {
      contactNumber: string;
      status: Status;
    }) => {
      if (!actor) throw new Error("Not authenticated");
      await actor.updateCaseStatus([contactNumber, status]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
    },
  });
}

export function useDeleteCase() {
  const { actor } = useActor();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (contactNumber: string) => {
      if (!actor) throw new Error("Not authenticated");
      await actor.deleteCase(contactNumber);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
    },
  });
}

export function useAddAlert() {
  const { actor } = useActor();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      contactNumber,
      message,
    }: {
      contactNumber: string;
      message: string;
    }) => {
      if (!actor) throw new Error("Not authenticated");
      await actor.addAlert([contactNumber, message]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
  });
}

export { Status };
