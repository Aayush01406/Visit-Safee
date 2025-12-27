import { useQuery, useQueryClient } from "@tanstack/react-query";
import { storage } from "../lib/storage";
import { useEffect } from "react";

export function useAdminVisitorLogs() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsubscribe = storage.subscribeToVisitorRequests((data) => {
      queryClient.setQueryData(["/api/admin/visitor-requests"], data);
    });

    return () => {
      unsubscribe();
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ["/api/admin/visitor-requests"],
    queryFn: async () => {
      return await storage.getAllVisitorRequestsWithDetails();
    },
    staleTime: Infinity,
  });
}
