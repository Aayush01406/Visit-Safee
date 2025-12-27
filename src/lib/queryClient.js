import { QueryClient } from "@tanstack/react-query";

export const getQueryFn =
  () =>
  async () => {
    throw new Error("API calls are not supported in frontend-only mode. Use storage service.");
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
