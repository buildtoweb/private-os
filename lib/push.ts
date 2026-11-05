import { createHash } from 'node:crypto';
import webpush, { type PushSubscription } from 'web-push';
import { db, PUSH_SUBSCRIPTIONS } from './db';
import { withTable } from './provision';

export type DashboardPushPayload = {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  badgeCount?: number;
};

type StoredSubscription = {
  ownerId: 'dashboard:primary';
  subscription: PushSubscription;
  userAgent?: string;
  createdAt: string;
  updatedAt: string;
};

function subscriptionId(endpoint: string) {
  return createHash('sha256').update(endpoint).digest('hex');
}

function configureVapid() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new Error('VAPID_NOT_CONFIGURED');
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export function isPushConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    && process.env.VAPID_PRIVATE_KEY
    && process.env.VAPID_SUBJECT,
  );
}

export function validateSubscription(value: any): value is PushSubscription {
  if (!value || typeof value !== 'object') return false;
  if (typeof value.endpoint !== 'string' || !value.endpoint.startsWith('https://') || value.endpoint.length > 4096) return false;
  if (!value.keys || typeof value.keys.p256dh !== 'string' || typeof value.keys.auth !== 'string') return false;
  return value.keys.p256dh.length <= 1024 && value.keys.auth.length <= 512;
}

export async function savePushSubscription(subscription: PushSubscription, userAgent?: string) {
  return withTable(PUSH_SUBSCRIPTIONS, async () => {
    const id = subscriptionId(subscription.endpoint);
    const ref = db().collection(PUSH_SUBSCRIPTIONS).doc(id);
    const previous = await ref.get();
    const now = new Date().toISOString();
    await ref.set({
      ownerId: 'dashboard:primary',
      subscription,
      userAgent: userAgent?.slice(0, 512),
      createdAt: previous.data()?.createdAt || now,
      updatedAt: now,
    } satisfies StoredSubscription);
    return id;
  });
}

export async function removePushSubscription(endpoint: string) {
  if (!endpoint.startsWith('https://') || endpoint.length > 4096) return;
  await withTable(PUSH_SUBSCRIPTIONS, () => (
    db().collection(PUSH_SUBSCRIPTIONS).doc(subscriptionId(endpoint)).delete()
  ));
}

export async function sendDashboardPush(payload: DashboardPushPayload) {
  configureVapid();
  const snapshot = await withTable(PUSH_SUBSCRIPTIONS, () => (
    db().collection(PUSH_SUBSCRIPTIONS).get()
  ));
  const result = { delivered: 0, expired: 0, failed: 0 };
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body || '',
    url: payload.url?.startsWith('/') ? payload.url : '/',
    tag: payload.tag,
    badgeCount: payload.badgeCount,
  });

  await Promise.all(snapshot.docs.map(async (doc) => {
    const stored = doc.data() as StoredSubscription | undefined;
    if (!stored || !validateSubscription(stored.subscription)) {
      result.failed += 1;
      return;
    }
    try {
      // High urgency so a phone in power-saving or Focus mode still wakes for it
      // (Apple maps it to apns-priority 10, FCM to high priority).
      await webpush.sendNotification(stored.subscription, body, { TTL: 60 * 60, urgency: 'high' });
      result.delivered += 1;
    } catch (error: any) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await db().collection(PUSH_SUBSCRIPTIONS).doc(doc.id).delete();
        result.expired += 1;
      } else {
        result.failed += 1;
      }
    }
  }));

  return result;
}
