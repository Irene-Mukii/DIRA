import { revalidatePath } from "next/cache";
import { connection } from "next/server";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import { resolveTeacherContext } from "@/lib/auth/teacher-context";
import {
  confirmDraft,
  discardDraft,
  DraftError,
  listDrafts,
  loadTeacherRoster,
} from "@/lib/services/call-observations";

/** Server action: teacher confirms a draft for the chosen learner (the only draft -> observation path). */
async function confirmAction(formData: FormData) {
  "use server";
  const context = await resolveTeacherContext();
  const draftId = formData.get("draftId");
  const learnerId = formData.get("learnerId");
  if (!context || typeof draftId !== "string") return;
  try {
    await confirmDraft(
      draftId,
      typeof learnerId === "string" && learnerId ? learnerId : undefined,
      context,
    );
  } catch (error) {
    // Rejected confirmations (e.g. no learner chosen) leave the draft untouched.
    if (!(error instanceof DraftError)) throw error;
  }
  revalidatePath("/call-drafts");
}

/** Server action: teacher discards a draft. */
async function discardAction(formData: FormData) {
  "use server";
  const context = await resolveTeacherContext();
  const draftId = formData.get("draftId");
  if (!context || typeof draftId !== "string") return;
  await discardDraft(draftId, context);
  revalidatePath("/call-drafts");
}

export default async function CallDraftsPage() {
  await connection();
  const context = await resolveTeacherContext();
  if (!context) {
    return (
      <Card className="p-6">
        <h1 className="text-xl font-semibold">Call observation drafts unavailable</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          A teacher record is required to review drafts.
        </p>
      </Card>
    );
  }

  const [drafts, roster] = await Promise.all([
    listDrafts(context),
    loadTeacherRoster(context.teacher_id, context.school_id, new Date()),
  ]);
  const nameById = new Map(roster.map((learner) => [learner.learner_id, learner.display_name]));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Phone-call observation drafts</h1>
      <p className="text-sm text-gray-600 dark:text-gray-300">
        These came from your recorded follow-up calls. Nothing is saved as an observation until you confirm it
        against a learner.
      </p>
      {drafts.length === 0 ? (
        <Card className="p-6 text-sm">No drafts yet.</Card>
      ) : (
        drafts.map((draft) => {
          const done = draft.status === "confirmed";
          const choices =
            draft.candidate_learner_ids.length > 0
              ? draft.candidate_learner_ids.map((id) => ({ id, name: nameById.get(id) ?? id }))
              : roster.map((learner) => ({ id: learner.learner_id, name: learner.display_name }));
          return (
            <Card key={draft.draft_id} className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={done ? "default" : "secondary"}>
                  {done
                    ? "Confirmed"
                    : draft.status === "ready"
                      ? "Learner suggested"
                      : "Needs learner"}
                </Badge>
                {draft.is_demo && <Badge variant="outline-solid">Demo call</Badge>}
                {draft.mentioned_name && (
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    You said: {draft.mentioned_name}
                  </span>
                )}
              </div>
              <p className="whitespace-pre-wrap text-sm">{draft.segment_text}</p>
              {done ? (
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Saved for {nameById.get(draft.confirmed_learner_id ?? "") ?? "the chosen learner"}.
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <form action={confirmAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="draftId" value={draft.draft_id} />
                    <select
                      name="learnerId"
                      defaultValue={choices.length === 1 ? choices[0].id : ""}
                      className="rounded-md border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
                    >
                      {choices.length !== 1 && <option value="">Choose learner…</option>}
                      {choices.map((choice) => (
                        <option key={choice.id} value={choice.id}>
                          {choice.name}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white">
                      Confirm
                    </button>
                  </form>
                  <form action={discardAction}>
                    <input type="hidden" name="draftId" value={draft.draft_id} />
                    <button type="submit" className="rounded-md border border-gray-300 px-3 py-1 text-sm dark:border-gray-600">
                      Discard
                    </button>
                  </form>
                </div>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}
