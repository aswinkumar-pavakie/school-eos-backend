// Shared HH:mm (24-hour) validation pattern for schedule/reschedule DTOs.

export const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const TIME_PATTERN_MESSAGE = 'must be in HH:mm 24-hour format';
