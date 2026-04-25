const DISCIPLINE_TEMPLATES = {
  bouldering: {
    focuses: [
      {
        focus: "Limit Bouldering",
        sessionName: "Power Session",
        description: "Build max strength on short hard problems.",
        exercises: [
          { name: "Warm-up Traverses", sets: "2", duration: "3 min", rest: "1 min", notes: "Easy movement, build blood flow" },
          { name: "Limit Boulder Problems", sets: "5", reps: "1-3 attempts", rest: "3 min", notes: "V4-V5 grade, focus on technique" },
          { name: "Wall Crimp Holds", sets: "4", duration: "5 sec max", rest: "2 min", notes: "Dead-hang on varied crimps, full recruitment" },
          { name: "Antagonist Push-ups", sets: "3", reps: "8", rest: "90 sec", notes: "Slow tempo, bodyweight only, injury prevention" }
        ]
      },
      {
        focus: "Max Recruitment",
        sessionName: "Explosive Session",
        description: "Prime the nervous system for powerful movement.",
        exercises: [
          { name: "Activation Circuit", sets: "2", duration: "5 min easy", rest: "1 min", notes: "Light wall work, prep nervous system" },
          { name: "Powerful Single Moves", sets: "6", reps: "2 attempts", rest: "4 min", notes: "V4 max, explosive movements, commit" },
          { name: "Limit Board Moves", sets: "3", reps: "3-4 moves", rest: "3 min", notes: "Slopers or jugs, brutal intensity focus" },
          { name: "Core Plank", sets: "3", duration: "45 sec", rest: "90 sec", notes: "Neutral spine, full body tension" }
        ]
      },
      {
        focus: "Technical Bouldering",
        sessionName: "Technique & Endurance",
        description: "Dial movement quality while staying fresh.",
        exercises: [
          { name: "Movement Drills", sets: "3", duration: "4 min", rest: "1 min", notes: "Focus footwork, hip positioning, precision" },
          { name: "V3-V4 Repeats", sets: "4", reps: "3 attempts", rest: "2 min", notes: "Dial in technique, consistent execution" },
          { name: "Crimp Endurance", sets: "3", reps: "8 reps", rest: "2 min", notes: "Wall crimps, moderate intensity, smooth" }
        ]
      }
    ]
  },
  sport: {
    focuses: [
      {
        focus: "Aerobic Capacity",
        sessionName: "ARC Session",
        description: "Build continuous route fitness.",
        exercises: [
          { name: "Easy Route Warm-up", sets: "2", duration: "6 min", rest: "2 min", notes: "Easy mileage, controlled breathing" },
          { name: "ARC Laps", sets: "3", duration: "12 min", rest: "4 min", notes: "Stay smooth, never pump out" },
          { name: "Scap Pull-ups", sets: "3", reps: "8", rest: "90 sec", notes: "Shoulders down, steady rhythm" }
        ]
      },
      {
        focus: "Power Endurance",
        sessionName: "4x4 Session",
        description: "Build recovery under sustained effort.",
        exercises: [
          { name: "Route Activation", sets: "2", duration: "4 min", rest: "1 min", notes: "Light movement, prep forearms" },
          { name: "4x4 Circuits", sets: "4", reps: "4 climbs", rest: "4 min", notes: "Moderate pump, precise clipping" },
          { name: "Core Hollow Hold", sets: "3", duration: "40 sec", rest: "60 sec", notes: "Stay rigid, breathe calmly" }
        ]
      },
      {
        focus: "Redpoint Practice",
        sessionName: "Project Session",
        description: "Refine tactics and high-quality attempts.",
        exercises: [
          { name: "Warm-up Routes", sets: "2", duration: "5 min", rest: "2 min", notes: "Progressively harder, no fatigue" },
          { name: "Project Burns", sets: "5", reps: "1 attempt", rest: "5 min", notes: "Rest fully, rehearse key beta" },
          { name: "Downclimb Cooldown", sets: "2", duration: "3 min", rest: "1 min", notes: "Easy movement, flush forearms" }
        ]
      }
    ]
  },
  trad: {
    focuses: [
      {
        focus: "Crack Efficiency",
        sessionName: "Technique Session",
        description: "Build efficiency and calm movement.",
        exercises: [
          { name: "Footwork Warm-up", sets: "2", duration: "5 min", rest: "1 min", notes: "Quiet feet, precise placements" },
          { name: "Crack Mileage", sets: "4", duration: "6 min", rest: "3 min", notes: "Relax grip, efficient movement" },
          { name: "Lock-off Repeats", sets: "3", reps: "5 each side", rest: "90 sec", notes: "Stay stable through shoulders" }
        ]
      },
      {
        focus: "Endurance",
        sessionName: "Sustained Session",
        description: "Prepare for long continuous pitches.",
        exercises: [
          { name: "Easy Route Warm-up", sets: "2", duration: "5 min", rest: "2 min", notes: "Low stress, smooth breathing" },
          { name: "Long Intervals", sets: "3", duration: "10 min", rest: "4 min", notes: "Stay composed, pace effort" },
          { name: "Farmer Carry", sets: "3", duration: "45 sec", rest: "90 sec", notes: "Tall posture, steady pace" }
        ]
      },
      {
        focus: "Movement Composure",
        sessionName: "Confidence Session",
        description: "Practice calm movement on moderate terrain.",
        exercises: [
          { name: "Balance Drill", sets: "3", duration: "3 min", rest: "1 min", notes: "Hips close, smooth transitions" },
          { name: "Moderate Leads", sets: "4", reps: "1 route", rest: "4 min", notes: "Pause and breathe at stances" },
          { name: "Side Plank", sets: "3", duration: "30 sec", rest: "60 sec", notes: "Brace ribs, stack shoulders" }
        ]
      }
    ]
  },
  ice: {
    focuses: [
      {
        focus: "Tool Precision",
        sessionName: "Movement Session",
        description: "Refine precise placements and body tension.",
        exercises: [
          { name: "Mobility Warm-up", sets: "2", duration: "4 min", rest: "1 min", notes: "Warm shoulders, open hips" },
          { name: "Tool Placement Drills", sets: "4", reps: "6 swings", rest: "2 min", notes: "Quiet placements, trust feet" },
          { name: "Front Point Raises", sets: "3", reps: "10", rest: "90 sec", notes: "Slow control, strong calves" }
        ]
      },
      {
        focus: "Calf Endurance",
        sessionName: "Endurance Session",
        description: "Build lower-leg durability for steep terrain.",
        exercises: [
          { name: "Easy Movement", sets: "2", duration: "5 min", rest: "1 min", notes: "Relaxed movement, prep ankles" },
          { name: "Steep Intervals", sets: "4", duration: "3 min", rest: "3 min", notes: "Keep hips in, calm breathing" },
          { name: "Isometric Lunge", sets: "3", duration: "30 sec", rest: "60 sec", notes: "Knee stable, weight centered" }
        ]
      },
      {
        focus: "Upper Body Power",
        sessionName: "Strength Session",
        description: "Build pulling strength with body tension.",
        exercises: [
          { name: "Activation Pulls", sets: "2", reps: "5", rest: "1 min", notes: "Shoulders packed, smooth tempo" },
          { name: "Pull-up Clusters", sets: "5", reps: "3", rest: "2 min", notes: "Full range, no swinging" },
          { name: "Hollow Body Hold", sets: "3", duration: "35 sec", rest: "60 sec", notes: "Lock ribcage, stay tight" }
        ]
      }
    ]
  },
  alpine: {
    focuses: [
      {
        focus: "Aerobic Base",
        sessionName: "Capacity Session",
        description: "Build sustainable mountain movement.",
        exercises: [
          { name: "Easy Warm-up", sets: "2", duration: "5 min", rest: "1 min", notes: "Steady effort, nasal breathing" },
          { name: "Continuous Intervals", sets: "3", duration: "12 min", rest: "4 min", notes: "Moderate pace, even breathing" },
          { name: "Step-up Series", sets: "3", reps: "12 each side", rest: "90 sec", notes: "Tall torso, full foot contact" }
        ]
      },
      {
        focus: "Carry Strength",
        sessionName: "Loaded Session",
        description: "Support long approaches and descents.",
        exercises: [
          { name: "Walking Warm-up", sets: "2", duration: "4 min", rest: "1 min", notes: "Loosen hips, steady rhythm" },
          { name: "Pack Carries", sets: "4", duration: "3 min", rest: "2 min", notes: "Tall posture, brace trunk" },
          { name: "Split Squat", sets: "3", reps: "8 each side", rest: "90 sec", notes: "Control descent, knee stable" }
        ]
      },
      {
        focus: "Movement Economy",
        sessionName: "Efficiency Session",
        description: "Practice steady movement under light fatigue.",
        exercises: [
          { name: "Mobility Prep", sets: "2", duration: "4 min", rest: "1 min", notes: "Open ankles, free shoulders" },
          { name: "Easy Terrain Laps", sets: "4", duration: "5 min", rest: "2 min", notes: "Smooth cadence, no rushing" },
          { name: "Side Step Lunges", sets: "3", reps: "10", rest: "60 sec", notes: "Stay balanced, push through heel" }
        ]
      }
    ]
  }
};

function getTemplatesForDiscipline(discipline) {
  return DISCIPLINE_TEMPLATES[discipline] ?? DISCIPLINE_TEMPLATES.bouldering;
}

module.exports = {
  getTemplatesForDiscipline
};
