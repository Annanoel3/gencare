import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { MessageCircle, Send, Pin, ImagePlus, Loader2, X, RefreshCw, Reply, Trash2, Pencil, Check, ClipboardList } from 'lucide-react';
import { format, parseISO, isValid, isToday } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { useFamily } from '@/lib/family';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from '@/components/ui/use-toast';
import { getMemberColorByMemberId, getMemberLightColorByMemberId } from '@/utils/memberColors';
import PrivateImage from '@/components/journal/PrivateImage';
import { uploadPhoto } from '@/lib/journal';
import { CATEGORIES, categoryColor, MESSAGES_KEY, listMessages, postMessage, editMessage, deleteMessage, togglePin, markMessagesSeen } from '@/lib/messages';

const NOBODY = '__nobody__';

/**
 * The family feed: updates, announcements, care updates, visit summaries,
 * photos and task discussions. Posts can be about a person (tinted their
 * color), get replies, and the author can edit or delete their own.
 */
export default function Messages() {
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('General');
  const [aboutId, setAboutId] = useState('');
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [viewing, setViewing] = useState(null);
  const fileRef = useRef(null);
  const queryClient = useQueryClient();
  const { me, family, apply } = useFamily();

  const { data: messages = [], isFetching, refetch } = useQuery({ queryKey: MESSAGES_KEY, queryFn: listMessages, refetchInterval: 30_000 });
  const { data: members = [] } = useQuery({ queryKey: ['familyMembers'], queryFn: () => base44.entities.FamilyMember.list() });

  // Opening the page clears the unread badge.
  useEffect(() => {
    if (!me) return;
    markMessagesSeen(me, queryClient);
    if (family) apply({ family, me: { ...me, messages_seen_at: new Date().toISOString() } });
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => queryClient.invalidateQueries({ queryKey: MESSAGES_KEY });
  const post = useMutation({
    mutationFn: () => postMessage({ content, category, member: members.find((m) => m.id === aboutId), photos, parentId: replyTo?.id }, me),
    onSuccess: () => { refresh(); setContent(''); setCategory('General'); setAboutId(''); setPhotos([]); setReplyTo(null); },
    onError: (e) => toast({ title: "Couldn't post", description: e?.message || 'Try again', variant: 'destructive' }),
  });
  const pin = useMutation({ mutationFn: togglePin, onSuccess: refresh });
  const remove = useMutation({ mutationFn: (msg) => deleteMessage(msg, messages), onSuccess: refresh });
  const edit = useMutation({ mutationFn: ({ id, text }) => editMessage(id, text), onSuccess: refresh });

  const pickFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setUploading(true);
    try {
      const uris = [];
      for (const f of files.slice(0, 6)) { const u = await uploadPhoto(f); if (u) uris.push(u); }
      setPhotos((p) => [...p, ...uris]);
      if (category === 'General') setCategory('Photo');
    } catch (err) { toast({ title: "Couldn't add the photo", description: err?.message, variant: 'destructive' }); }
    finally { setUploading(false); }
  };

  const { pinned, posts, repliesOf } = useMemo(() => {
    const top = messages.filter((m) => !m.parent_id);
    const map = {};
    for (const m of messages) if (m.parent_id) (map[m.parent_id] ||= []).push(m);
    for (const k of Object.keys(map)) map[k].sort((a, b) => (a.created_date || '').localeCompare(b.created_date || ''));
    return { pinned: top.filter((m) => m.is_pinned), posts: top.filter((m) => !m.is_pinned), repliesOf: (id) => map[id] || [] };
  }, [messages]);

  const canPost = content.trim().length > 0 && !post.isPending && !uploading;

  return (
    <div className="pb-24 lg:pb-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3"><MessageCircle className="w-7 h-7 text-primary" /> Family Feed</h1>
          <p className="text-muted-foreground mt-1">Updates, announcements, visit summaries, photos — everyone sees them.</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => refetch()} aria-label="Refresh" className="rounded-full"><RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} /></Button>
      </div>

      {/* Compose */}
      <div className="bg-card rounded-2xl border border-border/50 p-4 md:p-5 mb-6">
        {replyTo && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2 rounded-lg bg-muted/60 px-3 py-1.5">
            <Reply className="w-3.5 h-3.5" /> Replying to {replyTo.author_name?.split(' ')[0]}: <span className="truncate flex-1">{replyTo.content}</span>
            <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}
        <Textarea
          placeholder={replyTo ? 'Write your reply…' : 'Share an update with your family…'}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="min-h-[80px] mb-3 border-0 resize-none focus-visible:ring-0 p-0 text-base"
        />
        {photos.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {photos.map((uri) => (
              <div key={uri} className="relative">
                <PrivateImage fileUri={uri} className="w-20 h-20 rounded-lg object-cover border border-border" />
                <button type="button" onClick={() => setPhotos((p) => p.filter((u) => u !== uri))} aria-label="Remove photo" className="absolute -top-1.5 -right-1.5 bg-foreground text-background rounded-full p-0.5"><X className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {!replyTo && (
            <>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-[150px] h-9 rounded-lg text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.value}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={aboutId || NOBODY} onValueChange={(v) => setAboutId(v === NOBODY ? '' : v)}>
                <SelectTrigger className="w-[150px] h-9 rounded-lg text-xs"><SelectValue placeholder="About…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NOBODY}>Not about anyone</SelectItem>
                  {members.map((m) => <SelectItem key={m.id} value={m.id}>About {m.name.split(' ')[0]}</SelectItem>)}
                </SelectContent>
              </Select>
            </>
          )}
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={pickFiles} />
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading} className="h-9 gap-1.5" aria-label="Add photo">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}<span className="hidden sm:inline">Photo</span>
          </Button>
          <div className="flex-1" />
          <Button onClick={() => post.mutate()} disabled={!canPost} className="rounded-xl gap-2 h-9"><Send className="w-4 h-4" /> {replyTo ? 'Reply' : 'Post'}</Button>
        </div>
      </div>

      {pinned.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2"><Pin className="w-3 h-3" /> Pinned</h2>
          <div className="space-y-3">
            {pinned.map((msg) => <Post key={msg.id} msg={msg} replies={repliesOf(msg.id)} me={me} members={members} onPin={() => pin.mutate(msg)} onReply={() => { setReplyTo(msg); window.scrollTo({ top: 0, behavior: 'smooth' }); }} onDelete={(m) => remove.mutate(m)} onEdit={(id, text) => edit.mutate({ id, text })} onView={setViewing} />)}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {posts.map((msg) => <Post key={msg.id} msg={msg} replies={repliesOf(msg.id)} me={me} members={members} onPin={() => pin.mutate(msg)} onReply={() => { setReplyTo(msg); window.scrollTo({ top: 0, behavior: 'smooth' }); }} onDelete={(m) => remove.mutate(m)} onEdit={(id, text) => edit.mutate({ id, text })} onView={setViewing} />)}
      </div>

      {messages.length === 0 && (
        <div className="text-center py-20">
          <MessageCircle className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
          <h2 className="font-heading text-xl font-semibold mb-2">No posts yet</h2>
          <p className="text-muted-foreground">Post the first update for your family.</p>
        </div>
      )}

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-3xl p-2 bg-black/90 border-0">
          {viewing && <PrivateImage fileUri={viewing} className="max-h-[85vh] w-auto mx-auto rounded-lg object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function when(d) {
  const t = d ? parseISO(d) : null;
  if (!t || !isValid(t)) return '';
  return isToday(t) ? format(t, 'h:mm a') : format(t, 'MMM d, h:mm a');
}

function Post({ msg, replies, me, members, onPin, onReply, onDelete, onEdit, onView }) {
  const mine = me && msg.author_user_id === me.id;
  const tint = msg.family_member_id ? getMemberLightColorByMemberId(msg.family_member_id, members) : 'bg-card';
  const dot = msg.family_member_id ? getMemberColorByMemberId(msg.family_member_id, members) : null;
  const photos = Array.isArray(msg.photos) && msg.photos.length ? msg.photos : (msg.photo_url ? [msg.photo_url] : []);
  return (
    <div className={`rounded-2xl border border-border/50 p-4 md:p-5 ${tint}`}>
      <div className="flex items-start gap-3">
        <Avatar className="w-9 h-9 flex-shrink-0"><AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">{msg.author_name?.charAt(0) || '?'}</AvatarFallback></Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-sm">{msg.author_name || 'Someone'}</span>
            <Badge variant="secondary" className={`text-xs ${categoryColor(msg.category)}`}>{msg.category}</Badge>
            {msg.family_member_name && <Badge variant="outline" className="text-xs gap-1">{dot && <span className={`w-2 h-2 rounded-full ${dot}`} />}{msg.family_member_name}</Badge>}
            {msg.task_id && <Link to="/tasks" className="text-xs text-primary inline-flex items-center gap-1"><ClipboardList className="w-3 h-3" /> task</Link>}
          </div>
          <Body msg={msg} mine={mine} onEdit={onEdit} />
          {photos.length > 0 && (
            <div className="flex gap-2 mt-2 overflow-x-auto">
              {photos.map((u) => <PrivateImage key={u} fileUri={u} className="w-28 h-28 rounded-lg object-cover border border-border/60 flex-shrink-0 cursor-zoom-in" onClick={() => onView(u)} />)}
            </div>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span>{when(msg.created_date)}{msg.edited_at ? ' · edited' : ''}</span>
            <button type="button" onClick={onReply} className="hover:text-foreground inline-flex items-center gap-1"><Reply className="w-3 h-3" /> Reply</button>
            <button type="button" onClick={onPin} className="hover:text-foreground inline-flex items-center gap-1"><Pin className="w-3 h-3" /> {msg.is_pinned ? 'Unpin' : 'Pin'}</button>
            {mine && <DeleteButton onConfirm={() => onDelete(msg)} replies={replies.length} />}
          </div>
          {replies.length > 0 && (
            <div className="mt-3 space-y-2 border-l-2 border-border/60 pl-3">
              {replies.map((r) => <ReplyRow key={r.id} msg={r} me={me} onDelete={onDelete} onEdit={onEdit} onView={onView} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReplyRow({ msg, me, onDelete, onEdit, onView }) {
  const mine = me && msg.author_user_id === me.id;
  const photos = Array.isArray(msg.photos) ? msg.photos : [];
  return (
    <div>
      <p className="text-xs"><span className="font-semibold">{msg.author_name?.split(' ')[0] || 'Someone'}</span> <span className="text-muted-foreground">· {when(msg.created_date)}{msg.edited_at ? ' · edited' : ''}</span></p>
      <Body msg={msg} mine={mine} onEdit={onEdit} small />
      {photos.length > 0 && <div className="flex gap-2 mt-1">{photos.map((u) => <PrivateImage key={u} fileUri={u} className="w-16 h-16 rounded-md object-cover border border-border/60 cursor-zoom-in" onClick={() => onView(u)} />)}</div>}
      {mine && <div className="text-xs text-muted-foreground mt-0.5"><DeleteButton onConfirm={() => onDelete(msg)} replies={0} /></div>}
    </div>
  );
}

function Body({ msg, mine, onEdit, small }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(msg.content || '');
  if (editing) {
    return (
      <div className="mt-1">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[60px] text-sm" autoFocus />
        <div className="flex gap-2 mt-1">
          <Button size="sm" variant="outline" onClick={() => { setEditing(false); setText(msg.content || ''); }}>Cancel</Button>
          <Button size="sm" onClick={() => { onEdit(msg.id, text); setEditing(false); }} disabled={!text.trim()} className="gap-1"><Check className="w-3.5 h-3.5" /> Save</Button>
        </div>
      </div>
    );
  }
  return (
    <p className={`${small ? 'text-sm' : 'text-sm'} whitespace-pre-wrap group`}>
      {msg.content}
      {mine && <button type="button" onClick={() => setEditing(true)} aria-label="Edit" className="ml-2 align-middle text-muted-foreground opacity-60 hover:opacity-100"><Pencil className="w-3 h-3 inline" /></button>}
    </p>
  );
}

function DeleteButton({ onConfirm, replies }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="hover:text-destructive inline-flex items-center gap-1"><Trash2 className="w-3 h-3" /> Delete</button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>{replies > 0 ? `Its ${replies} ${replies === 1 ? 'reply goes' : 'replies go'} too. ` : ''}Everyone in the family loses it. This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={onConfirm}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
