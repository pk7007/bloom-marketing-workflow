import { redactTelemetry } from "./lib/telemetry";
export async function register() {
  if (process.env.SENTRY_DSN) {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0,
      beforeSend(event) {
        delete event.user;
        delete event.request;
        delete event.breadcrumbs;
        return redactTelemetry(event);
      },
    });
  }
}
