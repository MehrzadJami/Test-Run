import { useQuery } from "@tanstack/react-query";

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}api/healthz`);
        if (!response.ok) {
          throw new Error("Network response was not ok");
        }
        return response.json();
      } catch (error) {
        throw new Error("Failed to connect");
      }
    },
    refetchInterval: 15000,
    retry: false,
  });
}
