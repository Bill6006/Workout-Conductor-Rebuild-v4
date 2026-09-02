import type { ProfileDraft } from '../draft';

/** Every editor edits the same ProfileDraft; onboarding and Settings both use them. */
export interface EditorProps {
  draft: ProfileDraft;
  onChange: (next: ProfileDraft) => void;
}
