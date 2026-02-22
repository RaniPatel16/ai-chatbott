import { useState, useRef, useEffect } from 'react';
import './App.css';
import { Send, Bot, User, Sparkles, MessageSquare, Settings, Menu, Plus, BookOpen, Edit2, Trash2, Copy, Check } from 'lucide-react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/atom-one-dark.css';

const CodeBlock = ({ inline, className, children, ...props }) => {
  const match = /language-(\w+)/.exec(className || '');
  const codeString = String(children).replace(/\n$/, '');
  const [copied, setCopied] = useState(false);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(codeString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!inline && match) {
    return (
      <div style={{ position: 'relative', marginTop: '1rem' }}>
        <button
          onClick={handleCopyCode}
          style={{
            position: 'absolute', top: '8px', right: '8px',
            background: 'rgba(255,255,255,0.15)', border: 'none',
            color: copied ? '#10b981' : '#f8fafc',
            borderRadius: '4px', padding: '4px 8px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', zIndex: 10,
            fontSize: '11px', gap: '4px', backdropFilter: 'blur(4px)'
          }}
          title="Copy code"
        >
          {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy code</>}
        </button>
        <code className={className} {...props}>
          {children}
        </code>
      </div>
    );
  }
  return <code className={className} {...props}>{children}</code>;
};

function App() {
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: 'ai',
      text: 'Hello! I am Study Bot, your AI academic assistant. What topic should we dive into today?',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [currentSessionId, setCurrentSessionId] = useState(Date.now().toString());
  const [sessions, setSessions] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [copiedId, setCopiedId] = useState(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  useEffect(() => {
    axios.get('http://localhost:8000/api/sessions')
      .then(res => {
        if (res.data.sessions && res.data.sessions.length > 0) {
          setSessions(res.data.sessions);
          // Auto load latest session if available
          loadSession(res.data.sessions[0]);
        }
      })
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createNewSession = () => {
    const newId = Date.now().toString();
    setCurrentSessionId(newId);
    setMessages([{
      id: 1,
      role: 'ai',
      text: 'Hello! I am Study Bot, your AI academic assistant. What topic should we dive into today?',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }]);
    setSessions(prev => [{ id: newId, name: `Session ${new Date(parseInt(newId)).toLocaleDateString([], { month: 'short', day: 'numeric' })}` }, ...prev]);
    if (window.innerWidth <= 768) setSidebarOpen(false);
  };

  const handleRenameSession = async (e, id) => {
    e.stopPropagation();
    const newName = prompt("Enter new name for this session:");
    if (!newName || !newName.trim()) return;
    try {
      await axios.put(`http://localhost:8000/api/sessions/${id}/rename`, { name: newName });
      setSessions(prev => prev.map(s => s.id === id ? { ...s, name: newName } : s));
    } catch (err) {
      console.error(err);
      alert("Failed to rename session");
    }
  };

  const handleDeleteSession = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this specific chat session?")) return;
    try {
      await axios.delete(`http://localhost:8000/api/sessions/${id}`);
      setSessions(prev => {
        const remaining = prev.filter(s => s.id !== id);
        if (remaining.length === 0) {
          createNewSession();
        } else if (currentSessionId === id) {
          loadSession(remaining[0].id);
        }
        return remaining;
      });
    } catch (err) {
      console.error(err);
      alert("Failed to delete session");
    }
  };

  const loadSession = async (id) => {
    setCurrentSessionId(id);
    try {
      const response = await axios.get(`http://localhost:8000/api/history/${id}`);
      if (response.data.messages && response.data.messages.length > 0) {
        setMessages(response.data.messages.map((m, i) => ({
          id: i + 1,
          role: m.role === 'model' || m.role === 'ai' ? 'ai' : 'user',
          text: m.text,
          timestamp: m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
        })));
      } else {
        setMessages([{
          id: 1, role: 'ai',
          text: 'Hello! I am Study Bot, your AI academic assistant. What topic should we dive into today?',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);
      }
    } catch (error) {
      console.error("Failed to fetch session history:", error);
    }
    if (window.innerWidth <= 768) setSidebarOpen(false);
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userText = input;
    const newUserMsg = {
      id: Date.now(),
      role: 'user',
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, newUserMsg]);
    setInput('');
    setIsTyping(true);

    try {
      // Connect to our new backend API
      const response = await axios.post('http://localhost:8000/api/chat', {
        sessionId: currentSessionId,
        message: userText
      });

      const responseText = response.data.response || "No response received";

      const newAiMsg = {
        id: Date.now() + 1,
        role: 'ai',
        text: responseText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, newAiMsg]);
    } catch (error) {
      console.error("Backend API Error:", error);
      const errorMsg = {
        id: Date.now() + 1,
        role: 'ai',
        text: `Error connecting to Study Bot Backend: ${error.message}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="layout-container">
      {/* Sidebar Overlay for Mobile */}
      {!sidebarOpen && (
        <button className="sidebar-toggle mobile-only" onClick={() => setSidebarOpen(true)}>
          <Menu size={24} />
        </button>
      )}

      {/* Sidebar */}
      <aside className={`sidebar glass-panel ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <div className="brand">
            <div className="brand-logo" style={{ background: 'linear-gradient(135deg, #10b981, #3b82f6)' }}>
              <BookOpen size={20} color="#fff" />
            </div>
            <h1 className="heading text-gradient" style={{ background: 'linear-gradient(135deg, #10b981, #3b82f6)', WebkitBackgroundClip: 'text' }}>Study Bot</h1>
          </div>
          <button className="icon-btn" onClick={() => setSidebarOpen(false)}>
            <Menu size={20} />
          </button>
        </div>

        <button className="new-chat-btn" onClick={createNewSession}>
          <Plus size={18} />
          <span>New Study Session</span>
        </button>

        <div className="history-section">
          <p className="section-title">Recent</p>
          <div className="history-list">
            {sessions.length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '10px' }}>No past sessions yet.</p>
            ) : (
              sessions.map(session => (
                <div
                  key={session.id}
                  className={`history-item ${session.id === currentSessionId ? 'active' : ''}`}
                  onClick={() => loadSession(session.id)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                    <MessageSquare size={16} style={{ flexShrink: 0 }} />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '13px' }}>
                      {session.name}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      onClick={(e) => handleRenameSession(e, session.id)}
                      style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: '4px', display: 'flex' }}
                      title="Rename Session"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={(e) => handleDeleteSession(e, session.id)}
                      style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', display: 'flex' }}
                      title="Delete Session"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="sidebar-footer">
          <button className="settings-btn" onClick={() => alert("Settings panel implementation would open here.")}>
            <Settings size={18} />
            <span>Settings</span>
          </button>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="chat-area">
        <header className="chat-header glass-panel">
          <h2>Study Bot Session</h2>
          <div className="header-status">
            <div className="status-dot"></div>
            <span>Connected</span>
          </div>
        </header>

        <div className="messages-container">
          {messages.map((msg) => (
            <div key={msg.id} className={`message-wrapper ${msg.role} animate-fade-in`}>
              <div className="message-avatar">
                {msg.role === 'ai' ? (
                  <div className="ai-avatar">
                    <Bot size={20} />
                  </div>
                ) : (
                  <div className="user-avatar">
                    <User size={20} />
                  </div>
                )}
              </div>
              <div className="message-content glass-panel" style={{ position: 'relative' }}>
                {msg.role === 'ai' ? (
                  <>
                    <button
                      onClick={() => handleCopy(msg.id, msg.text)}
                      className="copy-button"
                      style={{
                        position: 'absolute', top: '10px', right: '10px',
                        background: 'rgba(255,255,255,0.1)', border: 'none',
                        color: copiedId === msg.id ? '#10b981' : 'var(--text-muted)',
                        borderRadius: '6px', padding: '6px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', transition: 'all 0.2s', zIndex: 5
                      }}
                      title="Copy response"
                    >
                      {copiedId === msg.id ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                    <div style={{ paddingTop: '10px' }} className="markdown-body">
                      <ReactMarkdown
                        rehypePlugins={[rehypeHighlight]}
                        components={{ code: CodeBlock }}
                      >
                        {msg.text}
                      </ReactMarkdown>
                    </div>
                  </>
                ) : (
                  <p>{msg.text}</p>
                )}
                <span className="timestamp">{msg.timestamp}</span>
              </div>
            </div>
          ))}

          {isTyping && (
            <div className={`message-wrapper ai animate-fade-in`}>
              <div className="message-avatar">
                <div className="ai-avatar">
                  <Bot size={20} />
                </div>
              </div>
              <div className="message-content glass-panel typing-indicator">
                <div className="dot"></div>
                <div className="dot"></div>
                <div className="dot"></div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="input-area-container">
          <div className="input-box glass-panel">
            <textarea
              className="chat-input"
              placeholder="Ask Study Bot about your assignments..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              rows="1"
            />
            <button
              className={`send-btn ${input.trim() ? 'active' : ''}`}
              onClick={handleSend}
              disabled={!input.trim()}
            >
              <Send size={18} />
            </button>
          </div>
          <p className="footer-text">Study Bot helps you learn, but consider verifying academic facts.</p>
        </div>
      </main>
    </div>
  );
}

export default App;
