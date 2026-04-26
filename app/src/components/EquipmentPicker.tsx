"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

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
        <CardDescription>Select what you have access to and add anything extra.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PRESET_EQUIPMENT.map((equipment) => (
            <label
              key={equipment.value}
              className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 transition-colors hover:bg-slate-50"
            >
              <Checkbox name="equipment" value={equipment.value} />
              <span className="text-sm">{equipment.label}</span>
            </label>
          ))}
        </div>

        {custom.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {custom.map((item) => (
              <Badge key={item} variant="secondary" className="pr-1">
                <input type="hidden" name="equipment" value={item} />
                {item}
                <button type="button" onClick={() => removeCustom(item)} className="ml-2 hover:text-destructive">x</button>
              </Badge>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Input
            value={inputVal}
            onChange={(event) => setInputVal(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addCustom();
              }
            }}
            placeholder="Add custom equipment..."
          />
          <Button type="button" variant="outline" onClick={addCustom}>Add</Button>
        </div>
      </CardContent>
    </Card>
  );
}
