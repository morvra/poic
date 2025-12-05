// Dropbox API Utilities with PKCE Flow

const CLIENT_ID = '5hwhw0juzjrs0o0'; // Provided App Key
// redirect_uri must be configured in Dropbox App Console to match the deployed URL
const REDIRECT_URI = window.location.origin + window.location.pathname; 

// --- PKCE Helpers ---

const generateRandomString = (length: number) => {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  for (let i = 0; i < length; i++) {
    result += charset[values[i] % charset.length];
  }
  return result;
};

const sha256 = async (plain: string) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return hash;
};

const base64UrlEncode = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

// --- Auth Functions ---

export const initiateAuth = async () => {
  const codeVerifier = generateRandomString(128);
  const hash = await sha256(codeVerifier);
  const codeChallenge = base64UrlEncode(hash);

  // Store code_verifier locally to use after redirect
  localStorage.setItem('dropbox_code_verifier', codeVerifier);

  const url = new URL('https://www.dropbox.com/oauth2/authorize');
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  // Ensure 'token_access_type' is set to 'offline' to get a refresh token
  url.searchParams.set('token_access_type', 'offline'); 
  
  window.location.href = url.toString();
};

export const handleAuthCallback = async (code: string): Promise<string> => {
  const codeVerifier = localStorage.getItem('dropbox_code_verifier');
  if (!codeVerifier) {
    throw new Error('Code verifier not found');
  }

  const params = new URLSearchParams();
  params.append('code', code);
  params.append('grant_type', 'authorization_code');
  params.append('client_id', CLIENT_ID);
  params.append('redirect_uri', REDIRECT_URI);
  params.append('code_verifier', codeVerifier);

  const response = await fetch('https://api.dropbox.com/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  const data = await response.json();
  
  // Save tokens
  localStorage.setItem('dropbox_access_token', data.access_token);
  localStorage.setItem('dropbox_refresh_token', data.refresh_token);
  // Calculate expiry time (expires_in is in seconds)
  const expiresAt = Date.now() + (data.expires_in * 1000);
  localStorage.setItem('dropbox_expires_at', expiresAt.toString());

  // Clean up
  localStorage.removeItem('dropbox_code_verifier');
  
  return data.access_token;
};

export const getAccessToken = async (): Promise<string | null> => {
  let accessToken = localStorage.getItem('dropbox_access_token');
  const refreshToken = localStorage.getItem('dropbox_refresh_token');
  const expiresAtStr = localStorage.getItem('dropbox_expires_at');
  
  if (!accessToken || !refreshToken || !expiresAtStr) {
    return null;
  }

  const expiresAt = parseInt(expiresAtStr, 10);
  // Refresh if expired or expiring soon (within 5 mins)
  if (Date.now() > expiresAt - 5 * 60 * 1000) {
    try {
      accessToken = await refreshAccessToken(refreshToken);
    } catch (e) {
      console.error('Failed to refresh token', e);
      return null; // Force re-login
    }
  }

  return accessToken;
};

const refreshAccessToken = async (refreshToken: string): Promise<string> => {
  const params = new URLSearchParams();
  params.append('grant_type', 'refresh_token');
  params.append('refresh_token', refreshToken);
  params.append('client_id', CLIENT_ID);

  const response = await fetch('https://api.dropbox.com/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!response.ok) {
    throw new Error('Token refresh failed');
  }

  const data = await response.json();
  
  localStorage.setItem('dropbox_access_token', data.access_token);
  // Refresh token might be rotated, though usually stays same for Dropbox
  if (data.refresh_token) {
      localStorage.setItem('dropbox_refresh_token', data.refresh_token);
  }
  const expiresAt = Date.now() + (data.expires_in * 1000);
  localStorage.setItem('dropbox_expires_at', expiresAt.toString());

  return data.access_token;
};


// --- File Operations (Wrapper to ensure valid token) ---

const FILE_PATH = '/poic_data.json';

export const uploadToDropbox = async (data: any) => {
  const token = await getAccessToken();
  if (!token) throw new Error('Unauthorized');

  const fileContent = JSON.stringify(data);
  
  const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({
        path: FILE_PATH,
        mode: 'overwrite', 
        autorename: false,
        mute: true,
        strict_conflict: false
      })
    },
    body: fileContent
  });

  if (!response.ok) {
    // Handle 401 specifically in UI layer usually, but throw here
    const errorText = await response.text();
    throw new Error(`Dropbox Upload Failed: ${response.status} ${errorText}`);
  }
  
  return await response.json();
};

export const downloadFromDropbox = async (): Promise<any | null> => {
  const token = await getAccessToken();
  if (!token) throw new Error('Unauthorized');

  const response = await fetch('https://content.dropboxapi.com/2/files/download', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Dropbox-API-Arg': JSON.stringify({
        path: FILE_PATH
      })
    }
  });

  if (response.status === 409) {
    console.log('File not found in Dropbox.');
    return null;
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Dropbox Download Failed: ${response.status} ${errorText}`);
  }

  return await response.json();
};

export const isAuthenticated = () => {
    return !!localStorage.getItem('dropbox_refresh_token');
}

export const logout = () => {
    localStorage.removeItem('dropbox_access_token');
    localStorage.removeItem('dropbox_refresh_token');
    localStorage.removeItem('dropbox_expires_at');
    localStorage.removeItem('dropbox_code_verifier');
}
