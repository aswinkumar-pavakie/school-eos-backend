// Employee Attendance -- Faculty's own read-only view of their real
// staff_attendance_event history. No punch-in/out actions here (explicit
// scope decision -- the user only asked for correct viewing). "Late marks"
// from the design's own legend is deliberately dropped: there is no real
// configured shift-start time anywhere in this schema to judge lateness
// against, and fabricating a threshold would mean inventing a business rule
// that doesn't exist -- the legend instead reports Present/Absent/On Duty,
// all three genuinely backed by real event data.
//
// A day's final status is whichever of CHECK_IN/ABSENT/ON_DUTY was recorded
// *last* (by received_at) that day -- the same "latest correction wins" rule
// StaffAttendanceRepository.findDailyRoster already uses for the Admin daily
// roster. occurred_at is read with no timezone conversion, matching that
// same repository's own established convention (the stored wall-clock value
// already is the intended local school-day time).

import { Injectable } from '@nestjs/common';
import { StaffAttendanceRepository } from '../staff-attendance/repositories/staff-attendance.repository';
import { FacultyScopeRepository } from './repositories/faculty-scope.repository';

interface DayEntry {
  date: string;
  status: 'PRESENT' | 'ABSENT' | 'ON_DUTY';
  punchIn: string | null;
  punchOut: string | null;
  hoursWorked: number | null;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function toTimeStr(d: Date): string {
  return d.toISOString().slice(11, 16);
}

@Injectable()
export class FacultyMyAttendanceService {
  constructor(
    private readonly staffAttendanceRepo: StaffAttendanceRepository,
    private readonly scopeRepo: FacultyScopeRepository,
  ) {}

  async getSummary(personId: string, month?: string) {
    const staffId = await this.scopeRepo.getStaffId(personId);
    if (!staffId) {
      return {
        today: null,
        summary: {
          ratePercent: null,
          presentCount: 0,
          absentCount: 0,
          onDutyCount: 0,
          workingDays: 0,
        },
        days: [],
      };
    }

    const now = new Date();
    const [year, mon] = (
      month ??
      `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
    )
      .split('-')
      .map(Number);
    const monthStart = `${year}-${String(mon).padStart(2, '0')}-01`;
    const monthEndDate = new Date(Date.UTC(year, mon, 0));
    const monthEnd = toDateStr(monthEndDate);

    const events = await this.staffAttendanceRepo.findEventsInRange(
      staffId,
      monthStart,
      monthEnd,
    );

    const byDate = new Map<
      string,
      { eventType: string; occurredAt: Date; receivedAt: Date }[]
    >();
    for (const ev of events) {
      const date = toDateStr(new Date(ev.occurredAt));
      const list = byDate.get(date) ?? [];
      list.push(ev);
      byDate.set(date, list);
    }

    const days: DayEntry[] = [];
    for (const [date, dayEvents] of byDate) {
      // Already ordered oldest-first by the repository query.
      const statusEvents = dayEvents.filter((e) =>
        ['CHECK_IN', 'ABSENT', 'ON_DUTY'].includes(e.eventType),
      );
      const last = statusEvents[statusEvents.length - 1];
      if (!last) continue;

      let status: DayEntry['status'];
      let punchIn: string | null = null;
      let punchOut: string | null = null;
      let hoursWorked: number | null = null;

      if (last.eventType === 'ABSENT') {
        status = 'ABSENT';
      } else if (last.eventType === 'ON_DUTY') {
        status = 'ON_DUTY';
      } else {
        status = 'PRESENT';
        const checkIn = dayEvents.find((e) => e.eventType === 'CHECK_IN');
        const checkOuts = dayEvents.filter((e) => e.eventType === 'CHECK_OUT');
        const checkOut = checkOuts[checkOuts.length - 1];
        if (checkIn) punchIn = toTimeStr(new Date(checkIn.occurredAt));
        if (checkOut) punchOut = toTimeStr(new Date(checkOut.occurredAt));
        if (checkIn && checkOut) {
          const ms =
            new Date(checkOut.occurredAt).getTime() -
            new Date(checkIn.occurredAt).getTime();
          hoursWorked = Math.round((ms / 3600000) * 10) / 10;
        }
      }

      days.push({ date, status, punchIn, punchOut, hoursWorked });
    }
    days.sort((a, b) => (a.date < b.date ? 1 : -1));

    const presentCount = days.filter((d) => d.status === 'PRESENT').length;
    const absentCount = days.filter((d) => d.status === 'ABSENT').length;
    const onDutyCount = days.filter((d) => d.status === 'ON_DUTY').length;
    const workingDays = days.length;
    const ratePercent =
      workingDays > 0 ? Math.round((presentCount / workingDays) * 100) : null;

    const todayStr = toDateStr(now);
    const today = days.find((d) => d.date === todayStr) ?? {
      date: todayStr,
      status: null,
      punchIn: null,
      punchOut: null,
      hoursWorked: null,
    };

    return {
      today,
      summary: {
        ratePercent,
        presentCount,
        absentCount,
        onDutyCount,
        workingDays,
      },
      days,
    };
  }
}
