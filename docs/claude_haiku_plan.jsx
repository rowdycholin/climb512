import React, { useState } from 'react';
import './ClimbingTrainingPlan.css';

const ClimbingTrainingPlan = () => {
  const [expandedSections, setExpandedSections] = useState({});

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const weeklySchedule = [
    { day: 'Monday', focus: 'Climbing: Volume/Technique', duration: '60-90 min' },
    { day: 'Tuesday', focus: 'Aerobics: Steady-State Cardio', duration: '45-60 min' },
    { day: 'Wednesday', focus: 'Climbing: Power/Intensity', duration: '60-75 min' },
    { day: 'Thursday', focus: 'Aerobics: Interval Training', duration: '40-50 min' },
    { day: 'Friday', focus: 'Climbing: Endurance/Project Work', duration: '75-90 min' },
    { day: 'Saturday', focus: 'Rest or Active Recovery', duration: '—' },
    { day: 'Sunday', focus: 'Rest', duration: '—' },
  ];

  const sessions = {
    monday: {
      title: 'Monday: Volume/Technique Day',
      subtitle: 'Focus: technique refinement and moderate volume',
      sections: [
        {
          heading: 'Warm-up (10 min)',
          content: [
            '5 min easy cardio',
            'Shoulder/hip mobility flows',
            '5-10 easy boulder problems at VX or lead at 5.8-5.9'
          ]
        },
        {
          heading: 'Main Session (50-70 min)',
          content: [
            'TB2 Board: 4-5 sets of 20-40 second hangs at moderate intensity (use this for consistency/technique before tiring)',
            'Lead/TR climbing: 5-7 pitches (60s-3min climbs) at 75-85% difficulty - Mix routes: some steep, some slab, some vertical - Focus on footwork and smooth movement',
            'Bouldering: 3-4 sets of 3-5 problems at 80-85% difficulty - Pick problems that work on your weaknesses - Rest fully between sets (2-3 min)'
          ]
        },
        {
          heading: 'Finisher (5-10 min)',
          content: [
            'Light stretching and shoulder mobility'
          ]
        }
      ]
    },
    tuesday: {
      title: 'Tuesday: Steady-State Aerobics',
      subtitle: 'Focus: aerobic base building',
      sections: [
        {
          heading: '40-60 minute continuous effort',
          content: [
            'Bike/rower/treadmill at conversational intensity (Zone 2)',
            'Or: Long bouldering session at easy grades (grade down 3-4 levels) with constant movement and short rests',
            'Rationale: Builds aerobic capacity without taxing anaerobic systems'
          ]
        }
      ]
    },
    wednesday: {
      title: 'Wednesday: Power/Intensity Day',
      subtitle: 'Focus: max strength and hard movement',
      sections: [
        {
          heading: 'Warm-up (10 min)',
          content: [
            'Easy movement and dynamic stretching'
          ]
        },
        {
          heading: 'Main Session (50-65 min)',
          content: [
            'Kilter Board: 5-6 sets of 5-8 minute repeats - Work near your max difficulty but sustainable - 2-3 min rest between sets - This board is perfect for consistent power training',
            'Bouldering: 4-5 sets of 1-3 difficult problems - Work at 90-95% of current ability - Full rest between attempts (3-5 min) - Quality over quantity',
            'Weight Room: 2 exercises (15 min) - Weighted Pull-ups: 4 sets x 4-6 reps - Deadlifts or Rows: 4 sets x 5-8 reps - Alternative: Campus board work if available'
          ]
        },
        {
          heading: 'Finisher (5-10 min)',
          content: [
            'Core work (planks, hollow holds, side planks): 3 sets each',
            'Antagonist work (push-ups, bench work if time)'
          ]
        }
      ]
    },
    thursday: {
      title: 'Thursday: Interval Aerobics',
      subtitle: 'Focus: anaerobic capacity and work capacity',
      sections: [
        {
          heading: '35-50 minute session with intensity variation',
          content: [
            'Option 1 - Treadmill/Bike: 5 min warm-up easy → 8-10 x (2 min hard / 1 min easy) OR (1 min all-out / 2 min recovery) → 5 min cool-down',
            'Option 2 - Climbing Cardio: Lead climbing: 6-8 short boulder-crux repeats (1-2 min climbs) at 85-90% difficulty with 2-3 min rest between',
            'Or: Bouldering laps at moderate difficulty (60-75%) with continuous movement and minimal rest',
            'Rationale: Builds work capacity without the CNS demand of max power'
          ]
        }
      ]
    },
    friday: {
      title: 'Friday: Endurance/Project Day',
      subtitle: 'Focus: longer efforts and personal projects',
      sections: [
        {
          heading: 'Warm-up (10 min)',
          content: [
            'Easy climbing and dynamic movement'
          ]
        },
        {
          heading: 'Main Session (60-75 min)',
          content: [
            'Lead/TR climbing: 2-3 longer routes (5-15 min climbs) OR your project route - repeated attempts - Work at 75-85% difficulty for longer endurance routes - Projects at 90%+ with 3-5 min rest between attempts',
            'Bouldering: 2-3 sustained boulder circuits - 5-8 problems per circuit, moderate difficulty - Rest 1-2 min between circuits - Focus on maintaining form while pumped',
            'Antagonist/Core (10 min): Push-ups, rows, or reverse flies: 3 sets x 8-10 reps - Core circuit: ab wheel, dead bugs, side planks'
          ]
        },
        {
          heading: 'Finisher (5 min)',
          content: [
            'Thorough stretching and recovery focus'
          ]
        }
      ]
    }
  };

  const progressionTable = [
    { week: '1', monVolume: '6 climbs', wedIntensity: 'V3 projects', friLength: '2x 8min', notes: 'Assessment week' },
    { week: '2', monVolume: '7 climbs', wedIntensity: 'V3-V4 projects', friLength: '3x 8min', notes: 'Increase reps' },
    { week: '3', monVolume: '7 climbs', wedIntensity: 'V4 projects', friLength: '3x 10min', notes: 'Increase difficulty' },
    { week: '4', monVolume: '5 climbs', wedIntensity: 'V3 projects', friLength: '2x 8min', notes: 'Deload week' },
  ];

  const trainingPrinciples = {
    intensityDistribution: [
      { day: 'Monday', intensity: '60-70% Moderate' },
      { day: 'Wednesday', intensity: '85-90% High' },
      { day: 'Friday', intensity: '75-85% Moderate-High' },
      { day: 'Aerobics', intensity: 'Varied (one steady, one intervals)' },
    ],
    progressiveOverload: [
      'Increase volume by 5-10% every 2-3 weeks',
      'Add 1-2 problem grades when achieving consistent ascents',
      'Increase hang duration on Kilter by 10-15 seconds every 2-3 weeks',
      'Track PR attempts on projects'
    ],
    restRecovery: [
      'Sleep 7-9 hours minimum',
      'Eat adequate protein (0.7-1g per lb bodyweight)',
      'Hydrate consistently',
      'Consider foam rolling on rest days',
      'Deload week every 4-6 weeks (reduce volume by 30-40%)'
    ],
    periodization: [
      'Weeks 1-4: Build base volume, technique focus',
      'Weeks 5-8: Increase intensity, maintain volume',
      'Weeks 9-11: Peak phase (max attempts on projects)',
      'Week 12: Deload, recovery, reassess',
      'Then repeat'
    ]
  };

  const recommendations = [
    'Kilter Board Strategy: Use this for consistent power development. 6-8 minute repeats build excellent contact strength. Rotate hold types and problems every 2-3 weeks.',
    'TB2 Board Use: Best on Monday (fresh grip) for technical training. Max hangs on Wednesday if you want a dedicated grip day. Keep sessions short (4-5 sets) due to high intensity.',
    'Bouldering vs. Lead: Monday/Friday mix of both, emphasis on technique. Wednesday primarily bouldering for intense short efforts. Lead on Tuesday\'s aerobics equals easy continuous movement.'
  ];

  const successTips = [
    'Warm-up properly - 10 minutes minimum on all climbing days',
    'Track your sessions - Use a gym app or notebook',
    'Prioritize Tuesday/Thursday - Aerobics on fresh legs',
    'Listen to your body - Reduce volume if joints feel beat up',
    'Optimize nutrition - Eat a light snack 1-2 hours before climbing',
    'Use the variety - Kilter and TB2 boards provide different stimulus than natural rock',
    'Form over ego - Maintain technique even when fatigued'
  ];

  return (
    <div className="training-plan-container">
      <header className="plan-header">
        <h1>🧗 Rock Climbing Training Plan</h1>
        <p>5 Days/Week: 3 Days Climbing + 2 Days Aerobics</p>
      </header>

      {/* Weekly Overview */}
      <section className="section">
        <h2>Weekly Overview</h2>
        <div className="table-wrapper">
          <table className="schedule-table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Focus</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {weeklySchedule.map((item, idx) => (
                <tr key={idx} className={item.day === 'Saturday' || item.day === 'Sunday' ? 'rest-day' : ''}>
                  <td><strong>{item.day}</strong></td>
                  <td>{item.focus}</td>
                  <td>{item.duration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Detailed Sessions */}
      <section className="section">
        <h2>Detailed Session Breakdowns</h2>
        
        {Object.entries(sessions).map(([key, session]) => (
          <div key={key} className="session-card">
            <div
              className="session-header"
              onClick={() => toggleSection(key)}
            >
              <h3>{session.title}</h3>
              <p className="session-subtitle">{session.subtitle}</p>
              <span className="expand-icon">
                {expandedSections[key] ? '▼' : '▶'}
              </span>
            </div>
            
            {expandedSections[key] && (
              <div className="session-content">
                {session.sections.map((part, idx) => (
                  <div key={idx} className="session-part">
                    <h4>{part.heading}</h4>
                    <ul>
                      {part.content.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </section>

      {/* Training Principles */}
      <section className="section">
        <h2>Training Principles to Follow</h2>
        
        <div className="principles-grid">
          <div className="principle-card">
            <h3>Intensity Distribution</h3>
            <ul>
              {trainingPrinciples.intensityDistribution.map((item, idx) => (
                <li key={idx}>
                  <strong>{item.day}:</strong> {item.intensity}
                </li>
              ))}
            </ul>
          </div>

          <div className="principle-card">
            <h3>Progressive Overload</h3>
            <ul>
              {trainingPrinciples.progressiveOverload.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="principle-card">
            <h3>Rest & Recovery</h3>
            <ul>
              {trainingPrinciples.restRecovery.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="principle-card">
            <h3>Periodization (12-week cycle)</h3>
            <ul>
              {trainingPrinciples.periodization.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Climbing-Specific Recommendations */}
      <section className="section">
        <h2>Climbing-Specific Recommendations</h2>
        <div className="recommendations-list">
          {recommendations.map((rec, idx) => (
            <div key={idx} className="recommendation-item">
              <p>{rec}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Sample Progression */}
      <section className="section">
        <h2>Sample 4-Week Progression</h2>
        <div className="table-wrapper">
          <table className="progression-table">
            <thead>
              <tr>
                <th>Week</th>
                <th>Mon Volume</th>
                <th>Wed Intensity</th>
                <th>Fri Length</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {progressionTable.map((row, idx) => (
                <tr key={idx}>
                  <td><strong>{row.week}</strong></td>
                  <td>{row.monVolume}</td>
                  <td>{row.wedIntensity}</td>
                  <td>{row.friLength}</td>
                  <td>{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Tips for Success */}
      <section className="section">
        <h2>Tips for Success</h2>
        <div className="tips-list">
          {successTips.map((tip, idx) => (
            <div key={idx} className="tip-item">
              <span className="tip-number">{idx + 1}</span>
              <p>{tip}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="plan-footer">
        <p>💪 Train hard, climb smart, and enjoy the process!</p>
      </footer>
    </div>
  );
};

export default ClimbingTrainingPlan;