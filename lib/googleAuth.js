import { GoogleAuth } from 'google-auth-library'

let authClient = null

// 서비스 계정으로 Google Sheets API 접근 토큰 발급
export async function getGoogleAccessToken() {
  if (!authClient) {
    authClient = new GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    })
  }

  const client = await authClient.getClient()
  const tokenResponse = await client.getAccessToken()
  return tokenResponse.token
}
