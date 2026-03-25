import React, { useState, useEffect, useRef } from 'react';
import { Send, ArrowLeft, MessageCircle, Clock, Check, CheckCheck, Search, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getUserMessages, sendMessage, getUnreadMessageCount, markMessageAsRead, MessageWithSender } from '../../services/DataService';
import { useAppStore } from '../../store/useAppStore';

interface TeacherMessagesProps {
    onBack: () => void;
}

const TeacherMessages: React.FC<TeacherMessagesProps> = ({ onBack }) => {
    const { userProfile } = useAppStore();
    const [messages, setMessages] = useState<MessageWithSender[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        loadMessages();
        loadUnreadCount();
    }, [userProfile?.id]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const loadMessages = async () => {
        if (!userProfile?.id) return;

        try {
            setLoading(true);
            const userMessages = await getUserMessages(userProfile.id);
            setMessages(userMessages);

            // Mark unread messages as read
            const unreadMessages = userMessages.filter(m => !m.read && m.receiver_id === userProfile.id);
            for (const msg of unreadMessages) {
                await markMessageAsRead(msg.id);
            }
        } catch (error) {
            console.error('Error loading messages:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadUnreadCount = async () => {
        if (!userProfile?.id) return;

        try {
            const count = await getUnreadMessageCount(userProfile.id);
            setUnreadCount(count);
        } catch (error) {
            console.error('Error loading unread count:', error);
        }
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const handleSendMessage = async () => {
        if (!newMessage.trim() || !userProfile?.id || sending || !selectedConversation) return;

        try {
            setSending(true);
            await sendMessage(userProfile.id, selectedConversation, newMessage.trim());
            setNewMessage('');
            await loadMessages();
        } catch (error) {
            console.error('Error sending message:', error);
        } finally {
            setSending(false);
        }
    };

    const formatTime = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (diffDays === 1) {
            return 'Yesterday';
        } else if (diffDays < 7) {
            return date.toLocaleDateString([], { weekday: 'short' });
        } else {
            return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
    };

    // Group messages by conversation
    const conversations = messages.reduce((acc, message) => {
        const otherId = message.sender_id === userProfile?.id ? message.receiver_id : message.sender_id;
        const otherName = message.sender_id === userProfile?.id ? message.receiver_name : message.sender_name;
        const otherAvatar = message.sender_id === userProfile?.id ? message.receiver_avatar : message.sender_avatar;

        if (!acc[otherId]) {
            acc[otherId] = {
                id: otherId,
                name: otherName || 'Unknown',
                avatar: otherAvatar,
                messages: [],
                unreadCount: 0,
                lastMessage: message
            };
        }

        acc[otherId].messages.push(message);

        if (!message.read && message.receiver_id === userProfile?.id) {
            acc[otherId].unreadCount++;
        }

        if (new Date(message.created_at) > new Date(acc[otherId].lastMessage.created_at)) {
            acc[otherId].lastMessage = message;
        }

        return acc;
    }, {} as Record<string, { id: string; name: string; avatar?: string; messages: MessageWithSender[]; unreadCount: number; lastMessage: MessageWithSender }>);

    const conversationList = Object.values(conversations).sort((a, b) =>
        new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime()
    );

    const filteredConversations = conversationList.filter(conv =>
        conv.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const selectedMessages = selectedConversation
        ? conversations[selectedConversation]?.messages || []
        : [];

    return (
        <div className="flex-1 flex flex-col bg-slate-50">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
                <button
                    onClick={onBack}
                    className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                    <ArrowLeft size={20} className="text-slate-600" />
                </button>
                <div className="flex-1">
                    <h1 className="font-bold text-slate-800">Messages</h1>
                    <p className="text-xs text-slate-500">Parent communications</p>
                </div>
                {unreadCount > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                        {unreadCount}
                    </span>
                )}
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Conversations List */}
                <div className="w-80 border-r border-slate-200 bg-white flex flex-col">
                    {/* Search */}
                    <div className="p-3 border-b border-slate-100">
                        <div className="relative">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search parents..."
                                className="w-full pl-9 pr-4 py-2 bg-slate-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                        </div>
                    </div>

                    {/* Conversation List */}
                    <div className="flex-1 overflow-y-auto">
                        {loading ? (
                            <div className="flex items-center justify-center h-full">
                                <div className="text-slate-500">Loading...</div>
                            </div>
                        ) : filteredConversations.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center p-4">
                                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-3">
                                    <MessageCircle size={24} className="text-slate-400" />
                                </div>
                                <p className="text-slate-500 text-sm">No conversations yet</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {filteredConversations.map((conv) => (
                                    <button
                                        key={conv.id}
                                        onClick={() => setSelectedConversation(conv.id)}
                                        className={`w-full p-3 flex items-center gap-3 hover:bg-slate-50 transition-colors ${selectedConversation === conv.id ? 'bg-emerald-50' : ''
                                            }`}
                                    >
                                        <div className="relative">
                                            <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden">
                                                <img
                                                    src={conv.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${conv.name}`}
                                                    alt={conv.name}
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                            {conv.unreadCount > 0 && (
                                                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                                                    {conv.unreadCount}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0 text-left">
                                            <div className="flex items-center justify-between">
                                                <span className="font-medium text-slate-800 text-sm truncate">{conv.name}</span>
                                                <span className="text-xs text-slate-400">{formatTime(conv.lastMessage.created_at)}</span>
                                            </div>
                                            <p className="text-xs text-slate-500 truncate mt-0.5">
                                                {conv.lastMessage.sender_id === userProfile?.id ? 'You: ' : ''}
                                                {conv.lastMessage.content}
                                            </p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Message Thread */}
                <div className="flex-1 flex flex-col bg-slate-50">
                    {selectedConversation ? (
                        <>
                            {/* Thread Header */}
                            <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden">
                                    <img
                                        src={conversations[selectedConversation]?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${conversations[selectedConversation]?.name}`}
                                        alt={conversations[selectedConversation]?.name}
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                                <div>
                                    <h2 className="font-bold text-slate-800">{conversations[selectedConversation]?.name}</h2>
                                    <p className="text-xs text-slate-500">Parent</p>
                                </div>
                            </div>

                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                <AnimatePresence>
                                    {selectedMessages.map((message, index) => {
                                        const isOwn = message.sender_id === userProfile?.id;
                                        const showAvatar = index === 0 || selectedMessages[index - 1].sender_id !== message.sender_id;

                                        return (
                                            <motion.div
                                                key={message.id}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: index * 0.05 }}
                                                className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                                            >
                                                <div className={`flex gap-2 max-w-[80%] ${isOwn ? 'flex-row-reverse' : ''}`}>
                                                    {showAvatar && !isOwn && (
                                                        <div className="w-8 h-8 rounded-full bg-slate-200 flex-shrink-0 overflow-hidden">
                                                            <img
                                                                src={message.sender_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${message.sender_name}`}
                                                                alt={message.sender_name}
                                                                className="w-full h-full object-cover"
                                                            />
                                                        </div>
                                                    )}
                                                    {!showAvatar && !isOwn && <div className="w-8" />}

                                                    <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                                                        {showAvatar && !isOwn && (
                                                            <span className="text-xs text-slate-500 mb-1 ml-1">{message.sender_name}</span>
                                                        )}
                                                        <div
                                                            className={`px-4 py-2 rounded-2xl ${isOwn
                                                                    ? 'bg-emerald-500 text-white rounded-br-md'
                                                                    : 'bg-white text-slate-800 rounded-bl-md shadow-sm border border-slate-100'
                                                                }`}
                                                        >
                                                            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                                                        </div>
                                                        <div className={`flex items-center gap-1 mt-1 ${isOwn ? 'flex-row-reverse' : ''}`}>
                                                            <Clock size={10} className="text-slate-400" />
                                                            <span className="text-xs text-slate-400">{formatTime(message.created_at)}</span>
                                                            {isOwn && (
                                                                message.read ? (
                                                                    <CheckCheck size={12} className="text-emerald-500" />
                                                                ) : (
                                                                    <Check size={12} className="text-slate-400" />
                                                                )
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </AnimatePresence>
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Message Input */}
                            <div className="bg-white border-t border-slate-200 p-4">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={newMessage}
                                        onChange={(e) => setNewMessage(e.target.value)}
                                        onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                                        placeholder="Type a message..."
                                        className="flex-1 px-4 py-2 bg-slate-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                    />
                                    <button
                                        onClick={handleSendMessage}
                                        disabled={!newMessage.trim() || sending}
                                        className="p-2 bg-emerald-500 text-white rounded-full hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <Send size={20} />
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                                <User size={40} className="text-slate-400" />
                            </div>
                            <h3 className="font-bold text-slate-800 mb-2">Select a conversation</h3>
                            <p className="text-slate-500 text-sm">Choose a parent from the list to view messages</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TeacherMessages;
