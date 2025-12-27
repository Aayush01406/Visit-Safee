import { useQuery } from "@tanstack/react-query";
import { storage } from "../lib/storage";

export function useStats() {
  return useQuery({
    queryKey: ["/api/admin/stats"],
    queryFn: async () => {
      return await storage.getStats();
    },
  });
}
