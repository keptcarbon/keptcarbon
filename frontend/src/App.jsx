import React, {useEffect, useState} from 'react'

export default function App(){
  const [status, setStatus] = useState('loading')
  const [dbVersion, setDbVersion] = useState('')
  const [projects, setProjects] = useState([])
  const [formData, setFormData] = useState({name: '', location: '', tons_offset: '', description: ''})
  const [loading, setLoading] = useState(false)

  useEffect(()=>{
    fetch('http://localhost:8000/health').then(r=>r.json()).then(d=>setStatus(d.status)).catch(()=>setStatus('error'))
    fetch('http://localhost:8000/db_version').then(r=>r.json()).then(d=>setDbVersion(d.version || JSON.stringify(d))).catch(()=>setDbVersion('error'))
    fetchProjects()
  },[])

  const fetchProjects = () => {
    fetch('http://localhost:8000/projects').then(r=>r.json()).then(d=>setProjects(d)).catch(e=>console.error(e))
  }

  const handleFormChange = (e) => {
    const {name, value} = e.target
    setFormData({...formData, [name]: value})
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('http://localhost:8000/projects', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          name: formData.name,
          location: formData.location,
          tons_offset: parseFloat(formData.tons_offset),
          description: formData.description
        })
      })
      if(res.ok) {
        setFormData({name: '', location: '', tons_offset: '', description: ''})
        fetchProjects()
      }
    } catch(e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const statusBg = status === 'ok' ? '#10b981' : status === 'loading' ? '#f59e0b' : '#ef4444'
  const statusText = status === 'ok' ? 'Active' : status === 'loading' ? 'Connecting...' : 'Offline'

  return (
    <div className="app">
      {/* Navigation */}
      <nav className="navbar">
        <div className="container">
          <div className="logo">🌍 KeptCarbon</div>
          <div className="nav-links">
            <a href="#features">Features</a>
            <a href="#status">Status</a>
            <a href="#projects">Projects</a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <h1>Carbon Offset Platform</h1>
          <p>Track, manage, and optimize your environmental impact with real-time geospatial data.</p>
          <button className="cta-btn">Get Started</button>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="features">
        <div className="container">
          <h2>Features</h2>
          <div className="feature-grid">
            <div className="feature-card">
              <div className="feature-icon">📊</div>
              <h3>Real-time Analytics</h3>
              <p>Monitor carbon metrics with live dashboards</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🗺️</div>
              <h3>Geospatial Data</h3>
              <p>PostGIS-powered location-based insights</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">⚡</div>
              <h3>Fast API</h3>
              <p>Lightning-quick backend with FastAPI</p>
            </div>
          </div>
        </div>
      </section>

      {/* System Status */}
      <section id="status" className="status-section">
        <div className="container">
          <h2>System Status</h2>
          <div className="status-grid">
            <div className="status-card">
              <div className="status-header">
                <h3>Backend</h3>
                <span className="status-badge" style={{backgroundColor: statusBg}}>{statusText}</span>
              </div>
              <p className="status-detail">FastAPI Server</p>
            </div>
            <div className="status-card">
              <div className="status-header">
                <h3>Database</h3>
                <span className="status-badge" style={{backgroundColor: dbVersion ? '#10b981' : '#f59e0b'}}>Connected</span>
              </div>
              <p className="status-detail">{dbVersion ? dbVersion.substring(0, 50) + '...' : 'Initializing...'}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Projects Section */}
      <section id="projects" className="projects-section">
        <div className="container">
          <h2>Carbon Projects</h2>
          
          {/* Create Project Form */}
          <div className="form-card">
            <h3>Register New Project</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <input type="text" name="name" placeholder="Project Name" value={formData.name} onChange={handleFormChange} required />
                <input type="text" name="location" placeholder="Location" value={formData.location} onChange={handleFormChange} required />
              </div>
              <div className="form-row">
                <input type="number" step="0.1" name="tons_offset" placeholder="Tons Offset" value={formData.tons_offset} onChange={handleFormChange} required />
              </div>
              <textarea name="description" placeholder="Description (optional)" value={formData.description} onChange={handleFormChange}></textarea>
              <button type="submit" className="submit-btn" disabled={loading}>{loading ? 'Submitting...' : 'Submit Project'}</button>
            </form>
          </div>

          {/* Projects List */}
          <div className="projects-list">
            <h3>Active Projects ({projects.length})</h3>
            {projects.length === 0 ? (
              <p className="no-projects">No projects yet. Create your first one above!</p>
            ) : (
              <div className="projects-grid">
                {projects.map(proj => (
                  <div key={proj.id} className="project-card">
                    <div className="project-header">
                      <h4>{proj.name}</h4>
                      <span className="project-id">#{proj.id}</span>
                    </div>
                    <p className="project-location">📍 {proj.location}</p>
                    <p className="project-tons">🌱 {proj.tons_offset} tons CO₂ offset</p>
                    {proj.description && <p className="project-desc">{proj.description}</p>}
                    <small className="project-date">{new Date(proj.created_at).toLocaleDateString()}</small>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <p>&copy; 2026 KeptCarbon. Building a sustainable future.</p>
          <div className="footer-links">
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
            <a href="#">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
