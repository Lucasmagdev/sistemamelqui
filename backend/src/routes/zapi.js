import { Router } from "express";

export function createZapiRouter(deps) {
  const {
    supabase,
    extractWebhookMessageMeta,
    normalizeLocalMessageStatus,
    updateWhatsAppMessagesByIds,
    updateWhatsAppMessageStatus,
  } = deps;

  const router = Router();

  router.post("/webhook", async (req, res) => {
    const payload = req.body || {};
    const meta = extractWebhookMessageMeta(payload);
    const allMessageIds = Array.from(new Set([meta.messageId, ...(meta.messageIds || [])].filter(Boolean)));

    let matchedOrderId = null;
    if (allMessageIds.length || meta.zaapId) {
      const matcher = allMessageIds.length
        ? supabase.from("whatsapp_messages").select("order_id").in("message_id", allMessageIds).limit(1)
        : supabase.from("whatsapp_messages").select("order_id").eq("zaap_id", meta.zaapId).limit(1);
      const { data } = await matcher;
      matchedOrderId = data?.[0]?.order_id || null;
    }

    const webhookInsert = await supabase
      .from("whatsapp_webhook_events")
      .insert([{
        order_id: matchedOrderId,
        event_type: meta.eventType || null,
        message_id: allMessageIds[0] || null,
        zaap_id: meta.zaapId,
        payload,
        processed_at: new Date().toISOString(),
      }])
      .select("*")
      .maybeSingle();

    const localStatus = normalizeLocalMessageStatus(meta.eventType);
    if (allMessageIds.length) {
      await updateWhatsAppMessagesByIds({
        messageIds: allMessageIds,
        localStatus,
        providerResponse: payload,
        errorDetail: localStatus === "failed" ? JSON.stringify(payload) : null,
      });
    } else if (meta.zaapId) {
      await updateWhatsAppMessageStatus({
        messageId: null,
        zaapId: meta.zaapId,
        localStatus,
        providerResponse: payload,
        errorDetail: localStatus === "failed" ? JSON.stringify(payload) : null,
      });
    }

    return res.json({
      ok: true,
      matched_order_id: matchedOrderId,
      event_id: webhookInsert.data?.id || null,
      local_status: localStatus,
      message_ids: allMessageIds,
    });
  });

  return router;
}
