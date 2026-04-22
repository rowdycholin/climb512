"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const PRESET_EQUIPMENT = [
  { value: "bouldering-wall", label: "Bouldering Wall" },
  { value: "lead-wall", label: "Lead / Top-rope Wall" },
  { value: "hangboard", label: "Hangboard" },
  { value: "campus-rungs", label: "Campus Rungs" },
  { value: "system-board", label: "System Board (Kilter/Tension)" },
  { value: "weight-room", label: "Weight Room / Gym" },
  { value: "pull-up-bar", label: "Pull-up Bar" },
  { value: "resistance-bands", label: "Resistance Bands" },
];

export default function EquipmentPicker() {
  const [custom, setCustom] = useState<string[]>([]);
  const [inputVal, setInputVal] = useState("");

  function addCustom() {
    const trimmed = inputVal.trim();
    if (trimmed && !custom.includes(trimmed)) {
      setCustom((prev) => [...prev, trimmed]);
      setInputVal("");
    }
  }

  function removeCustom(item: string) {
    setCustom((prev) => prev.filter((x) => x !== item));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Available Equipment at Your Gym</CardTitle>
        <CardDescription>Select what you have access to — and add anything extra</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PRESET_EQUIPMENT.map((e) => (
            <label key={e.value} className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent transition-colors">
              <Checkbox name="equipment" value={e.value} />
              <span className="text-sm">{e.label}</span>
            </label>
          ))}
        </div>

        {custom.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {custom.map((item) => (
              <Badge key={item} variant="secondary" className="pr-1">
                <input type="hidden" name="equipment" value={item} />
                {item}
                <button type="button" onClick={() => removeCustom(item)} className="ml-2 hover:text-destructive">×</button>
              </Badge>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Input
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
            placeholder="Add custom equipment..."
          />
          <Button type="button" variant="outline" onClick={addCustom}>Add</Button>
        </div>
      </CardContent>
    </Card>
  );
}
