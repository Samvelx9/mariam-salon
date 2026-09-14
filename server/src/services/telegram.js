// Real implementation lands in Step 5. For now this is a no-op so the booking
// flow can call it without caring whether notifications are wired up yet.
export async function notifyTelegram(_event) {
  return;
}
