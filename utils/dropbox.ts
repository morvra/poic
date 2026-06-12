// utils/dropbox.ts
// Dropbox API Utilities with PKCE Flow - Markdown Files Version

import { idbStorage } from './indexedDB';
import { CardType, type Card } from '../types';
import { generateId } from '../utils';

const CLIENT_ID = '5hwhw0juzjrs0o0';
const REDIRECT_URI = window.location.origin + window.location.pathname;
const CARDS_FOLDER = '';

// cursor保存キー
const DROPBOX_CURSOR_KEY = 'dropbox_list_cursor';

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

  await idbStorage.setItem('dropbox_code_verifier', codeVerifier);

  const url = new URL('https://www.dropbox.com/oauth2/authorize');
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('token_access_type', 'offline');
  
  window.location.href = url.toString();
};

export const handleAuthCallback = async (code: string): Promise<string> => {
  const codeVerifier = await idbStorage.getItem('dropbox_code_verifier');
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
  
  await idbStorage.setItem('dropbox_access_token', data.access_token);
  await idbStorage.setItem('dropbox_refresh_token', data.refresh_token);
  const expiresAt = Date.now() + (data.expires_in * 1000);
  await idbStorage.setItem('dropbox_expires_at', expiresAt.toString());
  await idbStorage.removeItem('dropbox_code_verifier');
  
  return data.access_token;
};

export const getAccessToken = async (): Promise<string | null> => {
  let accessToken = await idbStorage.getItem('dropbox_access_token');
  const refreshToken = await idbStorage.getItem('dropbox_refresh_token');
  const expiresAtStr = await idbStorage.getItem('dropbox_expires_at');
  
  if (!accessToken || !refreshToken || !expiresAtStr) {
    return null;
  }

  const expiresAt = parseInt(expiresAtStr, 10);
  if (Date.now() > expiresAt - 5 * 60 * 1000) {
    try {
      accessToken = await refreshAccessToken(refreshToken);
    } catch (e) {
      console.error('Failed to refresh token', e);
      return null;
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
  
  await idbStorage.setItem('dropbox_access_token', data.access_token);
  if (data.refresh_token) {
    await idbStorage.setItem('dropbox_refresh_token', data.refresh_token);
  }
  const expiresAt = Date.now() + (data.expires_in * 1000);
  await idbStorage.setItem('dropbox_expires_at', expiresAt.toString());

  return data.access_token;
};

// --- Markdown Conversion Functions ---

const cardToMarkdown = (card: Card): string => {
  const frontmatter: string[] = [
    '---',
    `id: ${card.id}`,
    `title: "${card.title.replace(/"/g, '\\"')}"`,
    `type: ${card.type}`,
    `created: ${new Date(card.createdAt).toISOString()}`,
    `updated: ${new Date(card.updatedAt).toISOString()}`,
  ];

  if (card.stacks && card.stacks.length > 0) {
    frontmatter.push(`tags:`);
    card.stacks.forEach(tag => {
      frontmatter.push(`  - ${tag}`);
    });
  }

  if (card.dueDate) {
    frontmatter.push(`dueDate: ${new Date(card.dueDate).toISOString()}`);
  }

  if (card.completed !== undefined) {
    frontmatter.push(`completed: ${card.completed}`);
  }

  if (card.isPinned) {
    frontmatter.push(`pinned: ${typeof card.isPinned === 'number' ? new Date(card.isPinned).toISOString() : 'true'}`);
  }

  if (card.isDeleted) {
    frontmatter.push(`deleted: true`);
    if (card.deletedAt) {
      frontmatter.push(`deletedAt: ${new Date(card.deletedAt).toISOString()}`);
    }
  }

  frontmatter.push('---');
  frontmatter.push('');

  return frontmatter.join('\n') + card.body;
};

const markdownToCard = (markdown: string, filename: string): Card | null => {
  let frontmatter: Record<string, any> = {};
  let body = markdown;

  const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  
  if (frontmatterMatch) {
    const [, frontmatterText, bodyText] = frontmatterMatch;
    body = bodyText;

    const lines = frontmatterText.split('\n');
    let currentKey: string | null = null;
    let currentArray: string[] | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('- ')) {
        if (currentArray) {
          currentArray.push(trimmed.substring(2));
        }
        continue;
      }

      const colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0) {
        const key = trimmed.substring(0, colonIndex).trim();
        const value = trimmed.substring(colonIndex + 1).trim();

        if (value === '') {
          currentKey = key;
          currentArray = [];
          frontmatter[key] = currentArray;
        } else {
          currentKey = null;
          currentArray = null;
          
          if (value === 'true') {
            frontmatter[key] = true;
          } else if (value === 'false') {
            frontmatter[key] = false;
          } else if (value.startsWith('"') && value.endsWith('"')) {
            frontmatter[key] = value.slice(1, -1).replace(/\\"/g, '"');
          } else {
            frontmatter[key] = value;
          }
        }
      }
    }
  } else {
    console.log(`No frontmatter found in ${filename}, generating defaults`);
    const titleFromFilename = filename.replace('.md', '');
    frontmatter = {
      title: titleFromFilename,
      type: 'Record',
      tags: []
    };
  }

  try {
    let cardType: CardType = CardType.Record;
    if (frontmatter.type && Object.values(CardType).includes(frontmatter.type)) {
      cardType = frontmatter.type as CardType;
    }

    let cardId = frontmatter.id;
    if (!cardId) {
      cardId = generateId();
    }

    const now = Date.now();
    
    const card: Card = {
      id: cardId,
      type: cardType,
      title: frontmatter.title || filename.replace('.md', '') || 'Untitled',
      body: body.trim(),
      createdAt: frontmatter.created ? new Date(frontmatter.created).getTime() : now,
      updatedAt: frontmatter.updated ? new Date(frontmatter.updated).getTime() : now,
      stacks: frontmatter.tags || [],
      completed: frontmatter.completed || false,
      isDeleted: frontmatter.deleted || false,
    };

    if (frontmatter.dueDate) {
      card.dueDate = new Date(frontmatter.dueDate).getTime();
    }

    if (frontmatter.deletedAt) {
      card.deletedAt = new Date(frontmatter.deletedAt).getTime();
    }

    if (frontmatter.pinned) {
      if (frontmatter.pinned === 'true') {
        card.isPinned = true;
      } else {
        card.isPinned = new Date(frontmatter.pinned).getTime();
      }
    }

    return card;
  } catch (error) {
    console.error(`Failed to parse card from ${filename}:`, error);
    return null;
  }
};

const sanitizeFilename = (filename: string): string => {
  return filename
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/^\.+/, '_')
    .substring(0, 200);
};

const getCardFilePath = (card: Card): string => {
  const safeTitle = sanitizeFilename(card.title || 'untitled');
  const filename = `${safeTitle}.md`;
  
  if (!CARDS_FOLDER || CARDS_FOLDER === '') {
    return `/${filename}`;
  }
  
  return `${CARDS_FOLDER}/${filename}`;
};

// --- Dropbox File Operations ---

const ensureFolder = async (token: string, folderPath: string): Promise<void> => {
  if (!folderPath || folderPath === '' || folderPath === '/') {
    return;
  }
  
  try {
    const response = await fetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: folderPath,
        autorename: false,
      }),
    });

    if (!response.ok && response.status !== 409) {
      const errorText = await response.text();
      console.error('Failed to create folder:', errorText);
    }
  } catch (error) {
    console.error('Error creating folder:', error);
  }
};

const encodeDropboxApiArg = (obj: any): string => {
  const json = JSON.stringify(obj);
  const encoder = new TextEncoder();
  const utf8Bytes = encoder.encode(json);
  let result = '';
  for (let i = 0; i < utf8Bytes.length; i++) {
    result += String.fromCharCode(utf8Bytes[i]);
  }
  return result;
};

export const uploadCardToDropbox = async (card: Card): Promise<void> => {
  const token = await getAccessToken();
  if (!token) throw new Error('Unauthorized');

  await ensureFolder(token, CARDS_FOLDER);

  const markdown = cardToMarkdown(card);
  const filePath = getCardFilePath(card);

  const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': encodeDropboxApiArg({
        path: filePath,
        mode: 'overwrite',
        autorename: false,
        mute: true,
      }),
    },
    body: markdown,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Upload error details:', errorText);
    throw new Error(`Failed to upload card ${card.id}: ${errorText}`);
  }
};

export const uploadToDropbox = async (cards: Card[]): Promise<void> => {
  const token = await getAccessToken();
  if (!token) throw new Error('Unauthorized');

  await ensureFolder(token, CARDS_FOLDER);

  const batchSize = 5;
  for (let i = 0; i < cards.length; i += batchSize) {
    const batch = cards.slice(i, i + batchSize);
    await Promise.all(batch.map(card => uploadCardToDropbox(card)));
  }
};

const downloadCardFromDropbox = async (token: string, filePath: string, serverModified?: string): Promise<Card | null> => {
  try {
    const response = await fetch('https://content.dropboxapi.com/2/files/download', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Dropbox-API-Arg': encodeDropboxApiArg({ path: filePath }),
      },
    });

    if (!response.ok) {
      if (response.status === 409) {
        console.log('File not found:', filePath);
        return null;
      }
      const errorText = await response.text();
      console.error('Download error:', errorText);
      throw new Error(`Failed to download ${filePath}`);
    }

    const markdown = await response.text();
    const filename = filePath.split('/').pop() || '';
    
    const dropboxMetadata = response.headers.get('Dropbox-API-Result');
    let fileModifiedTime: number | null = null;
    
    if (dropboxMetadata) {
      try {
        const metadata = JSON.parse(dropboxMetadata);
        if (metadata.server_modified) {
          fileModifiedTime = new Date(metadata.server_modified).getTime();
        }
      } catch (e) {
        console.warn('Failed to parse Dropbox metadata:', e);
      }
    }
    
    if (!fileModifiedTime && serverModified) {
      fileModifiedTime = new Date(serverModified).getTime();
    }
    
    const card = markdownToCard(markdown, filename);
    
    if (card && fileModifiedTime) {
      const frontmatterUpdated = card.updatedAt;
      if (fileModifiedTime > frontmatterUpdated) {
        card.updatedAt = fileModifiedTime;
      }
    }
    
    return card;
  } catch (error) {
    console.error(`Error downloading ${filePath}:`, error);
    return null;
  }
};

export const downloadFromDropbox = async (forceFullSync: boolean = false): Promise<Card[]> => {
  const token = await getAccessToken();
  if (!token) throw new Error('Unauthorized');

  try {
    const folderPath = CARDS_FOLDER || '';
    const savedCursor = await idbStorage.getItem(DROPBOX_CURSOR_KEY);

    // cursorがあり、フルスキャン不要な場合はデルタ取得
    if (savedCursor && !forceFullSync) {
      return await downloadDelta(token, savedCursor);
    }

    // 初回 or フルスキャン: list_folder で全件取得
    console.log('Full scan: list_folder');

    const listResponse = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: folderPath,
        recursive: false,
      }),
    });

    if (!listResponse.ok) {
      if (listResponse.status === 409) {
        console.log('Root directory is empty or inaccessible');
        return [];
      }
      const errorText = await listResponse.text();
      console.error('List folder error:', errorText);
      throw new Error('Failed to list root directory');
    }

    const listData = await listResponse.json();

    // cursor を保存（次回以降のデルタ取得に使う）
    if (listData.cursor) {
      await idbStorage.setItem(DROPBOX_CURSOR_KEY, listData.cursor);
      console.log('Cursor saved');
    }

    const entries = listData.entries || [];
    const markdownFiles = entries.filter((entry: any) =>
      entry['.tag'] === 'file' &&
      entry.name.endsWith('.md')
    );

    const batchSize = 5;
    const cards: Card[] = [];

    for (let i = 0; i < markdownFiles.length; i += batchSize) {
      const batch = markdownFiles.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((file: any) => downloadCardFromDropbox(token, file.path_lower, file.server_modified))
      );
      cards.push(...batchResults.filter((card): card is Card => card !== null));
    }

    return cards;
  } catch (error) {
    console.error('Error downloading from Dropbox:', error);
    throw error;
  }
};

const downloadDelta = async (token: string, cursor: string): Promise<Card[]> => {
  console.log('Delta sync: list_folder/continue');

  const continueResponse = await fetch('https://api.dropboxapi.com/2/files/list_folder/continue', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ cursor }),
  });

  if (!continueResponse.ok) {
    const errorText = await continueResponse.text();
    // cursor が古すぎて無効になった場合はフルスキャンにフォールバック
    if (continueResponse.status === 409) {
      console.warn('Cursor expired, falling back to full scan');
      await idbStorage.removeItem(DROPBOX_CURSOR_KEY);
      return downloadFromDropbox(false);
    }
    throw new Error(`list_folder/continue failed: ${errorText}`);
  }

  const deltaData = await continueResponse.json();

  if (deltaData.cursor) {
    await idbStorage.setItem(DROPBOX_CURSOR_KEY, deltaData.cursor);
  }

  const entries = deltaData.entries || [];
  const changedMarkdownFiles = entries.filter((entry: any) =>
    entry['.tag'] === 'file' &&
    entry.name.endsWith('.md')
  );
  // deleted エントリは今回は無視（ローカルの論理削除フラグで管理しているため）

  if (changedMarkdownFiles.length === 0) {
    console.log('Delta sync: no changes');
    return [];
  }

  console.log(`Delta sync: ${changedMarkdownFiles.length} file(s) changed`);

  const batchSize = 5;
  const cards: Card[] = [];

  for (let i = 0; i < changedMarkdownFiles.length; i += batchSize) {
    const batch = changedMarkdownFiles.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((file: any) => downloadCardFromDropbox(token, file.path_lower, file.server_modified))
    );
    cards.push(...batchResults.filter((card): card is Card => card !== null));
  }

  return cards;
};

export const deleteCardFromDropbox = async (card: Card): Promise<void> => {
  const token = await getAccessToken();
  if (!token) throw new Error('Unauthorized');

  const deletedCard = {
    ...card,
    isDeleted: true,
    deletedAt: card.deletedAt || Date.now(),
    updatedAt: Date.now()
  };

  try {
    await uploadCardToDropbox(deletedCard);
  } catch (error) {
    console.error(`Error marking card ${card.id} as deleted:`, error);
    throw error;
  }
};

export const permanentlyDeleteCardFromDropbox = async (card: Card): Promise<void> => {
  const token = await getAccessToken();
  if (!token) throw new Error('Unauthorized');

  const filePath = getCardFilePath(card);

  try {
    const response = await fetch('https://api.dropboxapi.com/2/files/delete_v2', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: filePath,
      }),
    });

    if (!response.ok && response.status !== 409) {
      const errorText = await response.text();
      console.warn(`Failed to permanently delete card ${card.id}:`, errorText);
    } else {
      console.log('Successfully permanently deleted from Dropbox:', card.title);
    }
  } catch (error) {
    console.error(`Error permanently deleting card ${card.id}:`, error);
  }
};

export const renameCardInDropbox = async (oldCard: Card, newTitle: string): Promise<void> => {
  const token = await getAccessToken();
  if (!token) throw new Error('Unauthorized');

  const oldPath = getCardFilePath(oldCard);
  const newCard = { ...oldCard, title: newTitle };
  const newPath = getCardFilePath(newCard);

  if (oldPath === newPath) {
    return;
  }

  try {
    const response = await fetch('https://api.dropboxapi.com/2/files/move_v2', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from_path: oldPath,
        to_path: newPath,
        autorename: false,
        allow_ownership_transfer: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      if (response.status === 409) {
        console.log('File not found or destination exists, uploading as new file');
        await uploadCardToDropbox(newCard);
        return;
      }
      
      throw new Error(`Failed to rename card: ${errorText}`);
    }
  } catch (error) {
    console.error(`Error renaming card ${oldCard.id}:`, error);
    console.log('Falling back to new file upload');
    await uploadCardToDropbox(newCard);
  }
};

export const resetDropboxCursor = async (): Promise<void> => {
  await idbStorage.removeItem(DROPBOX_CURSOR_KEY);
  console.log('Dropbox cursor reset');
};

export const isAuthenticated = (): boolean => {
  return !!localStorage.getItem('dropbox_refresh_token');
};

export const isAuthenticatedAsync = async (): Promise<boolean> => {
  const refreshToken = await idbStorage.getItem('dropbox_refresh_token');
  return !!refreshToken;
};

export const logout = async () => {
  await idbStorage.removeItem('dropbox_access_token');
  await idbStorage.removeItem('dropbox_refresh_token');
  await idbStorage.removeItem('dropbox_expires_at');
  await idbStorage.removeItem('dropbox_code_verifier');
  await idbStorage.removeItem(DROPBOX_CURSOR_KEY);
};
