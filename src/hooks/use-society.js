import { useQuery } from "@tanstack/react-query";
import { storage } from "../lib/storage";

export function useResidencyByName(name) {
  return useQuery({
    queryKey: ["/api/residency", name],
    enabled: !!name,
    queryFn: async () => {
      if (!name) return null;
      return await storage.getResidencyByName(name);
    },
  });
}

export function useBlocks(residencyId) {
  return useQuery({
    queryKey: ["/api/blocks", residencyId],
    queryFn: async () => {
      return await storage.getBlocks(residencyId);
    },
  });
}

export function useFlats(blockId, residencyId) {
  return useQuery({
    queryKey: ["/api/blocks/flats", blockId, residencyId],
    enabled: !!blockId,
    queryFn: async () => {
      if (!blockId) throw new Error("Block ID required");
      return await storage.getFlatsByBlock(blockId, residencyId);
    },
  });
}
