import { supabase } from './supabase'

export async function listUserMedications(userId) {
  const { data, error } = await supabase
    .from('user_medications')
    .select('*')
    .eq('user_id', userId)
  if (error) throw error
  return data
}

export async function upsertUserMedication(userId, medRow) {
  const { error } = await supabase
    .from('user_medications')
    .upsert(
      {
        user_id: userId,
        med_id: medRow.med_id,
        med_name: medRow.med_name,
        start_date: medRow.start_date,
        interval_days: medRow.interval_days,
        freq_label: medRow.freq_label,
        unit_size: medRow.unit_size,
        stock_count: medRow.stock_count,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,med_id' }
    )
  if (error) throw error
}

export async function deleteUserMedication(userId, medId) {
  const { error } = await supabase
    .from('user_medications')
    .delete()
    .eq('user_id', userId)
    .eq('med_id', medId)
  if (error) throw error
}

export async function listDoseLogs(userId) {
  const { data, error } = await supabase
    .from('dose_logs')
    .select('*')
    .eq('user_id', userId)
    .order('taken_at', { ascending: false })
  if (error) throw error
  return data
}

export async function insertDoseLog(userId, entry) {
  // Bleed detail (location/severity/pain/symptoms) now lives on bleed_events —
  // new doses only carry a bleed_event_id link, not those columns directly.
  // The columns still exist for rows logged the old way; we just stop writing them.
  const { data, error } = await supabase
    .from('dose_logs')
    .insert({
      user_id: userId,
      med_id: entry.med_id,
      med_name: entry.med_name,
      taken_at: entry.taken_at,
      dosage: entry.dosage || null,
      reason: entry.reason,
      note: entry.note || null,
      products_used: entry.products_used ?? null,
      bleed_event_id: entry.bleed_event_id || null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteDoseLog(userId, id) {
  const { error } = await supabase
    .from('dose_logs')
    .delete()
    .eq('user_id', userId)
    .eq('id', id)
  if (error) throw error
}

export async function listBleedEvents(userId) {
  const { data, error } = await supabase
    .from('bleed_events')
    .select('*')
    .eq('user_id', userId)
    .order('occurred_at', { ascending: false })
  if (error) throw error
  return data
}

export async function insertBleedEvent(userId, entry) {
  const { data, error } = await supabase
    .from('bleed_events')
    .insert({
      user_id: userId,
      occurred_at: entry.occurred_at,
      location: entry.location || null,
      side: entry.side || null,
      severity: entry.severity || null,
      pain_level: entry.pain_level ?? null,
      symptom_swelling: entry.symptom_swelling ?? false,
      symptom_bruising: entry.symptom_bruising ?? false,
      symptom_discoloration: entry.symptom_discoloration ?? false,
      note: entry.note || null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteBleedEvent(userId, id) {
  const { error } = await supabase
    .from('bleed_events')
    .delete()
    .eq('user_id', userId)
    .eq('id', id)
  if (error) throw error
}

export async function linkDoseToBleedEvent(userId, doseLogId, bleedEventId) {
  const { error } = await supabase
    .from('dose_logs')
    .update({ bleed_event_id: bleedEventId })
    .eq('user_id', userId)
    .eq('id', doseLogId)
  if (error) throw error
}

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function updateProfileName(userId, { first_name, last_name }) {
  // Only first_name/last_name are grantable here by design (see 003_profiles_and_roles.sql) —
  // don't include other columns like updated_at, or the whole statement gets rejected.
  const { error } = await supabase
    .from('profiles')
    .update({ first_name, last_name })
    .eq('id', userId)
  if (error) throw error
}

// Provider-only reads — no .eq('user_id', ...) filter is intentional here.
// These only return cross-patient data because the "select own or provider"
// RLS policy allows it for role='provider' accounts; a patient account
// calling these gets exactly the same rows listUserMedications/listDoseLogs
// would return (their own), since RLS still applies underneath.
export async function listAllPatientProfiles() {
  const { data, error } = await supabase.from('profiles').select('*')
  if (error) throw error
  return data
}

export async function listAllMedicationsForProviders() {
  const { data, error } = await supabase.from('user_medications').select('*')
  if (error) throw error
  return data
}

export async function setPatientArchived(patientId, archived) {
  const { error } = await supabase.from('profiles').update({ archived }).eq('id', patientId)
  if (error) throw error
}

export async function listAllDoseLogsForProviders() {
  const { data, error } = await supabase
    .from('dose_logs')
    .select('*')
    .order('taken_at', { ascending: false })
  if (error) throw error
  return data
}

export async function listAllBleedEventsForProviders() {
  const { data, error } = await supabase
    .from('bleed_events')
    .select('*')
    .order('occurred_at', { ascending: false })
  if (error) throw error
  return data
}

// Provider-only write — only unit_size/stock_count are sent, matching the
// DB-side trigger's intent even though the trigger is what actually enforces
// it (see 009_provider_stock_edit_and_notifications.sql). Deliberately not a
// reuse of upsertUserMedication, which sends every column.
export async function updateMedicationStock(patientId, medId, { unit_size, stock_count }) {
  const { error } = await supabase
    .from('user_medications')
    .update({ unit_size, stock_count, updated_at: new Date().toISOString() })
    .eq('user_id', patientId)
    .eq('med_id', medId)
  if (error) throw error
}

export async function listMyNotifications(userId) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return data
}

export async function markNotificationRead(id) {
  const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id)
  if (error) throw error
}

export async function markAllNotificationsRead(userId) {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('recipient_id', userId)
    .eq('read', false)
  if (error) throw error
}

export async function sendReminder(patientId, message) {
  const { error } = await supabase
    .from('notifications')
    .insert({ recipient_id: patientId, type: 'reminder', message })
  if (error) throw error
}

// ==================== Messaging ====================
// RLS on conversations/messages/etc scopes every plain select below to
// exactly what the caller can see (their own patient_team thread, every
// patient_team thread if they're a provider, and any provider_dm they're a
// participant in) — same bulk-fetch-then-filter-in-JS style as Provider.jsx.

export async function listMyConversations() {
  const { data, error } = await supabase.from('conversations').select('*')
  if (error) throw error
  return data
}

export async function listMyMessages(conversationId) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

// Bulk across every accessible conversation, for the inbox list's last-message
// preview — mirrors listAllDoseLogsForProviders' bulk-then-group approach.
export async function listAllMyMessages() {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function listMyMessageReads(conversationId) {
  const { data, error } = await supabase
    .from('message_reads')
    .select('*')
    .eq('conversation_id', conversationId)
  if (error) throw error
  return data
}

export async function listAllMyMessageReads() {
  const { data, error } = await supabase.from('message_reads').select('*')
  if (error) throw error
  return data
}

export async function sendMessage(conversationId, senderId, body) {
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, body })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function uploadMessageAttachment(conversationId, messageId, file) {
  const path = `${conversationId}/${crypto.randomUUID()}-${file.name}`
  const { error: uploadError } = await supabase.storage
    .from('message-attachments')
    .upload(path, file)
  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from('message_attachments')
    .insert({
      message_id: messageId,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function listAttachmentsForMessages(messageIds) {
  if (messageIds.length === 0) return []
  const { data, error } = await supabase
    .from('message_attachments')
    .select('*')
    .in('message_id', messageIds)
  if (error) throw error
  return data
}

export async function getAttachmentSignedUrl(storagePath) {
  const { data, error } = await supabase.storage
    .from('message-attachments')
    .createSignedUrl(storagePath, 3600)
  if (error) throw error
  return data.signedUrl
}

export async function markConversationRead(conversationId, userId) {
  const { error } = await supabase
    .from('message_reads')
    .upsert({ conversation_id: conversationId, user_id: userId }, { onConflict: 'conversation_id,user_id' })
  if (error) throw error
}

export async function getOrCreateProviderDM(otherProviderId) {
  const { data, error } = await supabase.rpc('get_or_create_provider_dm', { other_provider_id: otherProviderId })
  if (error) throw error
  return data
}

export async function countUnreadMessages() {
  const { data, error } = await supabase.rpc('count_unread_messages')
  if (error) throw error
  return data
}

export async function listProvidersForDM(myId) {
  const { data, error } = await supabase.from('profiles').select('*').eq('role', 'provider').neq('id', myId)
  if (error) throw error
  return data
}
