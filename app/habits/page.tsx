import { redirect } from 'next/navigation';

// The dedicated Habits tab was removed in the redesign — habits now live on the
// Today page (inline daily cards + the "Tracker" modal). Keep this route as a
// permanent redirect so old bookmarks/links still land somewhere sensible.
export default function HabitsRedirect() {
  redirect('/');
}
