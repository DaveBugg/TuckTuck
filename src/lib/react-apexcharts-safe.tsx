"use client";

import React, { useMemo } from "react";
import dynamic from "next/dynamic";
// Import the original react-apexcharts using the alias to avoid circular dependency
// @ts-ignore - Using alias to get original module
const ReactApexChartOriginal = dynamic(() => import("react-apexcharts-original"), { ssr: false });

/**
 * Deep clone function to create mutable copies of objects
 * Handles frozen objects by creating new extensible objects
 */
function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as unknown as T;
  }

  if (obj instanceof Array) {
    return obj.map(item => deepClone(item)) as unknown as T;
  }

  if (typeof obj === "object") {
    // Create a new extensible object
    const cloned = Object.create(Object.getPrototypeOf(obj)) as T;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        cloned[key] = deepClone(obj[key]);
      }
    }
    return cloned;
  }

  return obj;
}

/**
 * Safe wrapper for ReactApexChart that handles frozen objects
 * This is a drop-in replacement for react-apexcharts
 * Automatically deep clones options and series to prevent "object is not extensible" errors
 */
const SafeReactApexChart: React.FC<any> = (props) => {
  const { options, series, ...restProps } = props;

  // Deep clone options and series to ensure they're mutable
  // Using useMemo to avoid unnecessary re-cloning on every render
  const clonedOptions = useMemo(() => {
    return options ? deepClone(options) : undefined;
  }, [options]);

  const clonedSeries = useMemo(() => {
    return series ? deepClone(series) : undefined;
  }, [series]);

  return (
    <ReactApexChartOriginal
      options={clonedOptions}
      series={clonedSeries}
      {...restProps}
    />
  );
};

// Export as default to match react-apexcharts export
export default SafeReactApexChart;

