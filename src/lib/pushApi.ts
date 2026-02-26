import { supabase } from "../supabaseClient";

/** PushSubscription의 키를 base64 문자열로 인코딩 */
function encodeKey(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/**
 * 푸시 구독 정보를 서버에 저장 (Lv1 사용자 알림용).
 * 동일 user_id + endpoint면 upsert.
 */
export async function savePushSubscription(
  userId: string,
  subscription: PushSubscription,
): Promise<void> {
  const endpoint = subscription.endpoint;
  const p256dh = encodeKey(subscription.getKey("p256dh"));
  const auth = encodeKey(subscription.getKey("auth"));
  if (!p256dh || !auth) throw new Error("구독 키를 읽을 수 없습니다.");

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint,
      p256dh_key: p256dh,
      auth_key: auth,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,endpoint" },
  );
  if (error) throw new Error(error.message);
}
