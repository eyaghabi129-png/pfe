import { getDb } from '../db/client.js';

export async function recordAction(params: {
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  meta?: any;
}) {
  const db = getDb();
  try {
    await db.query(
      `insert into audit_events (actor_user_id, action, entity_type, entity_id, meta) values ($1, $2, $3, $4, $5)`,
      [params.actorUserId, params.action, params.entityType, params.entityId, JSON.stringify(params.meta || {})]
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to record audit event:', err);
  }
}
