import React from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';

/**
 * Reminders now live on the To-do page (today's sit in the day list; the
 * Reminders tab holds all of them). Old links and pushes still use
 * /reminders: ?item= or ?med= opens that reminder, ?new=1 starts one, and a
 * bare /reminders opens the Reminders tab.
 */
export default function Reminders() {
  const [params] = useSearchParams();
  const id = params.get('item') || params.get('med');
  const to = id ? `/tasks?reminder=${encodeURIComponent(id)}`
    : params.get('new') ? '/tasks?reminder=new'
    : '/tasks?tab=reminders';
  return <Navigate to={to} replace />;
}
