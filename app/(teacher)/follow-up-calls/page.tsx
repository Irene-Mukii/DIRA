import Link from "next/link";
import { connection } from "next/server";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import { pool } from "@/lib/db/client";

interface FollowUpCallRow {
  follow_up_job_id: string;
  calendar_entry_id: string;
  scheduled_date: string;
  scheduled_end_at: Date;
  status: "queued" | "initiating" | "provider_accepted" | "provider_rejected" | "outcome_unknown" | "cancelled";
  attempt_count: number;
  attempt_started_at: Date | null;
  provider_accepted_at: Date | null;
  provider_http_status: number | null;
  last_error_code: string | null;
}

interface PendingObservationRow {
  observation_id: string;
  learner_id: string;
  learner_name: string;
  original_observation: string;
  created_at: Date;
}

const statusDetails: Record<
  FollowUpCallRow["status"],
  { label: string; explanation: string; nextAction: string; variant: "default" | "secondary" | "destructive" | "outline-solid" }
> = {
  queued: {
    label: "Scheduled",
    explanation: "The class-end follow-up is waiting until its scheduled time and eligibility checks.",
    nextAction: "Wait until the scheduled class ends. If it remains scheduled after that time, contact the administrator to check the scheduler.",
    variant: "secondary",
  },
  initiating: {
    label: "Submitting call request",
    explanation: "Dira has claimed this job and is sending the request to the call provider.",
    nextAction: "Wait for the provider submission result. If it remains in this state, contact the administrator before retrying.",
    variant: "default",
  },
  provider_accepted: {
    label: "Provider accepted request",
    explanation: "Africa's Talking accepted the request to initiate a call.",
    nextAction: "This does not confirm that the phone rang, was answered, or completed. Call outcome callbacks are not connected yet.",
    variant: "default",
  },
  provider_rejected: {
    label: "Request rejected",
    explanation: "The provider rejected the request to initiate this call.",
    nextAction: "Contact the school administrator. Dira does not automatically retry rejected requests.",
    variant: "destructive",
  },
  outcome_unknown: {
    label: "Outcome uncertain",
    explanation: "Dira could not determine whether the provider received the request.",
    nextAction: "Do not retry yet; ask the administrator to check with the provider to avoid a duplicate call.",
    variant: "destructive",
  },
  cancelled: {
    label: "Cancelled",
    explanation: "This scheduled follow-up will not be dispatched.",
    nextAction: "No call is pending for this calendar entry.",
    variant: "outline-solid",
  },
};

function formatTime(value: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

function safeErrorLabel(code: string | null): string | null {
  if (code === "provider_rejected") return "Provider rejected the request";
  if (code === "outcome_unknown") return "Provider outcome could not be confirmed";
  return code ? "A dispatch error was recorded; contact the administrator" : null;
}

export default async function FollowUpCallsPage() {
  await connection();

  if (process.env.NODE_ENV === "production") {
    return (
      <Card className="p-6">
        <h1 className="text-xl font-semibold">Follow-up activity unavailable</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          This demo page requires a real authenticated teacher session, which is not configured.
        </p>
      </Card>
    );
  }

  const teacherId = process.env.DIRA_DEMO_TEACHER_ID?.trim();
  const schoolId = process.env.DIRA_DEMO_SCHOOL_ID?.trim();
  if (!teacherId || !schoolId) {
    return (
      <Card className="p-6">
        <h1 className="text-xl font-semibold">Follow-up activity unavailable</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          Configure the development teacher and school context before viewing follow-up activity.
        </p>
      </Card>
    );
  }

  try {
    const [teacherResult, callsResult, observationsResult] = await Promise.all([
      pool.query<{ display_name: string }>(
        `SELECT display_name FROM teachers
         WHERE teacher_id = $1 AND school_id = $2`,
        [teacherId, schoolId],
      ),
      pool.query<FollowUpCallRow>(
        `SELECT
           job.follow_up_job_id,
           job.calendar_entry_id,
           job.scheduled_date::text,
           job.scheduled_end_at,
           job.status,
           job.attempt_count,
           job.attempt_started_at,
           job.provider_accepted_at,
           job.provider_http_status,
           job.last_error_code
         FROM teacher_follow_up_jobs AS job
         WHERE job.teacher_id = $1 AND job.school_id = $2
         ORDER BY job.scheduled_end_at DESC
         LIMIT 50`,
        [teacherId, schoolId],
      ),
      pool.query<PendingObservationRow>(
        `SELECT
           observation.observation_id,
           observation.learner_id,
           learner.display_name AS learner_name,
           observation.original_observation,
           observation.created_at
         FROM observations AS observation
         JOIN learners AS learner ON learner.learner_id = observation.learner_id
         WHERE observation.teacher_id = $1
           AND observation.school_id = $2
           AND observation.teacher_review_status = 'recorded'
         ORDER BY observation.created_at DESC
         LIMIT 50`,
        [teacherId, schoolId],
      ),
    ]);

    if (!teacherResult.rows[0]) {
      return (
        <Card className="p-6">
          <h1 className="text-xl font-semibold">Follow-up activity unavailable</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            The configured development teacher is not registered for this school.
          </p>
        </Card>
      );
    }

    const timezoneResult = await pool.query<{ timezone: string | null }>(
      "SELECT timezone FROM schools WHERE school_id = $1",
      [schoolId],
    );
    const timezone = timezoneResult.rows[0]?.timezone;
    if (!timezone) {
      return (
        <Card className="p-6">
          <h1 className="text-xl font-semibold">Follow-up activity unavailable</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            The development school has no configured timezone, so call schedule times cannot be shown reliably.
          </p>
        </Card>
      );
    }

    return (
      <div className="space-y-6 overflow-y-auto p-1 pb-24">
        <header>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Follow-up activity
          </h1>
          <p className="mt-1 text-gray-600 dark:text-gray-300">
            Call requests and observations awaiting review for {teacherResult.rows[0].display_name}.
          </p>
          <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
            Development demo view: the configured teacher ID is not a sign-in session.
          </p>
        </header>

        <Card className="p-5">
          <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
            Call requests
          </h2>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
            These are provider submission states, not proof that a call connected.
          </p>
          {callsResult.rows.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              No follow-up calls are queued or recorded for this teacher.
            </p>
          ) : (
            <div className="space-y-4">
              {callsResult.rows.map((call) => {
                const details = statusDetails[call.status];
                return (
                  <article
                    key={call.follow_up_job_id}
                    className="space-y-3 border-t border-gray-200 pt-4 first:border-0 first:pt-0 dark:border-gray-700"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          Class follow-up · {formatTime(call.scheduled_end_at, timezone)}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Calendar entry {call.calendar_entry_id}
                        </p>
                      </div>
                      <Badge variant={details.variant}>{details.label}</Badge>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {details.explanation}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      <span className="font-medium">Next:</span> {details.nextAction}
                    </p>
                    <dl className="grid gap-2 text-xs text-gray-500 sm:grid-cols-2 dark:text-gray-400">
                      <div>
                        <dt className="inline font-medium">Attempts: </dt>
                        <dd className="inline">{call.attempt_count}</dd>
                      </div>
                      {call.attempt_started_at && (
                        <div>
                          <dt className="inline font-medium">Request started: </dt>
                          <dd className="inline">{formatTime(call.attempt_started_at, timezone)}</dd>
                        </div>
                      )}
                      {call.provider_accepted_at && (
                        <div>
                          <dt className="inline font-medium">Provider accepted: </dt>
                          <dd className="inline">{formatTime(call.provider_accepted_at, timezone)}</dd>
                        </div>
                      )}
                      {call.provider_http_status && (
                        <div>
                          <dt className="inline font-medium">Provider HTTP status: </dt>
                          <dd className="inline">{call.provider_http_status}</dd>
                        </div>
                      )}
                      {safeErrorLabel(call.last_error_code) && (
                        <div>
                          <dt className="inline font-medium">Dispatch note: </dt>
                          <dd className="inline">{safeErrorLabel(call.last_error_code)}</dd>
                        </div>
                      )}
                      <div>
                        <dt className="inline font-medium">Reference: </dt>
                        <dd className="inline">{call.follow_up_job_id}</dd>
                      </div>
                    </dl>
                  </article>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
            Observations awaiting your review
          </h2>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
            Review status is separate from call delivery status and evidence verification.
          </p>
          {observationsResult.rows.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              There are no voice observations awaiting review.
            </p>
          ) : (
            <ul className="space-y-3">
              {observationsResult.rows.map((observation) => (
                <li
                  key={observation.observation_id}
                  className="flex flex-wrap items-start justify-between gap-3 border-t border-gray-200 pt-3 first:border-0 first:pt-0 dark:border-gray-700"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {observation.learner_name}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                      {observation.original_observation}
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Recorded {formatTime(observation.created_at, timezone)} · awaiting teacher confirmation
                    </p>
                  </div>
                  <Link
                    href={`/learners/${encodeURIComponent(observation.learner_id)}`}
                    className="text-sm font-medium text-blue-700 hover:underline dark:text-blue-300"
                  >
                    Review learner record
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            What call statuses mean
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-300">
            <li><strong>Scheduled:</strong> waiting for the class-end time and dispatch checks.</li>
            <li><strong>Provider accepted:</strong> the provider accepted Dira&apos;s request; answer/completion is unknown.</li>
            <li><strong>Request rejected:</strong> the provider rejected the request; no automatic retry is made.</li>
            <li><strong>Outcome uncertain:</strong> Dira cannot safely tell whether the request went through; check before retrying.</li>
          </ul>
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            Missed, declined, answered, completed, and recording states will only appear after authenticated provider callbacks are implemented and verified.
          </p>
        </Card>
      </div>
    );
  } catch (error) {
    console.error("Failed to load follow-up activity:", error);
    return (
      <Card className="p-6">
        <h1 className="text-xl font-semibold">Follow-up activity unavailable</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          The activity could not be loaded. Check that PostgreSQL is available and the Phase 3 call-lifecycle migration has been applied.
        </p>
      </Card>
    );
  }
}
