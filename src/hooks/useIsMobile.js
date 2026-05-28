import { useState, useEffect } from 'react'

const MQ = '(max-width: 768px)'

export function useIsMobile() {
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MQ).matches
  )
  useEffect(() => {
    const mq = window.matchMedia(MQ)
    setMobile(mq.matches)
    const handler = e => setMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return mobile
}
