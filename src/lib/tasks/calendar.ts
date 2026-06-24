/**
 * Google Calendar sync for tasks.
 * Only runs when the user has connected their Google account
 * (googleAccessToken + googleRefreshToken stored on User record).
 *
 * To enable:
 *  1. npm install googleapis
 *  2. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, APP_URL in .env
 *  3. Users connect via GET /api/auth/google/connect
 */

export interface CalendarTaskPayload {
  taskId: string;
  title: string;
  description?: string | null;
  dueDate: Date;
  assigneeEmails: string[];
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string | null;
  tokenExpiry: Date | null;
}

async function buildCalendarClient(tokens: GoogleTokens) {
  try {
    // Dynamic import so the app doesn't crash if googleapis isn't installed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = await (new Function("m", "return import(m)"))("googleapis") as any;
    const google = mod.google ?? mod.default?.google;
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
    oauth2.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken ?? undefined,
      expiry_date: tokens.tokenExpiry?.getTime(),
    });
    return google.calendar({ version: "v3", auth: oauth2 });
  } catch {
    return null;
  }
}

export async function createCalendarEvent(
  tokens: GoogleTokens,
  payload: CalendarTaskPayload,
): Promise<string | null> {
  const cal = await buildCalendarClient(tokens);
  if (!cal) return null;

  const appUrl = process.env.APP_URL || "http://localhost:3000";
  try {
    const event = await cal.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: `📋 ${payload.title}`,
        description: `${payload.description ?? ""}\n\nView task: ${appUrl}/tasks/${payload.taskId}`,
        start: { dateTime: payload.dueDate.toISOString(), timeZone: "Asia/Kuala_Lumpur" },
        end: { dateTime: payload.dueDate.toISOString(), timeZone: "Asia/Kuala_Lumpur" },
        attendees: payload.assigneeEmails.map((email) => ({ email })),
        reminders: {
          useDefault: false,
          overrides: [
            { method: "email", minutes: 1440 },
            { method: "popup", minutes: 30 },
          ],
        },
      },
    });
    return event.data.id ?? null;
  } catch {
    return null;
  }
}

export async function updateCalendarEvent(
  tokens: GoogleTokens,
  eventId: string,
  payload: Partial<CalendarTaskPayload> & { done?: boolean },
): Promise<void> {
  const cal = await buildCalendarClient(tokens);
  if (!cal) return;

  const appUrl = process.env.APP_URL || "http://localhost:3000";
  try {
    const existing = await cal.events.get({ calendarId: "primary", eventId });
    const patch: Record<string, unknown> = {};

    if (payload.title !== undefined)
      patch.summary = payload.done ? `✅ ${payload.title}` : `📋 ${payload.title}`;
    if (payload.dueDate !== undefined) {
      patch.start = { dateTime: payload.dueDate.toISOString(), timeZone: "Asia/Kuala_Lumpur" };
      patch.end = { dateTime: payload.dueDate.toISOString(), timeZone: "Asia/Kuala_Lumpur" };
    }
    if (payload.assigneeEmails !== undefined)
      patch.attendees = payload.assigneeEmails.map((email) => ({ email }));
    if (payload.description !== undefined)
      patch.description = `${payload.description ?? ""}\n\nView task: ${appUrl}/tasks/${payload.taskId ?? existing.data.id}`;

    await cal.events.patch({ calendarId: "primary", eventId, requestBody: patch });
  } catch {
    // Non-fatal
  }
}

export async function deleteCalendarEvent(tokens: GoogleTokens, eventId: string): Promise<void> {
  const cal = await buildCalendarClient(tokens);
  if (!cal) return;
  try {
    await cal.events.delete({ calendarId: "primary", eventId });
  } catch {
    // Non-fatal
  }
}
