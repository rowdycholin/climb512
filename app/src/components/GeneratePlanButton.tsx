"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

export default function GeneratePlanButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full text-base" disabled={pending}>
      {pending ? "Generating your plan... this can take 30-60 seconds" : "Generate My Training Plan"}
    </Button>
  );
}
