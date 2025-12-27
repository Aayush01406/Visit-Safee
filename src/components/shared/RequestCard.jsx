import { memo } from "react";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "./StatusBadge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Phone, User, Car, CheckCircle, XCircle, LogIn, LogOut } from "lucide-react";
import { useUpdateVisitorStatus } from "@/hooks/use-visitor-requests";
import { useToast } from "@/hooks/use-toast";

export const RequestCard = memo(function RequestCard({ request, variant }) {
  const { mutate: updateStatus, isPending } = useUpdateVisitorStatus();
  const { toast } = useToast();

  const handleStatusChange = (status) => {
    updateStatus({ id: request.id, status }, {
      onSuccess: () => {
        toast({ title: `Request ${status}`, description: `Visitor status updated successfully.` });
      }
    });
  };

  return (
    <Card id={`request-${request.id}`} className="overflow-hidden border-l-4 border-l-primary/20 hover:border-l-primary transition-all duration-300">
      <CardHeader className="pb-3 bg-slate-50/50 flex flex-row items-start justify-between">
        <div>
          <h3 className="font-display font-bold text-lg text-slate-900">{request.visitorName}</h3>
          <div className="flex items-center gap-2 text-sm text-slate-500 mt-1">
            <Phone className="h-3.5 w-3.5" />
            {request.visitorPhone}
          </div>
        </div>
        <StatusBadge status={request.status} />
      </CardHeader>
      
      <CardContent className="pt-4 grid gap-3 text-sm">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-slate-400 text-xs uppercase tracking-wider font-semibold">Location</span>
            <p className="font-medium text-slate-700 mt-0.5">
              {request.flat.block.name} - {request.flat.number}
            </p>
          </div>
          <div>
             <span className="text-slate-400 text-xs uppercase tracking-wider font-semibold">Vehicle</span>
             <div className="flex items-center gap-1.5 mt-0.5">
               <Car className="h-3.5 w-3.5 text-slate-400" />
               <p className="font-medium text-slate-700">{request.vehicleNumber || "N/A"}</p>
             </div>
          </div>
        </div>
        
        <div>
          <span className="text-slate-400 text-xs uppercase tracking-wider font-semibold">Purpose</span>
          <p className="text-slate-700 mt-0.5 leading-relaxed">{request.purpose}</p>
        </div>

        <div className="text-xs text-slate-400 mt-2">
          Requested {format(new Date(request.createdAt || new Date()), "PPP p")}
        </div>
      </CardContent>

      <CardFooter className="bg-slate-50 p-3 flex gap-2 justify-end">
        {variant === "resident" && request.status === "pending" && (
          <>
            <Button 
              variant="outline" 
              size="sm" 
              className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => handleStatusChange("rejected")}
              disabled={isPending}
            >
              <XCircle className="h-4 w-4 mr-1.5" />
              Reject
            </Button>
            <Button 
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => handleStatusChange("approved")}
              disabled={isPending}
            >
              <CheckCircle className="h-4 w-4 mr-1.5" />
              Approve
            </Button>
          </>
        )}

        {variant === "guard" && (
          <>
            {request.status === "approved" && (
              <Button 
                size="sm"
                className="w-full bg-blue-600 hover:bg-blue-700"
                onClick={() => handleStatusChange("entered")}
                disabled={isPending}
              >
                <LogIn className="h-4 w-4 mr-2" />
                Mark Entry
              </Button>
            )}
            {request.status === "entered" && (
              <Button 
                size="sm"
                variant="outline"
                className="w-full border-slate-300 text-slate-700 hover:bg-slate-100"
                onClick={() => handleStatusChange("exited")}
                disabled={isPending}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Mark Exit
              </Button>
            )}
          </>
        )}
      </CardFooter>
    </Card>
  );
});
