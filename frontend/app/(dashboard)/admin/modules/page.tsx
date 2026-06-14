"use client";

import { useModules } from "@/lib/hooks/useModules";
import { adminApi, SystemModule } from "@/lib/api/admin";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/lib/hooks/useToast";
import { PremiumIcons } from "@/components/ui/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useAuthStore } from "@/store/authStore";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getUserFacingError } from "@/lib/api/errors";

type PremiumIconName = keyof typeof PremiumIcons;

// error messages handled by getUserFacingError

function isPremiumIconName(icon: string): icon is PremiumIconName {
  return icon in PremiumIcons;
}

export default function ModuleControlPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { canViewModuleManagement, modules, isLoading, error, refetch } = useModules();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (user && !canViewModuleManagement) {
      router.replace("/dashboard");
    }
  }, [canViewModuleManagement, router, user]);

  const mutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<SystemModule> }) =>
      adminApi.modules.update(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "modules"] });
      toast({
        title: "Module Updated",
        description: `${data.name} is now ${data.is_enabled ? "enabled" : "disabled"}.`,
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "Error updating module",
        description: getUserFacingError(error),
        variant: "destructive",
      });
    },
  });

  const handleToggle = (module: SystemModule) => {
    mutation.mutate({
      id: module.id,
      data: { is_enabled: !module.is_enabled },
    });
  };

  if (!user || !canViewModuleManagement) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading modules...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center space-y-4">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p className="text-muted-foreground text-center">
          Failed to load modules<br />
          {getUserFacingError(error)}
        </p>
        <Button onClick={() => refetch()} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Module Control</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {modules.map((module) => {
          const Icon = isPremiumIconName(module.icon) ? PremiumIcons[module.icon] : PremiumIcons.Settings;
          return (
            <Card key={module.id} className={cn("overflow-hidden transition-all duration-300", !module.is_enabled && "opacity-60 grayscale-[50%]")}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center space-x-3">
                  <div className={cn(
                    "p-2 rounded-lg",
                    module.is_enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  )}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold">{module.name}</CardTitle>
                    <CardDescription className="text-xs">{module.slug}</CardDescription>
                  </div>
                </div>
                <Switch
                  checked={module.is_enabled}
                  onCheckedChange={() => handleToggle(module)}
                  disabled={mutation.isPending && mutation.variables?.id === module.id}
                />
              </CardHeader>
              <CardContent className="pt-2">
                <p className="text-sm text-muted-foreground line-clamp-2 min-h-[40px]">
                  {module.description}
                </p>
                <div className="mt-4 flex items-center justify-between">
                  <Badge variant={module.is_enabled ? "default" : "outline"} className={cn(
                    !module.is_enabled && "bg-transparent text-muted-foreground"
                  )}>
                    {module.is_enabled ? "Active" : "Disabled"}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    Last updated: {new Date(module.updated_at).toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
