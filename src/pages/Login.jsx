import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth.jsx";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, Loader2, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { loginSchema } from "@/lib/types";
import { storage } from "@/lib/storage";

export default function Login() {
  const { user, role, loading, login, isLoggingIn } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    const societyPath = user.residencyName ? `/${encodeURIComponent(user.residencyName)}` : "";
    if (role === "admin") {
      setLocation(`${societyPath}/admin`);
    } else if (role === "guard") {
      setLocation(`${societyPath}/guard`);
    } else {
      const flatPath = user.flatNumber ? `/${user.flatNumber}` : "";
      setLocation(`${societyPath}/resident${flatPath}`);
    }
  }, [user, role, loading, setLocation]);
  
  const { data: residencies, isLoading: isLoadingResidencies } = useQuery({
    queryKey: ["residencies"],
    queryFn: async () => await storage.getResidencies()
  });

  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "", residencyId: "" },
  });

  const onSubmit = (data) => {
    login(data, {
      onError: (err) => {
        toast({
          title: "Login Failed",
          description: err.message,
          variant: "destructive",
        });
      },
    });
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left: Branding */}
      <div className="hidden lg:flex flex-col justify-between bg-primary p-12 text-primary-foreground relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1554469384-e58fac16e23a?w=1600&h=1600&fit=crop')] opacity-10 bg-cover bg-center" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-primary/90" />
        
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-8 w-8" />
            <span className="font-display font-bold text-2xl">SecureEntry</span>
          </div>
          <p className="text-primary-foreground/80">Advanced Visitor Management System</p>
        </div>

        <div className="relative z-10">
          <blockquote className="space-y-2">
            <p className="text-xl font-display font-medium leading-relaxed">
              "Ensuring safety and seamless entry management for modern residential societies."
            </p>
          </blockquote>
        </div>
      </div>

      {/* Right: Form */}
      <div className="flex items-center justify-center p-8 bg-slate-50">
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-full max-w-sm space-y-6"
        >
          <div className="text-center lg:text-left">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Sign in to your account</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Select your society and login.
            </p>
          </div>

          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="residencyId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Residency</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={isLoadingResidencies ? "Loading societies..." : "Select your society"} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {residencies?.map((residency) => (
                              <SelectItem key={residency.id} value={residency.id}>
                                {residency.name}
                              </SelectItem>
                            ))}
                            {residencies?.length === 0 && (
                               <div className="p-2 text-sm text-muted-foreground text-center">No societies found</div>
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input type="password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" className="w-full" disabled={isLoggingIn || isLoadingResidencies}>
                    {isLoggingIn ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      "Sign In"
                    )}
                  </Button>
                </form>
              </Form>

              <div className="mt-6 text-center text-sm">
                <span className="text-muted-foreground">New Society? </span>
                <Link href="/register-residency" className="font-medium text-primary hover:underline">
                  Register your residency
                </Link>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
