import React, {useEffect, useState} from 'react'

export default function App(){
  const [status, setStatus] = useState('loading')
  const [dbVersion, setDbVersion] = useState('')

  useEffect(()=>{
    fetch('http://localhost:8000/health').then(r=>r.json()).then(d=>setStatus(d.status)).catch(()=>setStatus('error'))
    fetch('http://localhost:8000/db_version').then(r=>r.json()).then(d=>setDbVersion(d.version || JSON.stringify(d))).catch(()=>setDbVersion('error'))
  },[])

  return (
    <div style={{fontFamily:'Arial', padding:20}}>
      <h1>KeptCarbon</h1>
      <p>Backend status: {status}</p>
      <p>DB version: {dbVersion}</p>
    </div>
  )
}
