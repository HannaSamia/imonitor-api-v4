import { Injectable } from '@nestjs/common';
import {
  format,
  addMinutes,
  addHours,
  addDays,
  addWeeks,
  addMonths,
  addYears,
  subMinutes,
  subHours,
  subDays,
  subWeeks,
  subMonths,
  subYears,
  isWithinInterval,
  isAfter,
  differenceInMinutes,
  differenceInDays,
  max,
  min,
  parse,
  roundToNearestMinutes,
  startOfMonth,
  subDays as subDaysFn,
} from 'date-fns';

export const DATE_FULL_TIME = 'yyyy-MM-dd HH:mm:ss';
export const DATE_WITHOUT_TIME = 'yyyy-MM-dd';

export interface Duration {
  minutes?: number;
  hours?: number;
  days?: number;
  weeks?: number;
  months?: number;
  years?: number;
}

@Injectable()
export class DateHelperService {
  currentDate(): Date {
    return new Date();
  }

  formatDate(dateFormat = DATE_FULL_TIME, date?: Date): string {
    return format(date || new Date(), dateFormat);
  }

  addDurationToDate(duration: Duration, date?: Date): Date {
    let result = date || new Date();
    if (duration.minutes) result = addMinutes(result, duration.minutes);
    if (duration.hours) result = addHours(result, duration.hours);
    if (duration.days) result = addDays(result, duration.days);
    if (duration.weeks) result = addWeeks(result, duration.weeks);
    if (duration.months) result = addMonths(result, duration.months);
    if (duration.years) result = addYears(result, duration.years);
    return result;
  }

  subtractDurationFromDate(duration: Duration, date?: Date): Date {
    let result = date || new Date();
    if (duration.minutes) result = subMinutes(result, duration.minutes);
    if (duration.hours) result = subHours(result, duration.hours);
    if (duration.days) result = subDays(result, duration.days);
    if (duration.weeks) result = subWeeks(result, duration.weeks);
    if (duration.months) result = subMonths(result, duration.months);
    if (duration.years) result = subYears(result, duration.years);
    return result;
  }

  formatPassedDate(date: Date, dateFormat = DATE_FULL_TIME): string {
    return format(date, dateFormat);
  }

  parseDate(str: string, newFormat = DATE_FULL_TIME, referenceDate?: Date): Date {
    return parse(str, newFormat, referenceDate || new Date());
  }

  parseISO(strDate: string): Date {
    return new Date(strDate);
  }

  isInDateInterval(date: Date, interval: { start: Date; end: Date }): boolean {
    return isWithinInterval(date, interval);
  }

  getMaxDate(dates: Date[]): Date {
    return max(dates);
  }

  getMinDate(dates: Date[]): Date {
    return min(dates);
  }

  isAfterDate(firstDate: Date, secondDate?: Date): boolean {
    return isAfter(firstDate, secondDate || new Date());
  }

  differenceInMinutes(firstDate: Date, secondDate: Date): number {
    return differenceInMinutes(firstDate, secondDate);
  }

  differenceInDays(firstDate: Date, secondDate: Date): number {
    return differenceInDays(firstDate, secondDate);
  }

  isWithinDateRange(currentDate: Date, startDate: string, endDate: string): boolean {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return isWithinInterval(currentDate, { start, end });
  }

  formatDateRoundedDownToNearestFiveMinutes(date: Date, dateFormat = DATE_FULL_TIME): string {
    const rounded = roundToNearestMinutes(date, { nearestTo: 5, roundingMethod: 'floor' });
    return format(rounded, dateFormat);
  }

  getFirstOfMonthAndDMinus1(dateFormat = DATE_FULL_TIME): { startDate: string; endDate: string } {
    const now = new Date();
    const firstOfMonth = startOfMonth(now);
    const yesterday = subDaysFn(now, 1);
    return {
      startDate: format(firstOfMonth, dateFormat),
      endDate: format(yesterday, dateFormat),
    };
  }
}
