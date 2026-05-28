import { useFacility } from '../hooks/useFacility'
import { Link } from 'react-router-dom'

export default function AnalyticsPage() {
  const { facility } = useFacility()

  return (
    <div>
      <div className="page-top">
        <div>
          <div className="page-eyebrow">My Facility · Supply Intelligence</div>
          <div className="page-title">Supply Intelligence</div>
          <div className="page-subtitle">
            Operational analytics for {facility?.name ?? 'your facility'}
          </div>
        </div>
      </div>

      <div className="card card-pad" style={{ textAlign: 'center', padding: '60px 40px' }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>📊</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
          Analytics coming soon
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 420, margin: '0 auto 24px' }}>
          Supply intelligence reports will populate once your facility has recorded inventory and transfer activity.
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/inventory" className="btn btn-primary btn-sm">Add inventory</Link>
          <Link to="/transfers" className="btn btn-ghost btn-sm">View transfers</Link>
        </div>
      </div>
    </div>
  )
}
