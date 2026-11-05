import { redirect } from 'next/navigation';

// The dedicated Ziele tab was removed in the redesign — goals now live inside the
// Reflexion tab as a third switch. Redirect old links straight to that view.
export default function ZieleRedirect() {
  redirect('/reflexion?tab=goals');
}
