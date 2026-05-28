import { useState, useEffect, createContext, useContext } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session,         setSession]         = useState(undefined) // undefined = initializing
  const [profile,         setProfile]         = useState(null)
  const [facility,        setFacility]        = useState(null)
  const [facilityLoading, setFacilityLoading] = useState(false)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data }) => {
      const sess = data.session ?? null
      setSession(sess)
      if (sess) {
        setFacilityLoading(true)
        loadProfile(sess.user.id).finally(() => setFacilityLoading(false))
      } else {
        setSession(null)
      }
    })

    // Listen for auth changes
    const { data: listener } = supabase.auth.onAuthStateChange((_ev, sess) => {
      setSession(sess)
      if (sess) {
        setFacilityLoading(true)
        loadProfile(sess.user.id).finally(() => setFacilityLoading(false))
      } else {
        setProfile(null)
        setFacility(null)
        setFacilityLoading(false)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function loadProfile(userId) {
    const { data: prof } = await supabase
      .from('user_profiles')
      .select('id, full_name, role, avatar_url, created_at')
      .eq('id', userId)
      .single()

    setProfile(prof)

    if (prof) {
      const { data: staff } = await supabase
        .from('facility_staff')
        .select(`
          facility_id, role,
          facilities(
            id, name, facility_type, registration_number,
            city, state_province, country,
            is_verified, is_active, email, phone, created_at
          )
        `)
        .eq('user_id', userId)
        .eq('is_active', true)
        .limit(1)
        .single()

      if (staff?.facilities) {
        setFacility({ ...staff.facilities, staffRole: staff.role })
      } else {
        setFacility(null)
      }
    }
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error
  }

  async function signUp(email, password, fullName) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: 'https://app.orela.africa',
      },
    })
    return { data, error }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function refreshFacility() {
    const { data: { session: sess } } = await supabase.auth.getSession()
    if (sess) {
      setFacilityLoading(true)
      await loadProfile(sess.user.id)
      setFacilityLoading(false)
    }
  }

  // loading = true while session is initializing OR while facility is being fetched
  const loading = session === undefined || facilityLoading

  return (
    <AuthContext.Provider value={{
      session, profile, facility,
      signIn, signUp, signOut, refreshFacility,
      loading,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
