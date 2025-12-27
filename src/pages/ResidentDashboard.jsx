import { Layout } from "@/components/shared/Layout";
import { useVisitorRequests } from "@/hooks/use-visitor-requests";
import { RequestCard } from "@/components/shared/RequestCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Inbox, History } from "lucide-react";
import { useAuth } from "@/hooks/use-auth.jsx";
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function ResidentDashboard() {
  const { user } = useAuth();
  const { data: requests, isLoading } = useVisitorRequests();
  const [location] = useLocation();

  useEffect(() => {
    if (user?.residencyName) {
      document.title = `${user.residencyName} Resident Dashboard`;
    }
  }, [user?.residencyName]);
  
  useEffect(() => {
    try {
      const url = new URL(location, window.location.origin);
      const requestId = url.searchParams.get("requestId");
      if (requestId) {
        const el = document.getElementById(`request-${requestId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    } catch {}
  }, [location, isLoading]);

  // Filter requests locally for this view (API would handle this in real app via auth context)
  const pendingRequests = requests?.filter(r => r.status === "pending") || [];
  const historyRequests = requests?.filter(r => r.status !== "pending") || [];

  return (
    <Layout>
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-slate-900">Welcome, {user?.name || user?.username}</h1>
        <p className="text-slate-500">
          {(() => {
            const flatDisplay = user?.flatNumber || user?.flat;
            return `Manage entry request for ${flatDisplay ? `Flat ${flatDisplay}` : "Flat"} in ${user?.residencyName}.`;
          })()}
        </p>
      </div>

      <Tabs defaultValue="pending" className="space-y-6">
        <TabsList className="bg-white p-1 rounded-xl shadow-sm border border-slate-200">
          <TabsTrigger value="pending" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white">
            <Inbox className="w-4 h-4 mr-2" /> Pending ({pendingRequests.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white">
            <History className="w-4 h-4 mr-2" /> History
          </TabsTrigger>
        </TabsList>

        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="min-h-[400px]">
            <TabsContent value="pending">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <AnimatePresence>
                  {pendingRequests.length > 0 ? (
                    pendingRequests.map((req) => (
                      <motion.div
                        key={req.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        layout
                      >
                        <RequestCard request={req} variant="resident" />
                      </motion.div>
                    ))
                  ) : (
                    <div className="col-span-full flex flex-col items-center justify-center p-12 text-center text-slate-400 border-2 border-dashed rounded-xl border-slate-200">
                      <Inbox className="h-12 w-12 mb-3 opacity-20" />
                      <p>No pending requests.</p>
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </TabsContent>

            <TabsContent value="history">
              <div className="space-y-4">
                {historyRequests.length > 0 ? (
                  historyRequests.map((req) => (
                    <RequestCard key={req.id} request={req} variant="resident" />
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400 border-2 border-dashed rounded-xl border-slate-200">
                    <History className="h-12 w-12 mb-3 opacity-20" />
                    <p>No history found.</p>
                  </div>
                )}
              </div>
            </TabsContent>
          </div>
        )}
      </Tabs>
    </Layout>
  );
}
