import type { SeedContext } from "../lib/db";
import { pick, rand, shuffle, isoDate } from "../lib/util";
import { SPORTS } from "../data/org";
import type { Tier0Ids } from "./tier0";
import type { Tier1Ids } from "./tier1";

export async function seedTier7Sports(ctx: SeedContext, t0: Tier0Ids, t1: Tier1Ids) {
  // --- team: 24 = 3/sport (Junior/Senior/Mixed) ---
  const teamIds: { id: string; sport: string; tier: string }[] = [];
  for (const sport of SPORTS) {
    for (const tier of ["Junior", "Senior", "Mixed"]) {
      const id = await ctx.insertReturningId("team", {
        sport_id: t0.sportIds[sport], academic_year_id: t0.academicYearId,
        name: `${sport} - ${tier}`, status: "ACTIVE",
      });
      teamIds.push({ id, sport, tier });
    }
  }

  // --- sports_selection_window: 16 = 2/sport ---
  for (const sport of SPORTS) {
    for (let i = 0; i < 2; i++) {
      await ctx.insertReturningId("sports_selection_window", {
        sport_id: t0.sportIds[sport], title: `${sport} Trials - Round ${i + 1}`,
        opens_on: isoDate(new Date(2025, 6 + i * 3, 1)), closes_on: isoDate(new Date(2025, 6 + i * 3, 14)), status: "CLOSED",
      });
    }
  }

  // --- sports_profile / team_member / sports_trial: real ~400 student-athletes ---
  const candidateStudents = shuffle(t1.students.map((s) => s.studentId)).slice(0, 400);
  let cursor = 0;
  for (const sport of SPORTS) {
    const teamsForSport = teamIds.filter((t) => t.sport === sport);
    const rosterSize = 17;
    for (const team of teamsForSport) {
      for (let i = 0; i < rosterSize && cursor < candidateStudents.length; i++, cursor++) {
        const studentId = candidateStudents[cursor]!;
        await ctx.insertReturningId("sports_profile", {
          student_id: studentId, sport_id: t0.sportIds[sport], joined_on: "2025-06-15", status: "ACTIVE",
        });
        await ctx.insertReturningId("team_member", {
          team_id: team.id, student_id: studentId, jersey_no: i + 1, joined_on: "2025-06-15", status: "ACTIVE",
        });
        const selected = rand() < 0.6;
        await ctx.insertReturningId("sports_trial", {
          student_id: studentId, sport_id: t0.sportIds[sport], round: "ROUND_1",
          trial_date: "2025-07-05", score: `${60 + Math.floor(rand() * 40)}`, status: selected ? "SELECTED" : "NOT_SELECTED",
        });
        await ctx.insertReturningId("fitness_clearance", {
          student_id: studentId, cleared_for: "SPORTS", cleared_on: "2025-06-20",
          cleared_by: t1.staff.find((s) => s.isTeaching)!.personId,
          valid_until: "2026-04-30",
        });
      }
    }
  }

  // --- sports_practice_plan: 1/team ---
  for (const team of teamIds) {
    await ctx.insertReturningId("sports_practice_plan", {
      team_id: team.id, title: `${team.sport} ${team.tier} - Term Plan`, start_date: "2025-06-15", end_date: "2026-03-31",
      weekly_focus: JSON.stringify({ Mon: "Fitness", Wed: "Skills", Fri: "Match Practice" }), status: "ACTIVE",
    });
  }

  // --- tournament / fixture / fixture_result: 6/year, ~40 fixtures, real results ---
  for (const sport of shuffle(SPORTS).slice(0, 6)) {
    const tournamentId = await ctx.insertReturningId("tournament", {
      sport_id: t0.sportIds[sport], name: `Inter-House ${sport} Championship`, level: "INTER_HOUSE",
      start_date: "2025-11-01", end_date: "2025-11-15", venue: "School Grounds", state: "COMPLETED",
    });
    const teamsForSport = teamIds.filter((t) => t.sport === sport);
    for (let i = 0; i < 7; i++) {
      const home = pick(teamsForSport); const away = pick(teamsForSport.filter((t) => t.id !== home.id) || teamsForSport);
      const fixtureId = await ctx.insertReturningId("fixture", {
        tournament_id: tournamentId, round: `Round ${i + 1}`, scheduled_at: new Date(2025, 10, 1 + i).toISOString(),
        venue: "School Grounds", home_team_id: home.id, away_team_id: away?.id ?? home.id, status: "COMPLETED",
      });
      const homeScore = Math.floor(rand() * 5); const awayScore = Math.floor(rand() * 5);
      await ctx.insertReturningId("fixture_result", {
        fixture_id: fixtureId, home_score: homeScore, away_score: awayScore,
        winner_team_id: homeScore >= awayScore ? home.id : (away?.id ?? home.id), recorded_at: new Date().toISOString(),
      });
    }
    for (let i = 0; i < 5; i++) {
      await ctx.insertReturningId("sports_result_entry", {
        student_id: pick(candidateStudents), sport_id: t0.sportIds[sport], tournament_id: tournamentId,
        event_name: `${sport} Final`, result_value: `${60 + Math.floor(rand() * 40)}`, position: pick(["1st", "2nd", "3rd", "Participant"]), status: "VERIFIED",
      });
    }
  }

  console.log("Tier 7 (sports operations) done.");
  return { teamIds };
}

// sports_substitute_coach (substitute_coach_id is NOT NULL, references
// `coach`) is seeded separately, after tier8's coach rows exist — see
// seedTier7SubstituteCoaches below, called from run.ts after tier8.
export async function seedTier7SubstituteCoaches(ctx: SeedContext, teamIds: { id: string; sport: string; tier: string }[], coachIds: string[]) {
  for (let i = 0; i < 15; i++) {
    const team = pick(teamIds);
    await ctx.insertReturningId("sports_substitute_coach", {
      team_id: team.id, substitute_coach_id: pick(coachIds), start_date: "2025-09-01", end_date: "2025-09-14",
      reason: "Original coach on medical leave", status: "CLOSED",
    });
  }
}
