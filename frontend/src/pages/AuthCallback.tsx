import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    const username = params.get('username')

    if (token) sessionStorage.setItem('github_token', token)
    if (username) sessionStorage.setItem('username', username)

    navigate('/', { replace: true })
  }, [navigate])

  return null
}
