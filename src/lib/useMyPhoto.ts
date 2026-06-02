import { useQuery } from "@tanstack/react-query";
import { api, getToken } from "@/lib/api";

/**
 * Hook compartido para obtener la foto de perfil del usuario actual.
 * React Query cachea la respuesta con key ["me-photo"], así múltiples
 * lugares (Topbar, AppSidebar, Configuración) la pegan al mismo cache.
 *
 * Al actualizar la foto desde Configuración, invalidar ["me-photo"]
 * propaga el cambio a todos los avatares simultáneamente.
 */
export function useMyPhoto() {
  const token = getToken();
  const { data } = useQuery({
    queryKey: ["me-photo"],
    queryFn: () => api.getMyPhoto(),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  return data?.photo_url ?? null;
}
