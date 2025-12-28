import { useEffect, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, ArrowLeft, XCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { storage } from "@/lib/storage";

export default function VisitorStatus() {
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    const residencyId = params.get("residencyId");

    if (!id) {
      setStatus("not_found");
      return;
    }

    const unsubscribe = storage.subscribeToVisitorRequest(id, (req) => {
      if (req) {
        setStatus(req.status);
      } else {
        setStatus("not_found");
      }
    }, residencyId || undefined);

    return () => {
      unsubscribe();
    };
  }, []);

  const getConfig = () => {
    switch (status) {
      case "approved":
      case "entered":
      case "exited":
        return {
          borderColor: "border-t-green-500",
          bg: "bg-green-50/50",
          glow: "bg-green-400/20",
          icon: CheckCircle2,
          iconColor: "text-green-500",
          title: "Request Approved – Please proceed to gate",
          desc: "The resident has approved your entry. You may now proceed to the security gate."
        };
      case "rejected":
        return {
          borderColor: "border-t-red-500",
          bg: "bg-red-50/50",
          glow: "bg-red-400/20",
          icon: XCircle,
          iconColor: "text-red-500",
          title: "Request Rejected",
          desc: "Sorry, your entry request has been rejected by the resident."
        };
      case "not_found":
        return {
          borderColor: "border-t-slate-500",
          bg: "bg-slate-50/50",
          glow: "bg-slate-400/20",
          icon: AlertCircle,
          iconColor: "text-slate-500",
          title: "Request Not Found",
          desc: "Could not find your request details. It may have been deleted or expired."
        };
      case "pending":
      case "loading":
      default:
        return {
          borderColor: "border-t-amber-500",
          bg: "bg-amber-50/50",
          glow: "bg-amber-400/20",
          icon: Clock,
          iconColor: "text-amber-500",
          title: "Request Pending",
          desc: "Your request has been sent to the resident. Please wait while they approve your entry."
        };
    }
  };

  const config = getConfig();
  const Icon = config.icon;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md text-center"
      >
        <Card className={`border-t-4 ${config.borderColor} shadow-xl overflow-hidden transition-colors duration-500`}>
          <div className={`${config.bg} p-8 flex justify-center transition-colors duration-500`}>
            <div className="relative">
               <div className={`absolute inset-0 ${config.glow} blur-xl rounded-full transition-colors duration-500`} />
               <Icon className={`relative h-20 w-20 ${config.iconColor} transition-colors duration-500`} />
            </div>
          </div>
          
          <CardContent className="pt-8 pb-8 px-6">
            <h2 className="text-2xl font-display font-bold text-slate-900 mb-2">{config.title}</h2>
            <p className="text-slate-500 mb-6">
              {config.desc}
            </p>

            {/* Only show "What happens next" if pending */}
            {(status === "pending" || status === "loading") && (
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-100 text-sm text-left mb-6">
                <p className="font-medium text-slate-700 mb-1">What happens next?</p>
                <ol className="list-decimal list-inside space-y-1 text-slate-500">
                  <li>Resident receives notification</li>
                  <li>They approve or reject your request</li>
                  <li>Guard verifies approval at the gate</li>
                </ol>
              </div>
            )}

            <Link href="/">
              <Button variant="outline" className="w-full">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
              </Button>
            </Link>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
