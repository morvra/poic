// Dropbox API Utilities

const CLIENT_ID = '7f660m206ftjupz'; // Provided App Key
// redirect_uri must be configured in Dropbox App Console to match the deployed URL
const REDIRECT_URI = window.location.origin + window.location.pathname; 

export const getAuthUrl = () => {
  const url = new URL('https://www.dropbox.com/oauth2/authorize');
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('response_type', 'token');
  // scope: account_info.read files.content.read files.content.write
  // Note: Ensure these scopes are enabled in the Dropbox App Console
  return url.toString();
};

export const parseTokenFromUrl = (): string | null => {
  const hash = window.location.hash;
  if (!hash) return null;
  
  const params = new URLSearchParams(hash.substring(1)); // remove #
  return params.get('access_token');
};

const FILE_PATH = '/poic_data.json';

export const uploadToDropbox = async (token: string, data: any) => {
  const fileContent = JSON.stringify(data);
  
  const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({
        path: FILE_PATH,
        mode: 'overwrite', // overwrite existing file
        autorename: false,
        mute: true,
        strict_conflict: false
      })
    },
    body: fileContent
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Dropbox Upload Failed: ${response.status} ${errorText}`);
  }
  
  return await response.json();
};

export const downloadFromDropbox = async (token: string): Promise<any | null> => {
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
    // File path not found error usually
    console.log('File not found in Dropbox, creating new one on next save.');
    return null;
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Dropbox Download Failed: ${response.status} ${errorText}`);
  }

  return await response.json();
};
