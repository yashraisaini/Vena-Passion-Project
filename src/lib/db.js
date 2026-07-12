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
