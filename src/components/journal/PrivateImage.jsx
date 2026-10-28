import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const cache = new Map(); // file_uri -> { url, until }

async function signedUrl(fileUri) {
  const hit = cache.get(fileUri);
  if (hit && hit.until > Date.now()) return hit.url;
  const res = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: fileUri, expires_in: 3600 });
  const url = res?.signed_url || null;
  if (url) cache.set(fileUri, { url, until: Date.now() + 50 * 60 * 1000 });
  return url;
}

/** Journal photos live in private storage, so each needs a short-lived signed URL. */
export default function PrivateImage({ fileUri, className = '', alt = 'Photo', onClick }) {
  const [url, setUrl] = useState(cache.get(fileUri)?.url || null);
  useEffect(() => {
    let active = true;
    signedUrl(fileUri).then((u) => { if (active) setUrl(u); }).catch(() => {});
    return () => { active = false; };
  }, [fileUri]);
  if (!url) return <div className={`flex items-center justify-center bg-muted ${className}`}><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>;
  return <img src={url} alt={alt} className={className} onClick={onClick} loading="lazy" />;
}
