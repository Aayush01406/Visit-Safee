import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Maintenance({ residencyName }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
            <div className="bg-destructive/10 p-6 rounded-full">
                <ShieldAlert className="h-16 w-16 text-destructive" />
            </div>
        </div>
        
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Maintenance Mode
        </h1>
        
        <p className="text-lg text-slate-600">
            {residencyName ? `"${residencyName}"` : "This website"} is currently in maintenance mode.
        </p>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
            <p className="text-sm text-slate-500 mb-4">
                Access is temporarily disabled by the administrator.
            </p>
            <p className="font-medium text-slate-900">
                Please contact your Residency Chairman or Admin for more information.
            </p>
        </div>

        <Button variant="outline" onClick={() => window.location.reload()}>
            Refresh Page
        </Button>
      </div>
    </div>
  );
}
