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
      bleed_location: entry.bleed_location || null,
      bleed_side: entry.bleed_side || null,
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
