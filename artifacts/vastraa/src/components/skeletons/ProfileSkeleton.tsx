import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface ProfileSkeletonProps {
  className?: string;
}

export function ProfileSkeleton({ className }: ProfileSkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading profile"
      className={cn("space-y-6 max-w-4xl mx-auto", className)}
    >
      {/* Profile Header Card */}
      <div className="bg-white dark:bg-[#12141A] rounded-2xl border border-gray-200/80 dark:border-white/10 p-6 flex flex-col sm:flex-row items-center gap-6 shadow-xs">
        <div className="relative">
          <Skeleton className="w-24 h-24 rounded-full" />
        </div>
        <div className="space-y-2 text-center sm:text-left flex-1">
          <Skeleton className="h-6 w-48 rounded mx-auto sm:mx-0" />
          <Skeleton className="h-4 w-64 rounded mx-auto sm:mx-0" />
          <div className="flex gap-2 justify-center sm:justify-start pt-1">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
        </div>
      </div>

      {/* Form Fields Card */}
      <div className="bg-white dark:bg-[#12141A] rounded-2xl border border-gray-200/80 dark:border-white/10 p-6 shadow-xs space-y-6">
        <Skeleton className="h-5 w-36 rounded" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3.5 w-24 rounded" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-4 border-t border-gray-100 dark:border-white/5">
          <Skeleton className="h-10 w-32 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export default ProfileSkeleton;
