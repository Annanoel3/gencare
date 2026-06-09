import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { MessageCircle, Send, Pin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { format, parseISO } from 'date-fns';
import { motion } from 'framer-motion';

const categoryColors = {
  Update: 'bg-blue-500/10 text-blue-600', Announcement: 'bg-purple-500/10 text-purple-600',
  Question: 'bg-amber-500/10 text-amber-600', 'Care Update': 'bg-emerald-500/10 text-emerald-600',
  Photo: 'bg-pink-500/10 text-pink-600', General: 'bg-gray-500/10 text-gray-600',
};

export default function Messages() {
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('General');
  const [user, setUser] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);

  const { data: messages = [] } = useQuery({
    queryKey: ['familyMessages'],
    queryFn: () => base44.entities.FamilyMessage.list('-created_date', 50),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.FamilyMessage.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['familyMessages'] });
      setContent('');
      setCategory('General');
    },
  });

  const togglePinMutation = useMutation({
    mutationFn: ({ id, is_pinned }) => base44.entities.FamilyMessage.update(id, { is_pinned: !is_pinned }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['familyMessages'] }),
  });

  const handleSend = () => {
    if (!content.trim()) return;
    createMutation.mutate({ content, category, author_name: user?.full_name || 'Me' });
  };

  const pinned = messages.filter(m => m.is_pinned);
  const regular = messages.filter(m => !m.is_pinned);

  return (
    <div className="pb-24 lg:pb-8">
      <div className="mb-8">
        <h1 className="font-heading text-2xl md:text-3xl font-bold flex items-center gap-3">
          <MessageCircle className="w-7 h-7 text-primary" />
          Family Feed
        </h1>
        <p className="text-muted-foreground mt-1">Share updates, announcements, and care notes with your family.</p>
      </div>

      {/* Compose */}
      <div className="bg-card rounded-2xl border border-border/50 p-4 md:p-5 mb-6">
        <Textarea
          placeholder="Share an update with your family..."
          value={content}
          onChange={e => setContent(e.target.value)}
          className="min-h-[80px] mb-3 border-0 resize-none focus-visible:ring-0 p-0 text-base"
        />
        <div className="flex items-center justify-between">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-40 rounded-lg"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.keys(categoryColors).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={handleSend} disabled={!content.trim() || createMutation.isPending} className="rounded-xl gap-2">
            <Send className="w-4 h-4" /> Post
          </Button>
        </div>
      </div>

      {/* Pinned */}
      {pinned.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Pin className="w-3 h-3" /> Pinned
          </h2>
          <div className="space-y-3">
            {pinned.map((msg, i) => (
              <MessageCard key={msg.id} msg={msg} i={i} onTogglePin={() => togglePinMutation.mutate({ id: msg.id, is_pinned: msg.is_pinned })} />
            ))}
          </div>
        </div>
      )}

      {/* Feed */}
      <div className="space-y-3">
        {regular.map((msg, i) => (
          <MessageCard key={msg.id} msg={msg} i={i} onTogglePin={() => togglePinMutation.mutate({ id: msg.id, is_pinned: msg.is_pinned })} />
        ))}
      </div>

      {messages.length === 0 && (
        <div className="text-center py-20">
          <MessageCircle className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
          <h2 className="font-heading text-xl font-semibold mb-2">No messages yet</h2>
          <p className="text-muted-foreground">Post the first update for your family.</p>
        </div>
      )}
    </div>
  );
}

function MessageCard({ msg, i, onTogglePin }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
      <div className="bg-card rounded-2xl border border-border/50 p-4 md:p-5">
        <div className="flex items-start gap-3">
          <Avatar className="w-9 h-9 flex-shrink-0">
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
              {msg.author_name?.charAt(0) || '?'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-sm">{msg.author_name || 'Unknown'}</span>
              <Badge variant="secondary" className={`text-xs ${categoryColors[msg.category] || ''}`}>{msg.category}</Badge>
              {msg.family_member_name && <Badge variant="outline" className="text-xs">{msg.family_member_name}</Badge>}
            </div>
            <p className="text-sm text-foreground whitespace-pre-wrap">{msg.content}</p>
            <div className="flex items-center gap-3 mt-3">
              <span className="text-xs text-muted-foreground">
                {msg.created_date ? format(parseISO(msg.created_date), 'MMM d, h:mm a') : ''}
              </span>
              <button onClick={onTogglePin} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                <Pin className="w-3 h-3" /> {msg.is_pinned ? 'Unpin' : 'Pin'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}