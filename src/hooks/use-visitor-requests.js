import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { insertVisitorRequestSchema } from "../lib/types";
import { storage } from "../lib/storage";
import { useEffect } from "react";

export function useVisitorRequests(filters) {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Subscribe to real-time updates
    const unsubscribe = storage.subscribeToVisitorRequests((data) => {
      queryClient.setQueryData(["/api/visitor-requests", filters], data);
    }, filters);

    return () => {
      unsubscribe();
    };
  }, [JSON.stringify(filters), queryClient]);

  return useQuery({
    queryKey: ["/api/visitor-requests", filters],
    queryFn: async () => {
      // Initial fetch fallback
      return await storage.getVisitorRequests(filters);
    },
    staleTime: Infinity,
  });
}

export function useCreateVisitorRequest() {
  return useMutation({
    mutationFn: async (data) => {
      const payload = { 
        ...data, 
        flatId: String(data.flatId),
        vehicleNumber: data.vehicleNumber || undefined 
      };
      const validated = insertVisitorRequestSchema.parse(payload);
      
      return await storage.createVisitorRequest({
        ...validated,
        vehicleNumber: validated.vehicleNumber || null
      });
    },
  });
}

export function useCreatePublicVisitorRequest() {
  return useMutation({
    mutationFn: async ({ data, residencyId, residencyName }) => {
      const payload = { 
        ...data, 
        flatId: String(data.flatId),
        vehicleNumber: data.vehicleNumber || undefined 
      };
      const validated = insertVisitorRequestSchema.parse(payload);
      
      return await storage.createPublicVisitorRequest({
        ...validated,
        vehicleNumber: validated.vehicleNumber || null
      }, residencyId, residencyName);
    },
  });
}

export function useUpdateVisitorStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }) => {
      return await storage.updateVisitorRequestStatus(id, status);
    },
    onSuccess: () => {
      // Invalidate both user and admin queries
      queryClient.invalidateQueries({ queryKey: ["/api/visitor-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/visitor-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
    },
  });
}
