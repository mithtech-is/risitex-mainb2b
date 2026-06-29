"use client";

import * as React from "react";
import { cn } from "./utils";

/**
 * Skeleton — the one allowed infinite animation. Uses the `skeleton` class
 * from styles.css which carries the shimmer keyframe.
 */
export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("skeleton rounded-md", className)}
      {...props}
    />
  ),
);
Skeleton.displayName = "Skeleton";
