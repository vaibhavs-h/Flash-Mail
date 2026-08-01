"use client";

import { Suspense } from "react";
import Home from "../page";

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <Home />
    </Suspense>
  );
}
