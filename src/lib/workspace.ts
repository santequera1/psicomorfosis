import { useQuery } from "@tanstack/react-query";
import { api, getStoredUser, type Workspace, type WorkspaceMode } from "./api";

export function useWorkspace() {
  const storedUser = getStoredUser();
  return useQuery<Workspace>({
    queryKey: ["workspace"],
    queryFn: () => api.getWorkspace(),
    enabled: !!storedUser,
    staleTime: 60_000,
  });
}

export function useWorkspaceMode(): WorkspaceMode | null {
  const u = getStoredUser();
  return u?.workspaceMode ?? null;
}
