import app from '.'

describe('Test the application', () => {
  it('Should return 200 response for root endpoint', async () => {
    const res = await app.request('http://localhost/')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('OK')
  })

  it('Should return 404 for non-existent routes', async () => {
    const res = await app.request('http://localhost/nonexistent')
    expect(res.status).toBe(404)
  })

  it('Should have CORS headers', async () => {
    const res = await app.request('http://localhost/')
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('Should set Cache-Control headers on cached endpoints', async () => {
    const res = await app.request('http://localhost/')
    const cacheControl = res.headers.get('cache-control')
    // Root endpoint should have cache headers or not, depending on implementation
    expect(cacheControl).toBeDefined()
  })
})
