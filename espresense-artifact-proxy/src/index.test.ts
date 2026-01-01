import app from '.'

describe('Test the application', () => {
  it('Should return 200 response', async () => {
    const res = await app.fetch(new Request('http://localhost/'), {}, { waitUntil: () => {} })
    expect(res.status).toBe(200)
  })
})
