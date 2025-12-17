// Dropbox API Utilities with PKCE Flow - Markdown Files Version

import { idbStorage } from './indexedDB';
import { CardType, type Card } from '../types';

const CLIENT_ID = '5hwhw0juzjrs0o0';
const REDIRECT_URI = window.location.origin + window.location.pathname;
const CARDS_FOLDER = '';

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

/**
 * CardオブジェクトをMarkdown形式に変換（YAMLフロントマター付き）
 */
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

/**
 * Markdown形式をCardオブジェクトに変換
 */
const markdownToCard = (markdown: string, filename: string): Card | null => {
  // フロントマターの抽出
  const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!frontmatterMatch) {
    console.warn(`Invalid markdown format in ${filename}`);
    return null;
  }

  const [, frontmatterText, body] = frontmatterMatch;
  const frontmatter: Record<string, any> = {};

  // YAMLパース（簡易版）
  const lines = frontmatterText.split('\n');
  let currentKey: string | null = null;
  let currentArray: string[] | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 配列要素の処理
    if (trimmed.startsWith('- ')) {
      if (currentArray) {
        currentArray.push(trimmed.substring(2));
      }
      continue;
    }

    // キー:値の処理
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
      const key = trimmed.substring(0, colonIndex).trim();
      const value = trimmed.substring(colonIndex + 1).trim();

      if (value === '') {
        // 配列の開始
        currentKey = key;
        currentArray = [];
        frontmatter[key] = currentArray;
      } else {
        // 通常の値
        currentKey = null;
        currentArray = null;
        
        // 値の型変換
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

  // Cardオブジェクトの構築
  try {
    // typeの妥当性チェック
    let cardType: CardType = CardType.Record;
    if (frontmatter.type && Object.values(CardType).includes(frontmatter.type)) {
      cardType = frontmatter.type as CardType;
    }

    const card: Card = {
      id: frontmatter.id || filename.replace('.md', ''),
      type: cardType,
      title: frontmatter.title || 'Untitled',
      body: body.trim(),
      createdAt: frontmatter.created ? new Date(frontmatter.created).getTime() : Date.now(),
      updatedAt: frontmatter.updated ? new Date(frontmatter.updated).getTime() : Date.now(),
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

/**
 * ファイル名をサニタイズ（不正な文字を除去）
 */
const sanitizeFilename = (filename: string): string => {
  return filename
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/^\.+/, '_')
    .substring(0, 200); // 長さ制限
};

/**
 * CardからDropboxファイルパスを生成
 */
const getCardFilePath = (card: Card): string => {
  const safeTitle = sanitizeFilename(card.title || 'untitled');
  const filename = `${safeTitle}.md`;
  
  // CARDS_FOLDERが空の場合はルートディレクトリ
  if (!CARDS_FOLDER || CARDS_FOLDER === '') {
    return `/${filename}`;
  }
  
  return `${CARDS_FOLDER}/${filename}`;
};

// --- Dropbox File Operations ---

/**
 * フォルダを作成（存在しない場合）
 */
const ensureFolder = async (token: string, folderPath: string): Promise<void> => {
  // ルートディレクトリの場合はフォルダ作成不要
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
      // 409 = already exists は無視
      const errorText = await response.text();
      console.error('Failed to create folder:', errorText);
    }
  } catch (error) {
    console.error('Error creating folder:', error);
  }
};

/**
 * 単一カードをDropboxにアップロード
 */
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
      'Dropbox-API-Arg': JSON.stringify({
        path: filePath,
        mode: 'overwrite', // 'add' に変更すると重複時にエラー、'autorename: true' で自動リネーム
        autorename: false,
        mute: true,
      }),
    },
    body: markdown,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to upload card ${card.id}: ${errorText}`);
  }
};

/**
 * 複数カードをDropboxにアップロード（バッチ処理）
 */
export const uploadToDropbox = async (cards: Card[]): Promise<void> => {
  const token = await getAccessToken();
  if (!token) throw new Error('Unauthorized');

  await ensureFolder(token, CARDS_FOLDER);

  // 並列アップロード（最大5件同時）
  const batchSize = 5;
  for (let i = 0; i < cards.length; i += batchSize) {
    const batch = cards.slice(i, i + batchSize);
    await Promise.all(batch.map(card => uploadCardToDropbox(card)));
  }
};

/**
 * Dropboxからカードをダウンロード
 */
const downloadCardFromDropbox = async (token: string, filePath: string): Promise<Card | null> => {
  try {
    const response = await fetch('https://content.dropboxapi.com/2/files/download', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Dropbox-API-Arg': JSON.stringify({
          path: filePath,
        }),
      },
    });

    if (!response.ok) {
      if (response.status === 409) {
        return null; // ファイルが存在しない
      }
      throw new Error(`Failed to download ${filePath}`);
    }

    const markdown = await response.text();
    const filename = filePath.split('/').pop() || '';
    return markdownToCard(markdown, filename);
  } catch (error) {
    console.error(`Error downloading ${filePath}:`, error);
    return null;
  }
};

/**
 * Dropboxフォルダ内のすべてのカードをダウンロード
 */
export const downloadFromDropbox = async (): Promise<Card[]> => {
  const token = await getAccessToken();
  if (!token) throw new Error('Unauthorized');

  try {
    console.log('Downloading from Dropbox...'); // デバッグログ
    
    // 空文字列の場合はルートディレクトリを指定
    const folderPath = CARDS_FOLDER || '';
    
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

    console.log('List response status:', listResponse.status); // デバッグログ

    if (!listResponse.ok) {
      if (listResponse.status === 409) {
        console.log('Root directory is empty or inaccessible');
        return [];
      }
      const errorText = await listResponse.text();
      console.error('List folder error:', errorText); // デバッグログ
      throw new Error('Failed to list root directory');
    }

    const listData = await listResponse.json();
    const entries = listData.entries || [];
    
    console.log('Found entries:', entries.length); // デバッグログ

    // Markdownファイルのみをフィルタ
    const markdownFiles = entries.filter((entry: any) => 
      entry['.tag'] === 'file' && 
      entry.name.endsWith('.md')
    );
    
    console.log('Markdown files found:', markdownFiles.length); // デバッグログ
    console.log('Files:', markdownFiles.map((f: any) => f.name)); // デバッグログ

    // 各ファイルをダウンロード（並列処理）
    const batchSize = 5;
    const cards: Card[] = [];

    for (let i = 0; i < markdownFiles.length; i += batchSize) {
      const batch = markdownFiles.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((file: any) => downloadCardFromDropbox(token, file.path_lower))
      );
      
      cards.push(...batchResults.filter((card): card is Card => card !== null));
    }

    console.log('Downloaded cards:', cards.length); // デバッグログ
    return cards;
  } catch (error) {
    console.error('Error downloading from Dropbox:', error);
    throw error;
  }
};

/**
 * Dropboxからカードを削除
 */
export const deleteCardFromDropbox = async (card: Card): Promise<void> => {
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
      // 409 = file not found は無視
      const errorText = await response.text();
      console.warn(`Failed to delete card ${card.id}:`, errorText);
    }
  } catch (error) {
    console.error(`Error deleting card ${card.id}:`, error);
  }
};

export const isAuthenticated = (): boolean => {
  // 同期的にチェック（localStorage経由で確認）
  return !!localStorage.getItem('dropbox_refresh_token');
};

// 非同期版も残す
export const isAuthenticatedAsync = async (): Promise<boolean> => {
  const refreshToken = await idbStorage.getItem('dropbox_refresh_token');
  return !!refreshToken;
};

export const logout = async () => {
  await idbStorage.removeItem('dropbox_access_token');
  await idbStorage.removeItem('dropbox_refresh_token');
  await idbStorage.removeItem('dropbox_expires_at');
  await idbStorage.removeItem('dropbox_code_verifier');
};