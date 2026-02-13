import { GoogleAuth } from 'google-auth-library'

let authClient = null

// 서비스 계정으로 Google Sheets API 접근 토큰 발급
export async function getGoogleAccessToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY

  if (!email || !privateKey) {
    const missing = []
    if (!email) missing.push('GOOGLE_SERVICE_ACCOUNT_EMAIL')
    if (!privateKey) missing.push('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')
    throw new Error(`환경변수 누락: ${missing.join(', ')}`)
  }

  if (!authClient) {
    authClient = new GoogleAuth({
      credentials: {
        type: 'service_account',
        client_email: email,
        private_key: privateKey.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    })
  }

  const client = await authClient.getClient()
  const tokenResponse = await client.getAccessToken()
  return tokenResponse.token
}
