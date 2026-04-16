import React, { useState, useEffect, useRef } from 'react';
import { Send, ArrowLeft, MessageCircle, Clock, Check, CheckCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getUserMessages, sendMessage, getUnreadMessageCount, markMessageAsRead, MessageWithSender, getParentStudents, getTeacherForStudent } from '../../services/DataService';
import { useAppStore } from '../../store/useAppStore';

interface ParentMessagesProps {
    onBack: () => void;
}

const ParentMessages: React.FC<ParentMessagesProps> = ({ onBack }) => {
    const { userProfile } = useAppStore();
    const [messages, setMessages] = useState<MessageWithSender[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [teacherId, setTeacherId] = useState<string | null>(null);
    const [teacherName, setTeacherName] = useState<string>('Teacher');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        loadMessages();
        loadUnreadCount();
        loadTeacher();
    }, [userProfile?.id]);

    const loadTeacher = async () => {
        if (!userProfile?.id) return;
        try {
            const students = await getParentStudents(userProfile.id);
            if (students.length > 0) {
                const teacher = await getTeacherForStudent(students[0].student_id);
                if (teacher) {
                    setTeacherId(teacher.id);
                    setTeacherName(teacher.full_name || 'Teacher');
                }
            }
        } catch (err) {
            console.error('Error loading teacher:', err);
        }
    };

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
        if (!newMessage.trim() || !userProfile?.id || sending) return;

        try {
            setSending(true);
            const recipientId = teacherId || 'unknown';
            if (recipientId === 'unknown') {
                return;
            }

            await sendMessage(userProfile.id, recipientId, newMessage.trim());
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
                    <p className="text-xs text-slate-500">Chat with {teacherName}</p>
                </div>
                {unreadCount > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                        {unreadCount}
                    </span>
                )}
            </div>

            {/* Messages List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-slate-500">Loading messages...</div>
                    </div>
                ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                            <MessageCircle size={32} className="text-slate-400" />
                        </div>
                        <h3 className="font-bold text-slate-800 mb-2">No messages yet</h3>
                        <p className="text-slate-500 text-sm">Start a conversation with your child's teacher</p>
                    </div>
                ) : (
                    <AnimatePresence>
                        {messages.map((message, index) => {
                            const isOwn = message.sender_id === userProfile?.id;
                            const showAvatar = index === 0 || messages[index - 1].sender_id !== message.sender_id;

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
                                                        ? 'bg-cyan-500 text-white rounded-br-md'
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
                                                        <CheckCheck size={12} className="text-cyan-500" />
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
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="bg-white border-t border-slate-200 p-4 sticky bottom-0">
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                        placeholder="Type a message..."
                        className="flex-1 px-4 py-2 bg-slate-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                    <button
                        onClick={handleSendMessage}
                        disabled={!newMessage.trim() || sending}
                        className="p-2 bg-cyan-500 text-white rounded-full hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <Send size={20} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ParentMessages;
